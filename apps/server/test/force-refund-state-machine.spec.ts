import { buildTestContext, Seeder, TestContext, refundNotify } from './helpers'
import { HuifuPayService } from '../src/modules/payment/huifu-pay.service'
import { ApprovalService } from '../src/modules/approval/approval.service'
import { ApprovalFlowService } from '../src/modules/approval/approval-flow.service'
import { StockService } from '../src/modules/scm/stock.service'
import { RedisService } from '../src/common/redis.service'
import { BusinessException } from '../src/common/exceptions/business.exception'

/**
 * 后台强制退款状态机（order_refunds 流水驱动）：
 * - 受理中/待确认（PROCESSING/UNKNOWN）不允许重复发起（4025）；
 * - 累计已退以 SUCCESS 流水为准，超额直接拒绝（4026），不再静默截断；
 * - 部分退款到账 → 订单回退退款前状态，不释放名额；累计退满 → 整单结清并释放名额；
 * - 网关明确拒绝（5105/5106）→ 流水 FAILED，订单回退，可用新流水号重新发起；
 * - 网络异常 → 流水 UNKNOWN，订单保持 REFUNDING，人工「重试」（同流水号幂等）或「确认失败」；
 * - 同一订单已有待审批的强制退款申请时，重复提交审批被拦截（4028）。
 */
