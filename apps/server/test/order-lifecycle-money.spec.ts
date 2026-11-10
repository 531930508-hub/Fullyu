import {
  buildTestContext,
  Seeder,
  TestContext,
  payNotify,
  refundNotify,
  createRedisMock,
} from './helpers'
import { OrderTasksService } from '../src/modules/order/order-tasks.service'

/**
 * 订单生命周期与金额回归。
 *
 * 覆盖用户明确要求的三件事：
 * 1. 课程结束后，已支付订单自动变为「已完成」；
 * 2. 已完成订单禁止用户自助退款（无退款入口），后台强制退款通道保留；
 * 3. 每个订单/候补状态下可执行的动作，以及金额口径（阶梯价、会员折扣、
 *    积分、代金券、退款边界、强制退款上限、分/元换算）逐项校验。
 *
 * 全部使用真实 RDS + 真实业务 Service，仅 mock Redis / 汇付 / 通知。
 * 定时任务传入 courseId 只处理本用例课程，避免扫到线上数据。
 */
describe('订单生命周期与金额口径', () => {
  let ctx: TestContext
  let seeder: Seeder
  let orderTasks: OrderTasksService

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    orderTasks = new OrderTasksService(ctx.prisma, createRedisMock() as any)
  })

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.app.close()
  })

  const uid = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`

  /** 距当前 N 小时开课，startDate/time 对齐，避免 Seeder 固定 10:00 产生漂移 */
  function timing(hoursAhead: number) {
    const start = new Date(Date.now() + hoursAhead * 3600 * 1000)
    const end = new Date(start.getTime() + 3600 * 1000)
    const clock = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return { startDate: start, endDate: end, startTime: clock(start), endTime: clock(end) }
  }

  /** 把课程改成已经结束的过去时间（固定到昨天，避免受执行时刻影响） */
  async function endCourse(courseId: string, status?: 'PUBLISHED' | 'CANCELLED' | 'COMPLETED') {
    const day = new Date()
    day.setDate(day.getDate() - 1)
    day.setHours(0, 0, 0, 0)
    await ctx.prisma.course.update({
      where: { id: courseId },
      data: {
        startDate: day,
        endDate: day,
        startTime: '10:00',
        endTime: '11:00',
        ...(status ? { status } : {}),
      },
    })
  }

  async function enrollAndPay(
    courseId: string,
    userId: string,
    dto: { usePoints?: number; voucherId?: string } = {},
  ) {
    const res = await ctx.enrollment.enroll(courseId, userId, dto)
    await ctx.payment.fulfillPaidOrder(res.orderId, 'TX_TEST')
    return res
  }

  const getOrder = (id: string) => ctx.prisma.order.findUnique({ where: { id } })
  const getCourse = (id: string) => ctx.prisma.course.findUnique({ where: { id } })
  const getEntry = (orderId: string) =>
    ctx.prisma.waitlistEntry.findFirst({ where: { orderId } })

  async function latestPointsBalance(userId: string) {
    const last = await ctx.prisma.pointsRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return last?.balance ?? 0
  }

  function makeVoucher(
    userId: string,
    courseId: string,
    opts: {
      mode?: 'REDUCE_BY' | 'REDUCE_TO'
      amount?: number
      targetPrice?: number
    } = {},
  ) {
    return ctx.prisma.voucher.create({
      data: {
        userId,
        mode: opts.mode ?? 'REDUCE_BY',
        amount: opts.amount ?? 10,
        targetPrice: opts.targetPrice,
        applicableCourseIds: [courseId],
        applicableAll: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        status: 'UNUSED',
        source: '测试发放',
      },
    })
  }

  /* ================= 1. 课程结束自动完成 ================= */

  describe('课程结束自动完成', () => {
    it('已支付课程订单在结束后置为已完成，重复执行幂等', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      const { orderId } = await enrollAndPay(course.id, user.id)

      await endCourse(course.id)
      await orderTasks.completeEndedCourseOrders(course.id)
      expect((await getOrder(orderId))!.status).toBe('COMPLETED')

      // 幂等：再跑一次不会报错，状态保持一致
      await orderTasks.completeEndedCourseOrders(course.id)
      expect((await getOrder(orderId))!.status).toBe('COMPLETED')
    })

    it('未结束课程不会被提前完成', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      const { orderId } = await enrollAndPay(course.id, user.id)

      await orderTasks.completeEndedCourseOrders(course.id)
      expect((await getOrder(orderId))!.status).toBe('PAID')
    })

    it('已下架课程的已支付订单不会被误置为已完成', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      const { orderId } = await enrollAndPay(course.id, user.id)

      await endCourse(course.id, 'CANCELLED')
      await orderTasks.completeEndedCourseOrders(course.id)
      expect((await getOrder(orderId))!.status).toBe('PAID')
    })

    it('已完成状态课程可正常完成其已支付订单', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      const { orderId } = await enrollAndPay(course.id, user.id)

      await endCourse(course.id, 'COMPLETED')
      await orderTasks.completeEndedCourseOrders(course.id)
      expect((await getOrder(orderId))!.status).toBe('COMPLETED')
    })

    it('待支付/退款中/已退款订单不受自动完成影响', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const u1 = await seeder.user()
      const u2 = await seeder.user()
      const u3 = await seeder.user()

      // u1 待支付
      const pending = await ctx.enrollment.enroll(course.id, u1.id, {})
      // u2 已支付后退款中
      const refunding = await enrollAndPay(course.id, u2.id)
      await ctx.payment.refundFull(refunding.orderId, '测试退款中')
      // u3 已支付后退款完成
      const refunded = await enrollAndPay(course.id, u3.id)
      await ctx.payment.refundFull(refunded.orderId, '测试退款完成')
      await ctx.payment.handleRefundNotify(refundNotify(refunded.orderId))

      await endCourse(course.id)
      await orderTasks.completeEndedCourseOrders(course.id)

      expect((await getOrder(pending.orderId))!.status).toBe('PENDING_PAYMENT')
      expect((await getOrder(refunding.orderId))!.status).toBe('REFUNDING')
      expect((await getOrder(refunded.orderId))!.status).toBe('REFUNDED')
    })
  })

  /* ================= 2. 已完成订单动作边界 ================= */

  describe('已完成订单的动作边界', () => {
    async function completedOrder(originalPrice = 10000) {
      const course = await seeder.course({ ...timing(240), originalPrice })
      const user = await seeder.user()
      const { orderId } = await enrollAndPay(course.id, user.id)
      await endCourse(course.id)
      await orderTasks.completeEndedCourseOrders(course.id)
      expect((await getOrder(orderId))!.status).toBe('COMPLETED')
      return { course, user, orderId }
    }

    it('用户自助取消已完成订单被拒，订单与名额保持不变', async () => {
      const { course, user, orderId } = await completedOrder()

      await expect(ctx.order.cancelOrder(orderId, user.id, '用户取消')).rejects.toThrow(
        /课程已完成，不支持自助退款/,
      )

      const order = await getOrder(orderId)
      expect(order!.status).toBe('COMPLETED')
      expect((await getCourse(course.id))!.currentEnrolled).toBe(1)
    })

    it('退款服务同样拒绝已完成订单，避免绕过订单入口自助退款', async () => {
      const { orderId } = await completedOrder()

      await expect(ctx.payment.refundOrder(orderId, '用户退款')).rejects.toThrow(
        /课程已完成，不支持自助退款/,
      )
      expect((await getOrder(orderId))!.status).toBe('COMPLETED')
    })

    it('后台强制退款仍可用于已完成订单，并释放名额', async () => {
      const { course, orderId } = await completedOrder()

      const res = await ctx.payment.forceRefund(orderId, 10, '客诉线下处理')
      expect(res.refundAmount).toBe(10)

      const refunding = await getOrder(orderId)
      expect(refunding!.status).toBe('REFUNDING')
      expect(Number(refunding!.refundAmount)).toBe(1000) // 库内课程链路为「分」

      await ctx.payment.handleRefundNotify(refundNotify(orderId))
      expect((await getOrder(orderId))!.status).toBe('REFUNDED')
      expect((await getCourse(course.id))!.currentEnrolled).toBe(0)
    })
  })

  /* ================= 3. 状态 × 动作矩阵 ================= */

  describe('订单状态动作矩阵', () => {
    it('待支付取消：回补积分与代金券，不产生退款', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      await seeder.addPoints(user.id, 20)
      const voucher = await makeVoucher(user.id, course.id, { amount: 10 })

      const { orderId } = await ctx.enrollment.enroll(course.id, user.id, {
        usePoints: 20,
        voucherId: voucher.id,
      })
      expect(Number((await getOrder(orderId))!.actualPaid)).toBe(7000)
      expect((await ctx.prisma.voucher.findUnique({ where: { id: voucher.id } }))!.status).toBe(
        'USED',
      )

      const res = await ctx.order.cancelOrder(orderId, user.id, '用户取消')
      expect(res.refundAmount).toBe(0)

      expect((await getOrder(orderId))!.status).toBe('CANCELLED')
      expect(await latestPointsBalance(user.id)).toBe(20)
      expect((await ctx.prisma.voucher.findUnique({ where: { id: voucher.id } }))!.status).toBe(
        'UNUSED',
      )
      expect((await getCourse(course.id))!.currentEnrolled).toBe(0)
    })

    it('已支付开课前取消：按规则进入退款中，退款成功后全额回补积分与券', async () => {
      const course = await seeder.course({
        ...timing(240),
        originalPrice: 10000,
        refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 100 }],
      })
      const user = await seeder.user()
      await seeder.addPoints(user.id, 20)
      const voucher = await makeVoucher(user.id, course.id, { amount: 10 })

      const { orderId } = await enrollAndPay(course.id, user.id, {
        usePoints: 20,
        voucherId: voucher.id,
      })
      expect(Number((await getOrder(orderId))!.actualPaid)).toBe(7000)

      const res = await ctx.order.cancelOrder(orderId, user.id, '用户取消预约')
      expect(res.refundAmount).toBe(7000)
      expect((await getOrder(orderId))!.status).toBe('REFUNDING')
      // 回调前名额仍占用，回调解锁并置已退款
      expect((await getCourse(course.id))!.currentEnrolled).toBe(1)

      // 现金全额退回，积分与代金券应一并返还，避免用户钱与权益双失
      expect(await latestPointsBalance(user.id)).toBe(20)
      expect((await ctx.prisma.voucher.findUnique({ where: { id: voucher.id } }))!.status).toBe(
        'UNUSED',
      )

      await ctx.payment.handleRefundNotify(refundNotify(orderId))
      expect((await getOrder(orderId))!.status).toBe('REFUNDED')
      expect((await getCourse(course.id))!.currentEnrolled).toBe(0)
    })

    it('部分退款不返还积分与券（折扣按实际支付比例结算）', async () => {
      const course = await seeder.course({
        ...timing(240),
        originalPrice: 10000,
        refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 80 }],
      })
      const user = await seeder.user()
      await seeder.addPoints(user.id, 20)
      const voucher = await makeVoucher(user.id, course.id, { amount: 10 })
      const { orderId } = await enrollAndPay(course.id, user.id, {
        usePoints: 20,
        voucherId: voucher.id,
      })

      const res = await ctx.order.cancelOrder(orderId, user.id, '部分退款')
      expect(res.refundAmount).toBe(5600) // 7000 × 80%
      expect(await latestPointsBalance(user.id)).toBe(0)
      expect((await ctx.prisma.voucher.findUnique({ where: { id: voucher.id } }))!.status).toBe(
        'USED',
      )
    })

    it('已支付开课后取消：拒绝自助退款，状态与名额不变', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      const { orderId } = await enrollAndPay(course.id, user.id)

      // 课程已开始但尚未结束，自动完成任务不会介入
      const start = new Date(Date.now() - 3600 * 1000)
      const end = new Date(Date.now() + 3600 * 1000)
      await ctx.prisma.course.update({
        where: { id: course.id },
        data: { startDate: start, endDate: end, startTime: '00:00', endTime: '23:59' },
      })

      await expect(ctx.order.cancelOrder(orderId, user.id, '用户取消')).rejects.toThrow(
        /课程已开始/,
      )
      expect((await getOrder(orderId))!.status).toBe('PAID')
      expect((await getCourse(course.id))!.currentEnrolled).toBe(1)
    })

    it('已取消/退款中/已退款订单再次取消均被拒，状态不变', async () => {
      const course = await seeder.course({
        ...timing(240),
        originalPrice: 10000,
        refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 100 }],
      })
      const u1 = await seeder.user()
      const u2 = await seeder.user()
      const u3 = await seeder.user()

      const cancelled = await ctx.enrollment.enroll(course.id, u1.id, {})
      await ctx.order.cancelOrder(cancelled.orderId, u1.id, '取消')
      const refunding = await enrollAndPay(course.id, u2.id)
      await ctx.order.cancelOrder(refunding.orderId, u2.id, '退款中')
      const refunded = await enrollAndPay(course.id, u3.id)
      await ctx.order.cancelOrder(refunded.orderId, u3.id, '退款完成')
      await ctx.payment.handleRefundNotify(refundNotify(refunded.orderId))

      const attempts: Array<[string, string]> = [
        [cancelled.orderId, u1.id],
        [refunding.orderId, u2.id],
        [refunded.orderId, u3.id],
      ]
      for (const [orderId, userId] of attempts) {
        await expect(ctx.order.cancelOrder(orderId, userId, '重复取消')).rejects.toThrow(
          /订单当前状态不可取消/,
        )
      }
      expect((await getOrder(cancelled.orderId))!.status).toBe('CANCELLED')
      expect((await getOrder(refunding.orderId))!.status).toBe('REFUNDING')
      expect((await getOrder(refunded.orderId))!.status).toBe('REFUNDED')
    })

    it('待支付可发起支付，已支付不可重复支付', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user({ openId: true })
      const { orderId } = await ctx.enrollment.enroll(course.id, user.id, {})

      const params = await ctx.payment.createPayment(orderId, user.id)
      expect(params.appId).toBe('wx_test')

      await ctx.payment.fulfillPaidOrder(orderId, 'TX_TEST')
      await expect(ctx.payment.createPayment(orderId, user.id)).rejects.toMatchObject({
        bizCode: 4005,
      })
    })

    it('支付回调幂等：重复回调不会重复占座', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      const { orderId } = await ctx.enrollment.enroll(course.id, user.id, {})

      await ctx.payment.handleNotify(payNotify(orderId))
      await ctx.payment.handleNotify(payNotify(orderId))

      expect((await getOrder(orderId))!.status).toBe('PAID')
      expect((await getCourse(course.id))!.currentEnrolled).toBe(1)
    })

    it('取消后收到支付成功回调：自动原路退款且不占名额', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      const { orderId } = await ctx.enrollment.enroll(course.id, user.id, {})
      await ctx.order.cancelOrder(orderId, user.id, '用户取消')

      await ctx.payment.handleNotify(payNotify(orderId))
      const order = await getOrder(orderId)
      expect(order!.status).toBe('REFUNDING')
      expect(order!.cancelReason).toMatch(/取消后收到支付/)
      expect(Number(order!.refundAmount)).toBe(10000)
      expect((await getCourse(course.id))!.currentEnrolled).toBe(0)

      await ctx.payment.handleRefundNotify(refundNotify(orderId))
      expect((await getOrder(orderId))!.status).toBe('REFUNDED')
      expect((await getCourse(course.id))!.currentEnrolled).toBe(0)
    })

    it('候补待支付取消 → 条目已取消；候补已支付取消 → 全额退款且不占名额', async () => {
      const course = await seeder.course({
        ...timing(240),
        maxCapacity: 1,
        currentEnrolled: 1,
        originalPrice: 10000,
      })
      const u1 = await seeder.user()
      const u2 = await seeder.user()

      const pending = await ctx.waitlist.join(course.id, u1.id)
      await ctx.order.cancelOrder(pending.orderId, u1.id, '取消候补')
      expect((await getEntry(pending.orderId))!.status).toBe('CANCELLED')
      expect((await getOrder(pending.orderId))!.status).toBe('CANCELLED')

      const paid = await ctx.waitlist.join(course.id, u2.id)
      await ctx.payment.fulfillPaidOrder(paid.orderId, 'TX_TEST')
      expect((await getEntry(paid.orderId))!.status).toBe('WAITING')

      const res = await ctx.order.cancelOrder(paid.orderId, u2.id, '用户取消候补')
      expect(res.refundAmount).toBe(10000)
      const refunding = await getOrder(paid.orderId)
      expect(refunding!.status).toBe('REFUNDING')
      expect((await getEntry(paid.orderId))!.status).toBe('REFUNDED')
      // 候补不占正选名额
      expect((await getCourse(course.id))!.currentEnrolled).toBe(1)

      await ctx.payment.handleRefundNotify(refundNotify(paid.orderId))
      expect((await getOrder(paid.orderId))!.status).toBe('REFUNDED')
    })

    it('后台候补动作：仅 WAITING 可递补；退出退款后不可重复操作', async () => {
      const course = await seeder.course({
        ...timing(240),
        maxCapacity: 1,
        currentEnrolled: 1,
        originalPrice: 10000,
      })
      const user = await seeder.user()
      const joined = await ctx.waitlist.join(course.id, user.id)
      await ctx.payment.fulfillPaidOrder(joined.orderId, 'TX_TEST')
      const entry = await getEntry(joined.orderId)

      const promoted = await ctx.waitlist.promoteEntry(entry!.id)
      expect(promoted.promoted).toBe(true)
      expect(promoted.overCapacity).toBe(true)
      expect((await getOrder(joined.orderId))!.orderType).toBe('COURSE')
      expect((await getOrder(joined.orderId))!.status).toBe('PAID')
      expect((await getCourse(course.id))!.currentEnrolled).toBe(2)

      await expect(ctx.waitlist.promoteEntry(entry!.id)).rejects.toMatchObject({ bizCode: 4023 })
      await expect(ctx.waitlist.cancelEntry(entry!.id)).rejects.toMatchObject({ bizCode: 4024 })
    })
  })

  /* ================= 4. 金额口径 ================= */

  describe('金额口径与退款计算', () => {
    it('阶梯价按报名顺序位锁定，后来者按更高档位计价', async () => {
      const course = await seeder.course({
        ...timing(240),
        maxCapacity: 5,
        originalPrice: 99999,
        tiers: [
          { seatFrom: 1, seatTo: 2, price: 12000 },
          { seatFrom: 3, seatTo: 5, price: 9000 },
        ],
      })
      const u1 = await seeder.user()
      const u2 = await seeder.user()
      const u3 = await seeder.user()

      const first = await ctx.enrollment.enroll(course.id, u1.id, {})
      const second = await ctx.enrollment.enroll(course.id, u2.id, {})
      const third = await ctx.enrollment.enroll(course.id, u3.id, {})

      expect(Number((await getOrder(first.orderId))!.originalPrice)).toBe(12000)
      expect(Number((await getOrder(second.orderId))!.originalPrice)).toBe(12000)
      expect(Number((await getOrder(third.orderId))!.originalPrice)).toBe(9000)
      expect(Number((await getOrder(third.orderId))!.actualPaid)).toBe(9000)
    })

    // 2026-11-08 会议：畅练卡有效期内 0 元报课；课程会员折扣改由 Full愈品牌会员享受（见 brand-member-program.spec）。
    it('有效畅练卡 0 元报课（原价照常记账），过期后恢复原价', async () => {
      const course = await seeder.course({
        ...timing(240),
        originalPrice: 10000,
        memberDiscounts: [{ cardType: 'YEARLY', discountPercent: 80 }],
      })
      const user = await seeder.user()
      const card = await seeder.memberCard(user.id, 'YEARLY')

      const withCard = await ctx.enrollment.enroll(course.id, user.id, {})
      const withCardOrder = await getOrder(withCard.orderId)
      expect(Number(withCardOrder!.originalPrice)).toBe(10000)
      expect(Number(withCardOrder!.discountAmount)).toBe(10000)
      expect(Number(withCardOrder!.actualPaid)).toBe(0)
      expect(withCardOrder!.cardType).toBe('YEARLY')

      await ctx.prisma.memberCard.update({
        where: { id: card.id },
        data: { endDate: new Date(Date.now() - 24 * 3600 * 1000) },
      })
      const course2 = await seeder.course({
        ...timing(240),
        originalPrice: 10000,
        memberDiscounts: [{ cardType: 'YEARLY', discountPercent: 80 }],
      })
      const expired = await ctx.enrollment.enroll(course2.id, user.id, {})
      expect(Number((await getOrder(expired.orderId))!.actualPaid)).toBe(10000)
    })

    it('积分按 1 点 = 1 元（100 分）抵扣，不可用于未开启抵扣的课程', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      await seeder.addPoints(user.id, 20)
      const { orderId } = await ctx.enrollment.enroll(course.id, user.id, { usePoints: 20 })
      const order = await getOrder(orderId)
      expect(Number(order!.pointsDeduction)).toBe(2000)
      expect(Number(order!.actualPaid)).toBe(8000)
      expect(await latestPointsBalance(user.id)).toBe(0)

      const noDeduct = await seeder.course({
        ...timing(240),
        originalPrice: 10000,
        allowDeduction: false,
      })
      await expect(
        ctx.enrollment.enroll(noDeduct.id, user.id, { usePoints: 1 }),
      ).rejects.toMatchObject({ bizCode: 4012 })
    })

    it('代金券减额/减至均从元换算为分，取消后恢复可用', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      const byAmount = await makeVoucher(user.id, course.id, { amount: 10 })
      const reduceBy = await ctx.enrollment.enroll(course.id, user.id, {
        voucherId: byAmount.id,
      })
      expect(Number((await getOrder(reduceBy.orderId))!.voucherDeduction)).toBe(1000)
      expect(Number((await getOrder(reduceBy.orderId))!.actualPaid)).toBe(9000)
      await ctx.order.cancelOrder(reduceBy.orderId, user.id, '取消')
      expect((await ctx.prisma.voucher.findUnique({ where: { id: byAmount.id } }))!.status).toBe(
        'UNUSED',
      )

      const course2 = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const reduceTo = await makeVoucher(user.id, course2.id, {
        mode: 'REDUCE_TO',
        targetPrice: 88,
      })
      const toTarget = await ctx.enrollment.enroll(course2.id, user.id, {
        voucherId: reduceTo.id,
      })
      expect(Number((await getOrder(toTarget.orderId))!.voucherDeduction)).toBe(1200)
      expect(Number((await getOrder(toTarget.orderId))!.actualPaid)).toBe(8800)
    })

    it('退款按开课时刻命中规则（不是按日期零点），金额取整到分', async () => {
      // 后台表单的 startDate 存日期零点，真实开课时刻由 startDate + startTime 推导。
      // 明天 23:00 开课：零点与真实开课时刻相差约 23 小时，规则边界取两者中点，
      // 按日期零点会命中 50%，按真实开课时刻应命中 100%。
      const day = new Date()
      day.setDate(day.getDate() + 1)
      day.setHours(0, 0, 0, 0)
      const start = new Date(day)
      start.setHours(23, 0, 0, 0)
      const hoursMidnight = (day.getTime() - Date.now()) / 3_600_000
      const hoursActual = (start.getTime() - Date.now()) / 3_600_000
      const boundary = (hoursMidnight + hoursActual) / 2
      expect(boundary).toBeGreaterThan(hoursMidnight)
      expect(boundary).toBeLessThan(hoursActual)

      const course = await seeder.course({
        startDate: day,
        endDate: day,
        startTime: '23:00',
        endTime: '23:59',
        originalPrice: 10000,
        refundRules: [
          { hoursFrom: 0, hoursTo: boundary, refundPercent: 50 },
          { hoursFrom: boundary, hoursTo: null, refundPercent: 100 },
        ],
      })
      const user = await seeder.user()
      const { orderId } = await enrollAndPay(course.id, user.id)

      const res = await ctx.order.cancelOrder(orderId, user.id, '开课前退款')
      expect(res.refundAmount).toBe(10000)
    })

    it('百分比退款出现小数分时四舍五入为整数分', async () => {
      const course = await seeder.course({
        ...timing(240),
        originalPrice: 3333,
        refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 80 }],
      })
      const user = await seeder.user()
      const { orderId } = await enrollAndPay(course.id, user.id)

      const res = await ctx.order.cancelOrder(orderId, user.id, '退款')
      expect(res.refundAmount).toBe(2666) // 3333 × 80% = 2666.4
      expect(Number((await getOrder(orderId))!.refundAmount)).toBe(2666)
    })

    it('全额积分抵扣的订单取消时不退现金但返还积分并释放名额', async () => {
      const course = await seeder.course({
        ...timing(240),
        originalPrice: 10000,
        refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 80 }],
      })
      const user = await seeder.user()
      await seeder.addPoints(user.id, 100)
      const { orderId } = await enrollAndPay(course.id, user.id, { usePoints: 100 })
      expect(Number((await getOrder(orderId))!.actualPaid)).toBe(0)

      const res = await ctx.order.cancelOrder(orderId, user.id, '积分报名取消')
      expect(res.refundAmount).toBe(0)
      expect((await getOrder(orderId))!.status).toBe('REFUNDED')
      expect(await latestPointsBalance(user.id)).toBe(100)
      expect((await getCourse(course.id))!.currentEnrolled).toBe(0)
    })

    it('强制退款不得超过实付，金额按分存储', async () => {
      const course = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const user = await seeder.user()
      const { orderId } = await enrollAndPay(course.id, user.id)

      // 超额直接拒绝（4026），不再静默截断为实付金额，订单状态与退款流水均不受影响
      await expect(ctx.payment.forceRefund(orderId, 200, '超额尝试')).rejects.toMatchObject({
        bizCode: 4026,
      })
      expect((await getOrder(orderId))!.status).toBe('PAID')
      expect(await ctx.prisma.orderRefund.count({ where: { orderId } })).toBe(0)

      const res = await ctx.payment.forceRefund(orderId, 100, '全额退款')
      expect(res.refundAmount).toBe(100)
      expect(Number((await getOrder(orderId))!.refundAmount)).toBe(10000)

      const course2 = await seeder.course({ ...timing(240), originalPrice: 10000 })
      const { orderId: order2 } = await enrollAndPay(course2.id, user.id)
      const res2 = await ctx.payment.forceRefund(order2, 12.345, '小数金额')
      expect(res2.refundAmount).toBe(12.35)
      expect(Number((await getOrder(order2))!.refundAmount)).toBe(1235)
    })

    it('会员卡订单金额以元存储，强制退款落库保持元口径', async () => {
      const user = await seeder.user()
      const order = await ctx.prisma.order.create({
        data: {
          orderNo: `M${uid()}`,
          userId: user.id,
          orderType: 'MEMBER_CARD',
          originalPrice: 5980,
          actualPaid: 5980,
          status: 'PAID',
          paymentId: 'TX_MEMBER_CARD',
        },
      })

      const res = await ctx.payment.forceRefund(order.id, 100, '会员卡部分退款')
      expect(res.refundAmount).toBe(100)
      // 会员卡列值单位为元：100 元就是 100，不能写成 10000
      expect(Number((await getOrder(order.id))!.refundAmount)).toBe(100)

      // 按退款流水号回调（部分退款）：订单回退到退款前状态而非整单 REFUNDED
      await ctx.payment.handleRefundNotify(refundNotify(order.id, 'TX_TEST', `RF${order.id}`))
      const partial = await getOrder(order.id)
      expect(partial!.status).toBe('PAID')
      expect(Number(partial!.refundAmount)).toBe(100)
      const attempt = await ctx.prisma.orderRefund.findFirstOrThrow({ where: { orderId: order.id } })
      expect(attempt.status).toBe('SUCCESS')
    })
  })
})
