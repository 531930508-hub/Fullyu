import { buildTestContext, Seeder, TestContext } from './helpers'
import { OrderService } from '../src/modules/order/order.service'
import { BusinessException } from '../src/common/exceptions/business.exception'

/**
 * 自助取消退款预览：
 * - 阶梯规则下返回精确可退金额（与实际退款同口径），不动单
 * - 开课后的课程订单直接拒绝
 * - 候补订单预览为全额退
 */
describe('PaymentService/OrderService 退款预览', () => {
  let ctx: TestContext
  let seeder: Seeder
  let orderService: OrderService

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    orderService = ctx.moduleRef.get(OrderService)
  })

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.app.close()
  })

  /** 按目标时刻反推所属日期（0点）+ 钟点，生成生产口径的 startDate/startTime；endDate 给到次日 */
  function courseAt(target: Date) {
    const day = new Date(target)
    day.setHours(0, 0, 0, 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      startDate: day,
      endDate: new Date(day.getTime() + 24 * 3600 * 1000),
      startTime: `${pad(target.getHours())}:${pad(target.getMinutes())}`,
    }
  }

  async function paidCourseOrder(
    userId: string,
    opts: { startDate: Date; endDate?: Date; startTime: string },
  ) {
    const course = await seeder.course({
      status: 'PUBLISHED',
      startDate: opts.startDate,
      // 不传 endDate 时 seeder 默认 startDate+1h，会让 endTime 落到开课当天并早于当前时刻，
      // 导致课程在报名前就被判为已结束；这里沿用 courseAt 给出的次日结束日期。
      endDate: opts.endDate,
      startTime: opts.startTime,
      maxCapacity: 5,
      originalPrice: 10000,
      refundRules: [
        { hoursFrom: 24, hoursTo: null, refundPercent: 100 },
        { hoursFrom: 2, hoursTo: 24, refundPercent: 50 },
        { hoursFrom: 0, hoursTo: 2, refundPercent: 0 },
      ],
    })
    const res = await ctx.enrollment.enroll(course.id, userId, {})
    await ctx.payment.fulfillPaidOrder(res.orderId, 'TX_TEST')
    return { course, orderId: res.orderId }
  }

  it('阶梯窗口内返回精确可退金额，且不动单', async () => {
    const user = await seeder.user()
    const clock = new Date(Date.now() + 10 * 3600 * 1000) // 10 小时后开课 → 50% 档
    const { orderId } = await paidCourseOrder(user.id, courseAt(clock))

    const preview = await orderService.refundPreview(orderId, user.id)
    expect(preview.fullRefund).toBe(false)
    expect(preview.totalFen).toBe(10000)
    expect(preview.refundFen).toBe(5000)
    expect(preview.percent).toBe(50)

    // 预览不改变订单状态
    const order = await ctx.prisma.order.findUnique({ where: { id: orderId } })
    expect(order!.status).toBe('PAID')
    expect(Number(order!.refundAmount)).toBe(0)
  })

  it('开课后的订单预览被拒绝（不进入退款流程）', async () => {
    const user = await seeder.user()
    // 先按可报名的时间下单支付，再把课程改期到 2 小时前（开课后无法直接报名）
    const future = new Date(Date.now() + 10 * 3600 * 1000)
    const { course, orderId } = await paidCourseOrder(user.id, courseAt(future))
    const started = courseAt(new Date(Date.now() - 2 * 3600 * 1000))
    await ctx.prisma.course.update({
      where: { id: course.id },
      data: { startDate: started.startDate, startTime: started.startTime },
    })

    await expect(orderService.refundPreview(orderId, user.id)).rejects.toMatchObject({
      bizCode: 4007,
    })
    const order = await ctx.prisma.order.findUnique({ where: { id: orderId } })
    expect(order!.status).toBe('PAID')
  })

  it('候补订单预览为全额退', async () => {
    const user = await seeder.user()
    const d = new Date(Date.now() + 72 * 3600 * 1000)
    const course = await seeder.course({
      status: 'PUBLISHED',
      startDate: d,
      maxCapacity: 1,
      currentEnrolled: 1, // 已满 → 候补
      originalPrice: 10000,
    })
    const join = await ctx.waitlist.join(course.id, user.id)
    await ctx.payment.fulfillPaidOrder(join.orderId, 'TX_TEST')

    const preview = await orderService.refundPreview(join.orderId, user.id)
    expect(preview.fullRefund).toBe(true)
    expect(preview.refundFen).toBe(preview.totalFen)
  })

  it('非本人订单不可预览', async () => {
    const owner = await seeder.user()
    const other = await seeder.user()
    const clock = new Date(Date.now() + 10 * 3600 * 1000)
    const { orderId } = await paidCourseOrder(owner.id, courseAt(clock))
    await expect(orderService.refundPreview(orderId, other.id)).rejects.toBeInstanceOf(
      BusinessException,
    )
  })
})