describe('强制退款状态机与异常场景', () => {
  let ctx: TestContext
  let seeder: Seeder
  let huifu: any
  let defaultRefund: (...args: any[]) => Promise<any>
  const instanceIds: string[] = []

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    huifu = ctx.moduleRef.get(HuifuPayService)
    defaultRefund = huifu.refund
  })

  afterAll(async () => {
    await ctx.prisma.approvalInstance.deleteMany({ where: { id: { in: instanceIds } } })
    await seeder.cleanup()
    await ctx.app.close()
  })

  afterEach(() => {
    huifu.refund = defaultRefund
  })

  /** 距当前 N 小时开课，startDate/startTime 对齐 */
  function timing(hoursAhead: number) {
    const start = new Date(Date.now() + hoursAhead * 3600 * 1000)
    const end = new Date(start.getTime() + 3600 * 1000)
    const clock = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return { startDate: start, endDate: end, startTime: clock(start), endTime: clock(end) }
  }

  /** 100 元已支付课程订单（分口径：actualPaid 10000） */
  async function paidCourseOrder(userId: string, hoursAhead = 48) {
    const course = await seeder.course({
      ...timing(hoursAhead),
      maxCapacity: 5,
      originalPrice: 10000,
      refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 100 }],
    })
    const res = await ctx.enrollment.enroll(course.id, userId, {})
    await ctx.payment.fulfillPaidOrder(res.orderId, 'TX_TEST')
    // enroll 后 currentEnrolled = 1；整单结清后应回到 0
    return { course, orderId: res.orderId }
  }

  const getOrder = (id: string) => ctx.prisma.order.findUnique({ where: { id } })
  const refundsOf = (orderId: string, outRefundNo?: string) =>
    ctx.prisma.orderRefund.findFirst({
      where: outRefundNo ? { orderId, outRefundNo } : { orderId },
      orderBy: { createdAt: 'desc' },
    })

  it('受理中的退款流水阻止重复发起，台账可见处理中状态', async () => {
    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)

    await ctx.payment.forceRefund(orderId, 30, '部分退款')
    // 受理中再次发起（无论全额或部分）均被拦截
    await expect(ctx.payment.forceRefund(orderId)).rejects.toMatchObject({ bizCode: 4025 })
    await expect(ctx.payment.forceRefund(orderId, 10, '重复提交')).rejects.toMatchObject({
      bizCode: 4025,
    })

    const summary = await ctx.payment.refundSummary(orderId)
    expect(summary.canForceRefund).toBe(false)
    expect(summary.activeRefundId).toBeTruthy()
    expect(summary.refunds).toHaveLength(1)
    expect(summary.refunds[0].status).toBe('PROCESSING')
    expect(summary.refunds[0].amountYuan).toBe('30.00')
    expect((await getOrder(orderId))!.status).toBe('REFUNDING')
  })

  it('部分退款到账后订单回退退款前状态，不释放名额，可再发起', async () => {
    const user = await seeder.user()
    const { course, orderId } = await paidCourseOrder(user.id)

    await ctx.payment.forceRefund(orderId, 30, '部分退款')
    await ctx.payment.handleRefundNotify(refundNotify(orderId, 'TX_TEST', `RF${orderId}`))

    const order = await getOrder(orderId)
    expect(order!.status).toBe('PAID')
    expect(Number(order!.refundAmount)).toBe(3000)
    expect((await refundsOf(orderId))!.status).toBe('SUCCESS')
    // 部分退款不释放名额
    expect((await ctx.prisma.course.findUnique({ where: { id: course.id } }))!.currentEnrolled).toBe(1)

    const summary = await ctx.payment.refundSummary(orderId)
    expect(summary.refundedFen).toBe(3000)
    expect(summary.remainingFen).toBe(7000)
    expect(summary.canForceRefund).toBe(true)
  })

  it('部分+部分累计全退触发整单结清；中途超额被拒绝', async () => {
    const user = await seeder.user()
    const { course, orderId } = await paidCourseOrder(user.id)

    // 第一笔部分退 30 元
    await ctx.payment.forceRefund(orderId, 30, '第一次部分退款')
    await ctx.payment.handleRefundNotify(refundNotify(orderId, 'TX_TEST', `RF${orderId}`))
    expect((await getOrder(orderId))!.status).toBe('PAID')

    // 第二笔尝试超额（剩余 70 元却申请 80 元）→ 直接拒绝
    await expect(ctx.payment.forceRefund(orderId, 80, '超额尝试')).rejects.toMatchObject({
      bizCode: 4026,
    })

    // 第二笔部分退 60 元：流水号顺延 _2
    await ctx.payment.forceRefund(orderId, 60, '第二次部分退款')
    expect((await refundsOf(orderId))!.outRefundNo).toBe(`RF${orderId}_2`)
    await ctx.payment.handleRefundNotify(refundNotify(orderId, 'TX_TEST', `RF${orderId}_2`))
    const mid = await getOrder(orderId)
    expect(mid!.status).toBe('PAID')
    expect(Number(mid!.refundAmount)).toBe(9000)

    // 第三笔退剩余全部 10 元：累计退满 → 整单 REFUNDED 并释放名额
    await ctx.payment.forceRefund(orderId, undefined, '退清剩余')
    expect((await refundsOf(orderId))!.outRefundNo).toBe(`RF${orderId}_3`)
    await ctx.payment.handleRefundNotify(refundNotify(orderId, 'TX_TEST', `RF${orderId}_3`))

    const done = await getOrder(orderId)
    expect(done!.status).toBe('REFUNDED')
    expect(Number(done!.refundAmount)).toBe(10000)
    expect((await ctx.prisma.course.findUnique({ where: { id: course.id } }))!.currentEnrolled).toBe(0)

    // 全部退完后订单已 REFUNDED，不可再发起（状态校验先行）
    await expect(ctx.payment.forceRefund(orderId)).rejects.toMatchObject({ bizCode: 4007 })
  })

  it('网关明确拒绝（5106）：流水 FAILED、订单回退，可用新流水号立即重新发起', async () => {
    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)

    huifu.refund = async () => {
      throw new BusinessException('退款申请失败', 5106)
    }

    await expect(ctx.payment.forceRefund(orderId, undefined, '首次尝试')).rejects.toMatchObject({
      bizCode: 5106,
    })
    const failed = await refundsOf(orderId)
    expect(failed!.status).toBe('FAILED')
    expect(failed!.failCode).toBe('5106')
    expect((await getOrder(orderId))!.status).toBe('PAID')

    // FAILED 流水不可重试/确认失败
    await expect(ctx.payment.retryRefund(orderId, failed!.id)).rejects.toMatchObject({ bizCode: 4027 })
    await expect(ctx.payment.confirmRefundFailed(orderId, failed!.id)).rejects.toMatchObject({
      bizCode: 4027,
    })

    // 网关恢复后重新发起：新流水号 _2
    huifu.refund = defaultRefund
    const res = await ctx.payment.forceRefund(orderId, undefined, '重新发起')
    expect(res.refundAmount).toBe(100)
    const second = await refundsOf(orderId, `RF${orderId}_2`)
    expect(second!.status).toBe('PROCESSING')
    expect((await getOrder(orderId))!.status).toBe('REFUNDING')

    await ctx.payment.handleRefundNotify(refundNotify(orderId, 'TX_TEST', `RF${orderId}_2`))
    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
  })

  it('网络异常（UNKNOWN）：人工确认失败后订单回退，重新发起新流水', async () => {
    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)

    huifu.refund = async () => {
      throw new Error('ETIMEDOUT')
    }
    await expect(ctx.payment.forceRefund(orderId, undefined, '网络异常')).rejects.toMatchObject({
      bizCode: 5107,
    })

    const unknown = await refundsOf(orderId)
    expect(unknown!.status).toBe('UNKNOWN')
    expect((await getOrder(orderId))!.status).toBe('REFUNDING')
    // UNKNOWN 期间不允许再次发起
    await expect(ctx.payment.forceRefund(orderId)).rejects.toMatchObject({ bizCode: 4025 })

    // 人工核对后确认网关未退款
    await ctx.payment.confirmRefundFailed(orderId, unknown!.id)
    expect((await refundsOf(orderId))!.status).toBe('CANCELLED')
    const restored = await getOrder(orderId)
    expect(restored!.status).toBe('PAID')
    expect(restored!.refundAmount).toBeNull()

    // 确认失败后可正常重新发起并完成退款
    huifu.refund = defaultRefund
    const res = await ctx.payment.forceRefund(orderId, undefined, '重新发起')
    expect(res.refundAmount).toBe(100)
    expect((await refundsOf(orderId))!.outRefundNo).toBe(`RF${orderId}_2`)
    await ctx.payment.handleRefundNotify(refundNotify(orderId, 'TX_TEST', `RF${orderId}_2`))
    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
  })

  it('网络异常（UNKNOWN）：重试走同一流水号（幂等），成功回调后整单结清', async () => {
    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)

    huifu.refund = async () => {
      throw new Error('ECONNRESET')
    }
    await expect(ctx.payment.forceRefund(orderId, undefined, '网络异常')).rejects.toMatchObject({
      bizCode: 5107,
    })
    const unknown = await refundsOf(orderId)
    expect(unknown!.status).toBe('UNKNOWN')

    // 网关恢复后人工重试：同一 outRefundNo 再次送网关（汇付按 req_seq_id 幂等）
    huifu.refund = defaultRefund
    const retried = await ctx.payment.retryRefund(orderId, unknown!.id, { name: '运营管理员' })
    expect(retried.retried).toBe(true)
    const after = await refundsOf(orderId)
    expect(after!.status).toBe('PROCESSING')
    expect(after!.attempts).toBe(2)
    expect(after!.outRefundNo).toBe(unknown!.outRefundNo)

    // 重试后回调结算：全额退 → REFUNDED
    await ctx.payment.handleRefundNotify(
      refundNotify(orderId, 'TX_TEST', unknown!.outRefundNo),
    )
    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
    expect((await refundsOf(orderId))!.status).toBe('SUCCESS')
  })

  it('同一订单已有待审批的强制退款申请时，重复提交审批被拦截（4028）', async () => {
    const redis = ctx.moduleRef.get(RedisService)
    const approval = new ApprovalService(
      ctx.prisma,
      redis,
      new ApprovalFlowService(ctx.prisma),
      ctx.payment,
      new StockService(ctx.prisma),
    )
    const first = await ctx.prisma.adminUser.findUnique({ where: { username: '13900000011' } })
    expect(first).toBeTruthy()

    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)

    const instance = await approval.submit({
      bizType: 'ORDER_FORCE_REFUND',
      bizId: orderId,
      summary: `强制退款订单 ${orderId}`,
      amount: 1,
      requesterId: first!.id,
      payload: { orderId, refundAmount: 1, reason: '客诉特殊退款' },
    })
    expect(instance).toBeTruthy()
    instanceIds.push(instance!.id)

    // 未处理完前，同订单再次提交审批被拦截
    await expect(
      approval.submit({
        bizType: 'ORDER_FORCE_REFUND',
        bizId: orderId,
        summary: `强制退款订单 ${orderId}`,
        amount: 1,
        requesterId: first!.id,
        payload: { orderId, refundAmount: 1, reason: '重复提交' },
      }),
    ).rejects.toMatchObject({ bizCode: 4028 })

    // 直接绕过审批发起退款同样被待审批状态保护吗？
    // —— 后台直发退款不检查审批（允许先审批后直发以外的人工路径），
    //    但受理中流水仍会拦截重复发起，此处验证订单未受重复提交影响。
    expect((await getOrder(orderId))!.status).toBe('PAID')
  })
})
