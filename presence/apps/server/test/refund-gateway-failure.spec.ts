import { buildTestContext, Seeder, TestContext } from './helpers'
import { HuifuPayService } from '../src/modules/payment/huifu-pay.service'
import { BusinessException } from '../src/common/exceptions/business.exception'

/**
 * 退款网关失败时的订单状态一致性。
 *
 * 背景：真实环境自助退款曾出现「汇付返回缺少交易流水」后订单被置为 REFUNDING
 * 却没有任何退款动作，用户既拿不到钱也无法再次发起退款。
 * 规则：
 * - 网关「明确拒绝」（缺少流水 5105 / 受理失败 5106）→ 订单回退到退款前状态，允许重试；
 * - 网络等无法确认是否受理的异常 → 保守保留 REFUNDING，避免重复退款，由后台核对。
 */
describe('退款网关失败时的订单状态一致性', () => {
  let ctx: TestContext
  let seeder: Seeder
  let huifu: any
  let defaultRefund: (...args: any[]) => Promise<any>

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    huifu = ctx.moduleRef.get(HuifuPayService)
    defaultRefund = huifu.refund
  })

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.app.close()
  })

  afterEach(() => {
    huifu.refund = defaultRefund
  })

  /** 距当前 N 小时开课，startDate/startTime 对齐，确保命中「开课前全额退」规则 */
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

  it('汇付明确拒绝退款时，订单回退为 PAID 并可再次发起退款', async () => {
    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)
    const before = await getOrder(orderId)
    expect(before!.status).toBe('PAID')

    huifu.refund = async () => {
      throw new BusinessException('退款申请失败', 5106)
    }

    await expect(ctx.payment.refundOrder(orderId, '用户取消预约')).rejects.toMatchObject({
      bizCode: 5106,
    })
    const after = await getOrder(orderId)
    expect(after!.status).toBe('PAID')
    expect(Number(after!.refundAmount)).toBe(Number(before!.refundAmount))
    expect(after!.cancelReason).toBe(before!.cancelReason)

    // 恢复网关后可以正常完成退款
    huifu.refund = defaultRefund
    const res = await ctx.payment.refundOrder(orderId, '用户取消预约')
    expect(res.refundAmount).toBe(10000)
    expect((await getOrder(orderId))!.status).toBe('REFUNDING')
  })

  it('缺少汇付交易流水（5105）时订单不得卡在 REFUNDING', async () => {
    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)

    huifu.refund = async () => {
      throw new BusinessException('订单缺少汇付交易流水，无法退款', 5105)
    }

    await expect(ctx.payment.refundOrder(orderId, '用户取消预约')).rejects.toMatchObject({
      bizCode: 5105,
    })
    expect((await getOrder(orderId))!.status).toBe('PAID')
  })

  it('无法确认网关是否受理（网络异常）时保留 REFUNDING，避免重复退款', async () => {
    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)

    huifu.refund = async () => {
      throw new Error('ETIMEDOUT')
    }

    await expect(ctx.payment.refundOrder(orderId, '用户取消预约')).rejects.toMatchObject({
      bizCode: 5107,
    })
    const after = await getOrder(orderId)
    expect(after!.status).toBe('REFUNDING')
    expect(Number(after!.refundAmount)).toBe(10000)
  })

  it('候补取消退款被网关拒绝时，订单回退 PAID 且候补条目保持 WAITING', async () => {
    const course = await seeder.course({
      ...timing(48),
      maxCapacity: 1,
      currentEnrolled: 1,
      originalPrice: 10000,
    })
    const user = await seeder.user()
    const joined = await ctx.waitlist.join(course.id, user.id)
    await ctx.payment.fulfillPaidOrder(joined.orderId, 'TX_TEST')
    const entry = await ctx.prisma.waitlistEntry.findFirst({
      where: { orderId: joined.orderId },
    })
    expect(entry!.status).toBe('WAITING')

    huifu.refund = async () => {
      throw new BusinessException('退款申请失败', 5106)
    }

    await expect(ctx.order.cancelOrder(joined.orderId, user.id, '用户取消候补')).rejects.toMatchObject(
      { bizCode: 5106 },
    )
    expect((await getOrder(joined.orderId))!.status).toBe('PAID')
    expect(
      (await ctx.prisma.waitlistEntry.findFirst({ where: { orderId: joined.orderId } }))!.status,
    ).toBe('WAITING')
  })

  it('后台强制退款被网关拒绝时，已完成订单回退 COMPLETED', async () => {
    const user = await seeder.user()
    const { orderId } = await paidCourseOrder(user.id)
    await ctx.prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETED' } })

    huifu.refund = async () => {
      throw new BusinessException('退款申请失败', 5106)
    }

    await expect(ctx.payment.forceRefund(orderId, undefined, '客诉线下处理')).rejects.toMatchObject({
      bizCode: 5106,
    })
    const after = await getOrder(orderId)
    expect(after!.status).toBe('COMPLETED')
  })
})
