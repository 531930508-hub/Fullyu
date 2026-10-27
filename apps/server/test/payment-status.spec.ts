import { buildTestContext, Seeder, TestContext } from './helpers'
import { BusinessException } from '../src/common/exceptions/business.exception'

/**
 * 小程序支付结果查询接口。
 *
 * 背景：已发布的小程序在拉起微信支付后会请求 `GET /payment/status/:orderId`
 * 确认结果，再决定提示「报名成功」还是「支付未完成」。后端重构时该接口被移除，
 * 客户端拿到 404 后即便支付已成功也会提示「支付未完成」。
 * 规则：
 * - 仅本人订单可查，他人订单一律 4004，不泄露存在性；
 * - 返回订单当前状态与退款金额（元），支付决定以订单状态为准而不是客户端回调；
 * - 订单不存在同样 4004。
 */
describe('支付结果查询接口', () => {
  let ctx: TestContext
  let seeder: Seeder

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
  })

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.app.close()
  })

  function timing(hoursAhead: number) {
    const start = new Date(Date.now() + hoursAhead * 3600 * 1000)
    const end = new Date(start.getTime() + 3600 * 1000)
    const clock = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return { startDate: start, endDate: end, startTime: clock(start), endTime: clock(end) }
  }

  async function pendingCourseOrder(userId: string, price = 10000) {
    const course = await seeder.course({
      ...timing(48),
      maxCapacity: 5,
      originalPrice: price,
      refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 100 }],
    })
    const res = await ctx.enrollment.enroll(course.id, userId, {})
    return { course, orderId: res.orderId }
  }

  it('待支付订单返回 PENDING_PAYMENT，可据此继续支付', async () => {
    const user = await seeder.user()
    const { orderId } = await pendingCourseOrder(user.id)

    const res = await ctx.payment.queryStatus(orderId, user.id)

    expect(res.orderId).toBe(orderId)
    expect(res.status).toBe('PENDING_PAYMENT')
    expect(res.refundAmount).toBe(0)
  })

  it('支付成功后返回 PAID，客户端不应再提示支付未完成', async () => {
    const user = await seeder.user()
    const { orderId } = await pendingCourseOrder(user.id)
    await ctx.payment.fulfillPaidOrder(orderId, 'TX_STATUS')

    const res = await ctx.payment.queryStatus(orderId, user.id)

    expect(res.status).toBe('PAID')
    expect(res.refundAmount).toBe(0)
  })

  it('他人订单返回 4004，不泄露订单存在性', async () => {
    const owner = await seeder.user()
    const stranger = await seeder.user()
    const { orderId } = await pendingCourseOrder(owner.id)

    await expect(ctx.payment.queryStatus(orderId, stranger.id)).rejects.toMatchObject({
      bizCode: 4004,
    })
  })

  it('不存在的订单返回 4004', async () => {
    const user = await seeder.user()
    await expect(ctx.payment.queryStatus('not-exist-order', user.id)).rejects.toBeInstanceOf(
      BusinessException,
    )
  })

  it('支付回调略晚于客户端查询时，短暂等待后返回 PAID', async () => {
    const user = await seeder.user()
    const { orderId } = await pendingCourseOrder(user.id)
    // 模拟微信支付回调在客户端查询后约 700ms 才落库
    const late = setTimeout(() => {
      void ctx.payment.fulfillPaidOrder(orderId, 'TX_LATE')
    }, 700)

    const res = await ctx.payment.queryStatus(orderId, user.id)
    clearTimeout(late)

    expect(res.status).toBe('PAID')
  })

  it('确实未支付时等待窗口结束后返回 PENDING_PAYMENT', async () => {
    const user = await seeder.user()
    const { orderId } = await pendingCourseOrder(user.id)
    const started = Date.now()

    const res = await ctx.payment.queryStatus(orderId, user.id)

    expect(res.status).toBe('PENDING_PAYMENT')
    expect(Date.now() - started).toBeGreaterThanOrEqual(1500)
  }, 10000)

  it('取消后的订单返回 CANCELLED 与已退金额（元）', async () => {
    const user = await seeder.user()
    const { orderId } = await pendingCourseOrder(user.id)
    await ctx.order.cancelOrder(orderId, user.id, '用户取消待支付订单')

    const res = await ctx.payment.queryStatus(orderId, user.id)

    expect(res.status).toBe('CANCELLED')
    expect(res.refundAmount).toBe(0)
  })
})
