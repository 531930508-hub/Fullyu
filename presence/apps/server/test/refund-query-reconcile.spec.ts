import { buildTestContext, Seeder, TestContext } from './helpers'
import { HuifuPayService } from '../src/modules/payment/huifu-pay.service'
import { RefundReconcileTasksService } from '../src/modules/payment/refund-reconcile.tasks.service'

/**
 * 退款回调丢失后的兜底：主动查询网关结果、旧版退款补录与确认失败、自动对账。
 *
 * 背景：汇付退款异步通知可能丢失，订单会长期停在 REFUNDING；
 * 本次改造前发起的自助/系统退款没有 order_refunds 流水，后台也无从操作。
 */
describe('退款主动查询与自动对账', () => {
  let ctx: TestContext
  let seeder: Seeder
  let huifu: any
  let defaultRefund: (...args: any[]) => Promise<any>
  let defaultQueryRefund: (...args: any[]) => Promise<any>

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    huifu = ctx.moduleRef.get(HuifuPayService)
    defaultRefund = huifu.refund
    defaultQueryRefund = huifu.queryRefund
  })

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.app.close()
  })

  afterEach(() => {
    huifu.refund = defaultRefund
    huifu.queryRefund = defaultQueryRefund
  })

  /** 距当前 N 小时开课，确保命中「开课前全额退」规则 */
  function timing(hoursAhead: number) {
    const start = new Date(Date.now() + hoursAhead * 3600 * 1000)
    const end = new Date(start.getTime() + 3600 * 1000)
    const clock = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return { startDate: start, endDate: end, startTime: clock(start), endTime: clock(end) }
  }

  async function paidCourseOrder(userId: string, hoursAhead = 48) {
    const course = await seeder.course({
      ...timing(hoursAhead),
      maxCapacity: 5,
      originalPrice: 10000,
      refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 100 }],
    })
    const res = await ctx.enrollment.enroll(course.id, userId, {})
    await ctx.payment.fulfillPaidOrder(res.orderId, 'TX_TEST')
    return { course, orderId: res.orderId }
  }

  const getOrder = (id: string) => ctx.prisma.order.findUnique({ where: { id } })
  const getRows = (orderId: string) =>
    ctx.prisma.orderRefund.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } })

  /** 模拟旧版退款：订单直接停在 REFUNDING，且没有任何退款流水 */
  async function legacyRefundingOrder() {
    const user = await seeder.user()
    const { course, orderId } = await paidCourseOrder(user.id)
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { status: 'REFUNDING', refundAmount: 10000, cancelReason: '用户取消预约' },
    })
    return { course, orderId }
  }

  it('自助退款网络异常时落 UNKNOWN 流水，主动查询成功后可结算', async () => {
    const user = await seeder.user()
    const { course, orderId } = await paidCourseOrder(user.id)

    huifu.refund = async () => {
      throw new Error('ETIMEDOUT')
    }
    await expect(ctx.payment.refundOrder(orderId, '用户取消预约')).rejects.toMatchObject({
      bizCode: 5107,
    })
    let rows = await getRows(orderId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('UNKNOWN')
    expect(rows[0].source).toBe('SELF_SERVICE')
    expect((await getOrder(orderId))!.status).toBe('REFUNDING')

    huifu.queryRefund = async ({ outRefundNo }: any) => ({
      status: 'SUCCESS',
      gatewayRef: `HF_${outRefundNo}`,
      amountFen: 10000,
      respCode: '00000000',
      respDesc: '成功',
    })
    const result = await ctx.payment.queryRefundStatus(orderId, rows[0].id)
    expect(result.status).toBe('SUCCESS')
    expect(result.orderStatus).toBe('REFUNDED')

    const order = await getOrder(orderId)
    expect(order!.status).toBe('REFUNDED')
    expect(order!.refundTime).toBeTruthy()
    // 整单退款释放名额
    expect(
      (await ctx.prisma.course.findUnique({ where: { id: course!.id } }))!.currentEnrolled,
    ).toBe(0)

    rows = await getRows(orderId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('SUCCESS')
    expect(rows[0].gatewayRef).toBe(`HF_${rows[0].outRefundNo}`)
    expect(rows[0].settledAt).toBeTruthy()
  })

  it('旧版退款无流水：查询成功时补建流水并结算整单', async () => {
    const { course, orderId } = await legacyRefundingOrder()
    expect(await getRows(orderId)).toHaveLength(0)

    huifu.queryRefund = async () => ({
      status: 'SUCCESS',
      gatewayRef: 'HF_LEGACY',
      amountFen: 10000,
      respCode: '00000000',
      respDesc: '成功',
    })
    const result = await ctx.payment.queryRefundStatus(orderId)
    expect(result.status).toBe('SUCCESS')
    expect(result.outRefundNo).toBe(`RF${orderId}`)
    expect(result.orderStatus).toBe('REFUNDED')

    const rows = await getRows(orderId)
    expect(rows).toHaveLength(1)
    expect(rows[0].outRefundNo).toBe(`RF${orderId}`)
    expect(rows[0].amountFen).toBe(10000)
    expect(rows[0].status).toBe('SUCCESS')
    expect(rows[0].gatewayRef).toBe('HF_LEGACY')
    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
    expect(
      (await ctx.prisma.course.findUnique({ where: { id: course!.id } }))!.currentEnrolled,
    ).toBe(0)
  })

  it('网关查不到退款时保持退款中，补建待确认流水交由人工判断', async () => {
    const { orderId } = await legacyRefundingOrder()
    huifu.queryRefund = async () => ({
      status: 'NOT_FOUND',
      respCode: '23000001',
      respDesc: '原交易不存在',
    })

    const result = await ctx.payment.queryRefundStatus(orderId)
    expect(result.status).toBe('NOT_FOUND')
    expect(result.orderStatus).toBe('REFUNDING')
    expect((await getOrder(orderId))!.status).toBe('REFUNDING')

    const rows = await getRows(orderId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('UNKNOWN')
    expect(rows[0].failMessage).toContain('未查询到')
  })

  it('网关确认退款失败时流水置 FAILED，订单回退为已支付', async () => {
    const { orderId } = await legacyRefundingOrder()
    huifu.queryRefund = async () => ({
      status: 'FAIL',
      respCode: '00000000',
      respDesc: '退款失败',
    })

    const result = await ctx.payment.queryRefundStatus(orderId)
    expect(result.status).toBe('FAIL')
    expect(result.orderStatus).toBe('PAID')
    expect((await getOrder(orderId))!.status).toBe('PAID')

    const rows = await getRows(orderId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('FAILED')
    expect(rows[0].failCode).toBe('GATEWAY_FAIL')
  })

  it('旧版退款可人工确认未发生：作废流水并回退订单，随后可重新发起', async () => {
    const { orderId } = await legacyRefundingOrder()
    const result = await ctx.payment.confirmRefundFailed(orderId)
    expect(result.confirmed).toBe(true)

    const order = await getOrder(orderId)
    expect(order!.status).toBe('PAID')
    expect(Number(order!.refundAmount)).toBe(0)

    const rows = await getRows(orderId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('CANCELLED')
    expect(rows[0].failCode).toBe('MANUAL_CONFIRM')

    // 回退后可重新发起退款
    const res = await ctx.payment.refundOrder(orderId, '重新发起退款')
    expect(res.refundAmount).toBe(10000)
    expect((await getOrder(orderId))!.status).toBe('REFUNDING')
    expect((await getRows(orderId)).map((r) => r.status)).toEqual(['CANCELLED', 'PROCESSING'])
  })

  it('自动对账会挑选长时间未更新的进行中流水并结算', async () => {
    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)
    const stale = new Date(Date.now() - 60 * 60 * 1000)
    const row = await ctx.prisma.orderRefund.create({
      data: {
        orderId,
        outRefundNo: `RF${orderId}`,
        amountFen: 10000,
        status: 'PROCESSING',
        source: 'SELF_SERVICE',
        prevOrderStatus: 'PAID',
        reason: '回调丢失',
        createdAt: stale,
        updatedAt: stale,
      },
    })
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { status: 'REFUNDING', refundAmount: 10000 },
    })

    huifu.queryRefund = async () => ({
      status: 'SUCCESS',
      gatewayRef: 'HF_RECONCILE',
      amountFen: 10000,
      respCode: '00000000',
      respDesc: '成功',
    })

    // 只把本用例的流水交给任务，避免共享测试库里的其他存量数据被扫描结算
    const scopedPrisma: any = {
      orderRefund: {
        findMany: async () => [
          { id: row.id, orderId, outRefundNo: `RF${orderId}` },
        ],
      },
      order: { findMany: async () => [] },
    }
    const fakePayment: any = {
      queryRefundStatus: async (targetOrderId: string, refundId?: string) =>
        ctx.payment.queryRefundStatus(targetOrderId, refundId),
    }
    const tasks = new RefundReconcileTasksService(scopedPrisma, fakePayment)
    await tasks.reconcilePendingRefunds()

    const settled = await ctx.prisma.orderRefund.findUnique({ where: { id: row.id } })
    expect(settled!.status).toBe('SUCCESS')
    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
  })
})
