import {
  buildTestContext,
  Seeder,
  TestContext,
  createNotificationMock,
  payNotify,
  refundNotify,
} from './helpers'
import { HuifuPayService } from '../src/modules/payment/huifu-pay.service'
import { RedisService } from '../src/common/redis.service'
import { OrderTasksService } from '../src/modules/order/order-tasks.service'
import { CourseTasksService } from '../src/modules/course/course-tasks.service'

/**
 * 资金安全边界（课程 / 候补）：
 * - 0 元订单不得向支付网关下单「1 分钱」
 * - 课程取消后仍收到支付 → 自动退款且不占名额、不递补
 * - 退款回调只处理退款中/已支付订单，不得污染待支付、已取消订单
 * - 并发重复退款只允许一次网关请求
 * - 已取消课程不得再递补候补
 * - 待支付超时取消回补积分/券/候补条目
 * - 未成行退款覆盖候补预付；候补转正后退款可继续递补
 */
describe('资金安全边界：课程与候补', () => {
  let ctx: TestContext
  let seeder: Seeder
  let huifu: any
  let orderTasks: OrderTasksService
  let courseTasks: CourseTasksService

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    huifu = ctx.moduleRef.get(HuifuPayService)
    const redis = ctx.moduleRef.get(RedisService)
    orderTasks = new OrderTasksService(ctx.prisma, redis)
    courseTasks = new CourseTasksService(
      ctx.prisma,
      ctx.payment,
      createNotificationMock() as any,
    )
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

  const getOrder = (id: string) => ctx.prisma.order.findUnique({ where: { id } })
  const getCourse = (id: string) => ctx.prisma.course.findUnique({ where: { id } })

  function makeVoucher(userId: string, courseId: string, amountYuan = 1) {
    return ctx.prisma.voucher.create({
      data: {
        userId,
        mode: 'REDUCE_BY',
        amount: amountYuan,
        applicableCourseIds: [courseId],
        applicableAll: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        status: 'UNUSED',
        source: '测试发放',
      },
    })
  }

  it('0 元订单不调用支付网关，直接完成支付并占座', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 100, allowDeduction: true })
    const user = await seeder.user({ openId: true })
    await seeder.addPoints(user.id, 1)

    const { orderId, actualPaid } = await ctx.enrollment.enroll(course.id, user.id, { usePoints: 1 })
    expect(actualPaid).toBe(0)

    const createSpy = jest.spyOn(huifu, 'createJsapiOrder')
    const result = await ctx.payment.createPayment(orderId, user.id)

    expect(createSpy).not.toHaveBeenCalled()
    expect((result as any).zeroAmount).toBe(true)
    expect((await getOrder(orderId))!.status).toBe('PAID')
    expect((await getCourse(course.id))!.currentEnrolled).toBe(1)
    createSpy.mockRestore()
  })

  it('课程取消后支付成功 → 自动全额退款，不占名额也不递补', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 100, maxCapacity: 5 })
    const buyer = await seeder.user({ openId: true })
    const waiter = await seeder.user()
    const { orderId } = await ctx.enrollment.enroll(course.id, buyer.id, {})

    // 模拟定时任务已取消课程，但漏掉了仍在支付中的订单
    await ctx.prisma.course.update({ where: { id: course.id }, data: { status: 'CANCELLED' } })
    await ctx.prisma.waitlistEntry.create({
      data: {
        courseId: course.id,
        userId: waiter.id,
        position: 1,
        lockedPrice: 100,
        seatType: 'NORMAL',
        status: 'WAITING',
      },
    })

    const refundSpy = jest.spyOn(huifu, 'refund')
    await ctx.payment.handleNotify(payNotify(orderId, 'TX_LATE_CANCEL'))

    const paid = await getOrder(orderId)
    expect(paid!.status).toBe('REFUNDING')
    expect(Number(paid!.refundAmount)).toBe(100)
    expect(paid!.cancelReason).toContain('课程已取消')
    expect((await getCourse(course.id))!.currentEnrolled).toBe(0)
    expect(refundSpy).toHaveBeenCalledTimes(1)
    expect((refundSpy.mock.calls[0][0] as any).refundFen).toBe(100)

    await ctx.payment.handleRefundNotify(refundNotify(orderId))
    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
    expect((await getCourse(course.id))!.currentEnrolled).toBe(0)

    // 已取消课程不得把候补转正
    const entry = await ctx.prisma.waitlistEntry.findFirst({ where: { courseId: course.id } })
    expect(entry!.status).toBe('WAITING')
    refundSpy.mockRestore()
  })

  it('退款回调不得改变待支付/已取消订单，也不得扣减名额', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 100, currentEnrolled: 1 })
    const u1 = await seeder.user()
    const u2 = await seeder.user()

    const pendingNo = await ctx.order.generateOrderNo('COURSE')
    const pending = await ctx.prisma.order.create({
      data: {
        orderNo: pendingNo,
        userId: u1.id,
        courseId: course.id,
        orderType: 'COURSE',
        originalPrice: 100,
        actualPaid: 100,
        status: 'PENDING_PAYMENT',
      },
    })
    const cancelledNo = await ctx.order.generateOrderNo('COURSE')
    const cancelled = await ctx.prisma.order.create({
      data: {
        orderNo: cancelledNo,
        userId: u2.id,
        courseId: course.id,
        orderType: 'COURSE',
        originalPrice: 100,
        actualPaid: 100,
        status: 'CANCELLED',
      },
    })

    await ctx.payment.handleRefundNotify(refundNotify(pending.id))
    await ctx.payment.handleRefundNotify(refundNotify(cancelled.id))

    expect((await getOrder(pending.id))!.status).toBe('PENDING_PAYMENT')
    expect((await getOrder(cancelled.id))!.status).toBe('CANCELLED')
    expect((await getCourse(course.id))!.currentEnrolled).toBe(1)
  })

  it('并发重复退款只发起一次网关退款', async () => {
    const course = await seeder.course({
      ...timing(240),
      originalPrice: 100,
      refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 100 }],
    })
    const user = await seeder.user()
    const { orderId } = await ctx.enrollment.enroll(course.id, user.id, {})
    await ctx.payment.fulfillPaidOrder(orderId, 'TX_DOUBLE')

    const refundSpy = jest.spyOn(huifu, 'refund')
    const results = await Promise.allSettled([
      ctx.payment.refundOrder(orderId, '并发退款A'),
      ctx.payment.refundOrder(orderId, '并发退款B'),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(refundSpy).toHaveBeenCalledTimes(1)
    expect((await getOrder(orderId))!.status).toBe('REFUNDING')
    refundSpy.mockRestore()
  })

  it('已取消课程不得再递补候补', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 100, maxCapacity: 5 })
    const waiter = await seeder.user()
    await ctx.prisma.course.update({ where: { id: course.id }, data: { status: 'CANCELLED' } })
    const entry = await ctx.prisma.waitlistEntry.create({
      data: {
        courseId: course.id,
        userId: waiter.id,
        position: 1,
        lockedPrice: 100,
        seatType: 'NORMAL',
        status: 'WAITING',
      },
    })

    const promoted = await ctx.waitlist.promote(course.id)

    expect(promoted).toBe(0)
    const fresh = await ctx.prisma.waitlistEntry.findUnique({ where: { id: entry.id } })
    expect(fresh!.status).toBe('WAITING')
    expect((await getCourse(course.id))!.currentEnrolled).toBe(0)
  })

  it('待支付超时：课程回补积分与券、候补条目同步取消', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 300, allowDeduction: true })
    const user = await seeder.user()
    await seeder.addPoints(user.id, 2)
    const voucher = await makeVoucher(user.id, course.id, 1)
    const { orderId } = await ctx.enrollment.enroll(course.id, user.id, {
      usePoints: 1,
      voucherId: voucher.id,
    })
    const enrolled = await getOrder(orderId)
    expect(Number(enrolled!.pointsDeduction)).toBe(100)
    expect(Number(enrolled!.voucherDeduction)).toBe(100)

    const full = await seeder.course({
      ...timing(240),
      originalPrice: 100,
      maxCapacity: 1,
      currentEnrolled: 1,
    })
    const waiter = await seeder.user()
    const wait = await ctx.waitlist.join(full.id, waiter.id)

    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    })
    await ctx.prisma.order.update({
      where: { id: wait.orderId },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    })
    await ctx.prisma.waitlistEntry.updateMany({
      where: { orderId: wait.orderId },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    })

    await orderTasks.cancelExpiredOrders()

    expect((await getOrder(orderId))!.status).toBe('CANCELLED')
    expect((await getOrder(wait.orderId))!.status).toBe('CANCELLED')
    const entry = await ctx.prisma.waitlistEntry.findFirst({ where: { orderId: wait.orderId } })
    expect(entry!.status).toBe('CANCELLED')

    const latest = await ctx.prisma.pointsRecord.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(latest!.amount).toBe(1)
    expect(latest!.balance).toBe(2)
    expect((await ctx.prisma.voucher.findUnique({ where: { id: voucher.id } }))!.status).toBe('UNUSED')
  })

  it('未成行取消同时全额退还候补预付', async () => {
    const course = await seeder.course({
      ...timing(240),
      originalPrice: 100,
      minCapacity: 2,
      maxCapacity: 2,
    })
    const member = await seeder.user()
    const waiter = await seeder.user()

    const enrolled = await ctx.enrollment.enroll(course.id, member.id, {})
    await ctx.payment.fulfillPaidOrder(enrolled.orderId, 'TX_UNFORMED')
    // 满员时加入的候补预付：直接构造已支付候补订单与等待条目
    const waitOrderNo = await ctx.order.generateOrderNo('WAITLIST')
    const waitOrder = await ctx.prisma.order.create({
      data: {
        orderNo: waitOrderNo,
        userId: waiter.id,
        courseId: course.id,
        orderType: 'WAITLIST',
        originalPrice: 100,
        actualPaid: 100,
        status: 'PAID',
        paymentTime: new Date(),
      },
    })
    await ctx.prisma.waitlistEntry.create({
      data: {
        courseId: course.id,
        userId: waiter.id,
        position: 1,
        lockedPrice: 100,
        seatType: 'NORMAL',
        status: 'WAITING',
        orderId: waitOrder.id,
      },
    })
    const wait = { orderId: waitOrder.id }
    await ctx.prisma.course.update({
      where: { id: course.id },
      data: { groupDeadline: new Date(Date.now() - 60 * 1000) },
    })

    await courseTasks.cancelUnformedCourses(course.id)

    expect((await getCourse(course.id))!.status).toBe('CANCELLED')
    expect((await getOrder(enrolled.orderId))!.status).toBe('REFUNDING')
    expect(Number((await getOrder(enrolled.orderId))!.refundAmount)).toBe(100)
    expect((await getOrder(wait.orderId))!.status).toBe('REFUNDING')
    expect(Number((await getOrder(wait.orderId))!.refundAmount)).toBe(100)
    const entry = await ctx.prisma.waitlistEntry.findFirst({ where: { orderId: wait.orderId } })
    expect(entry!.status).toBe('REFUNDED')
  })

  it('候补转正后退款：释放名额并递补下一位', async () => {
    const course = await seeder.course({
      ...timing(240),
      originalPrice: 100,
      maxCapacity: 1,
      refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 100 }],
    })
    const u1 = await seeder.user()
    const u2 = await seeder.user()
    const u3 = await seeder.user()

    const first = await ctx.enrollment.enroll(course.id, u1.id, {})
    await ctx.payment.fulfillPaidOrder(first.orderId, 'TX_FIRST')
    const second = await ctx.waitlist.join(course.id, u2.id)
    await ctx.payment.fulfillPaidOrder(second.orderId, 'TX_SECOND')
    const third = await ctx.waitlist.join(course.id, u3.id)
    await ctx.payment.fulfillPaidOrder(third.orderId, 'TX_THIRD')

    await ctx.order.cancelOrder(first.orderId, u1.id, '测试退出')
    await ctx.payment.handleRefundNotify(refundNotify(first.orderId))

    const promoted2 = await ctx.prisma.waitlistEntry.findFirst({ where: { orderId: second.orderId } })
    expect(promoted2!.status).toBe('CONVERTED')
    const order2 = await getOrder(second.orderId)
    expect(order2!.status).toBe('PAID')
    expect(order2!.orderType).toBe('COURSE')
    expect((await getCourse(course.id))!.currentEnrolled).toBe(1)

    await ctx.order.cancelOrder(second.orderId, u2.id, '转正后退出')
    await ctx.payment.handleRefundNotify(refundNotify(second.orderId))

    const promoted3 = await ctx.prisma.waitlistEntry.findFirst({ where: { orderId: third.orderId } })
    expect(promoted3!.status).toBe('CONVERTED')
    expect((await getOrder(third.orderId))!.status).toBe('PAID')
    expect((await getCourse(course.id))!.currentEnrolled).toBe(1)
  })

  it('0 元订单强制退款：释放名额并返还积分', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 100, allowDeduction: true })
    const user = await seeder.user({ openId: true })
    await seeder.addPoints(user.id, 1)
    const { orderId } = await ctx.enrollment.enroll(course.id, user.id, { usePoints: 1 })
    await ctx.payment.createPayment(orderId, user.id)
    expect((await getCourse(course.id))!.currentEnrolled).toBe(1)

    await ctx.payment.forceRefund(orderId, 0, '误报名回收')

    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
    expect((await getCourse(course.id))!.currentEnrolled).toBe(0)
    const latest = await ctx.prisma.pointsRecord.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(latest!.amount).toBe(1)
    expect(latest!.balance).toBe(1)
  })

  it('强制全额退款返还积分与代金券', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 300, allowDeduction: true })
    const user = await seeder.user()
    await seeder.addPoints(user.id, 2)
    const voucher = await makeVoucher(user.id, course.id, 1)
    const { orderId } = await ctx.enrollment.enroll(course.id, user.id, {
      usePoints: 1,
      voucherId: voucher.id,
    })
    await ctx.payment.fulfillPaidOrder(orderId, 'TX_FORCE_FULL')

    await ctx.payment.forceRefund(orderId)
    await ctx.payment.handleRefundNotify(refundNotify(orderId))

    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
    const latest = await ctx.prisma.pointsRecord.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(latest!.balance).toBe(2)
    expect((await ctx.prisma.voucher.findUnique({ where: { id: voucher.id } }))!.status).toBe('UNUSED')
  })
})
