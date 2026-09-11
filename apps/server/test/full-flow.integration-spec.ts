import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import {
  buildTestContext,
  Seeder,
  TestContext,
  refundNotify,
  currentUser,
} from './helpers'

/**
 * 退款计算 + 多角色正逆向全链路集成测试。
 * 真实连接 RDS，mock Redis / 微信支付 / 通知。
 * 覆盖用户核心诉求：候补 → 退款 → 重新报名是否按新价。
 */
describe('报名/候补/退款 全链路集成', () => {
  let ctx: TestContext
  let app: INestApplication
  let seeder: Seeder

  beforeAll(async () => {
    ctx = await buildTestContext()
    app = ctx.app
    seeder = new Seeder(ctx.prisma)
  })

  afterAll(async () => {
    await seeder.cleanup()
    await app.close()
  })

  /** 模拟支付成功回调：置 PAID 并触发履约 */
  const pay = (orderId: string) => ctx.payment.fulfillPaidOrder(orderId, 'TX_TEST')

  it('A. 已支付课程取消：按 refundRules 阶梯退款 + 回调释放名额', async () => {
    const course = await seeder.course({
      maxCapacity: 5,
      originalPrice: 100,
      startInHours: 240, // 距开课 240h，命中 72h 以上档 → 80%
      refundRules: [{ hoursFrom: 72, hoursTo: null, refundPercent: 80 }],
    })
    const user = await seeder.user()

    const enrolled = await ctx.enrollment.enroll(course!.id, user.id, {})
    await pay(enrolled.orderId)

    let c = await ctx.prisma.course.findUnique({ where: { id: course!.id } })
    expect(c!.currentEnrolled).toBe(1)

    // 取消（已支付）→ 走 refundOrder，按 80% 计算
    const res = await ctx.order.cancelOrder(enrolled.orderId, user.id, '用户取消')
    expect(res.refundAmount).toBe(80)
    let order = await ctx.prisma.order.findUnique({ where: { id: enrolled.orderId } })
    expect(order!.status).toBe('REFUNDING')

    // 退款回调 → REFUNDED + 名额释放
    await ctx.payment.handleRefundNotify(refundNotify(enrolled.orderId))
    order = await ctx.prisma.order.findUnique({ where: { id: enrolled.orderId } })
    expect(order!.status).toBe('REFUNDED')
    c = await ctx.prisma.course.findUnique({ where: { id: course!.id } })
    expect(c!.currentEnrolled).toBe(0)
  })

  it('B. 候补链路：满员→候补支付→原报名者退款→退款回调触发候补递补转正', async () => {
    const course = await seeder.course({
      maxCapacity: 2,
      originalPrice: 100,
      startInHours: 240,
      refundRules: [{ hoursFrom: 72, hoursTo: null, refundPercent: 80 }],
      tiers: [
        { seatFrom: 1, seatTo: 1, price: 100 },
        { seatFrom: 2, seatTo: 2, price: 150 },
        { seatFrom: 3, seatTo: 3, price: 200 },
      ],
    })
    const userA = await seeder.user()
    const userB = await seeder.user()
    const userC = await seeder.user()

    const a = await ctx.enrollment.enroll(course!.id, userA.id, {})
    await pay(a.orderId)
    const b = await ctx.enrollment.enroll(course!.id, userB.id, {})
    await pay(b.orderId)

    let c = await ctx.prisma.course.findUnique({ where: { id: course!.id } })
    expect(c!.currentEnrolled).toBe(2) // 满员

    // userC 候补：锁价按 maxCapacity+1=3 顺位 → 200
    const cJoin = await ctx.waitlist.join(course!.id, userC.id)
    expect(cJoin.lockedPrice).toBe(200)
    await pay(cJoin.orderId) // 候补订单支付 → WAITING

    let entry = await ctx.prisma.waitlistEntry.findFirst({ where: { orderId: cJoin.orderId } })
    expect(entry!.status).toBe('WAITING')

    // userA 退款
    await ctx.order.cancelOrder(a.orderId, userA.id, '取消')
    await ctx.payment.handleRefundNotify(refundNotify(a.orderId))

    // 退款回调应触发候补递补：userC 转正
    entry = await ctx.prisma.waitlistEntry.findFirst({ where: { orderId: cJoin.orderId } })
    expect(entry!.status).toBe('CONVERTED')
    const cOrder = await ctx.prisma.order.findUnique({ where: { id: cJoin.orderId } })
    expect(cOrder!.status).toBe('COMPLETED')

    c = await ctx.prisma.course.findUnique({ where: { id: course!.id } })
    expect(c!.currentEnrolled).toBe(2) // A 释放 -1，C 递补 +1
  })

  it('C. 退款后重新报名：按当前占用位取新阶梯价（核心诉求）', async () => {
    const course = await seeder.course({
      maxCapacity: 3,
      originalPrice: 100,
      startInHours: 240,
      refundRules: [{ hoursFrom: 72, hoursTo: null, refundPercent: 100 }],
      tiers: [
        { seatFrom: 1, seatTo: 1, price: 100 },
        { seatFrom: 2, seatTo: 2, price: 200 },
        { seatFrom: 3, seatTo: 3, price: 300 },
      ],
    })
    const userA = await seeder.user()
    const userB = await seeder.user()

    const a1 = await ctx.enrollment.enroll(course!.id, userA.id, {})
    await pay(a1.orderId)
    const a1Order = await ctx.prisma.order.findUnique({ where: { id: a1.orderId } })
    expect(Number(a1Order!.originalPrice)).toBe(100) // 首报 1 号位 = 100

    const b = await ctx.enrollment.enroll(course!.id, userB.id, {})
    await pay(b.orderId) // 占 2 号位

    // userA 退款并完成回调（释放名额）
    await ctx.order.cancelOrder(a1.orderId, userA.id, '取消')
    await ctx.payment.handleRefundNotify(refundNotify(a1.orderId))

    // userA 重新报名：当前 enrolled=1（B）→ 顺位 2 → 新价 200
    const a2 = await ctx.enrollment.enroll(course!.id, userA.id, {})
    const a2Order = await ctx.prisma.order.findUnique({ where: { id: a2.orderId } })
    expect(Number(a2Order!.originalPrice)).toBe(200)
  })

  it('D. 待支付订单取消：回补积分流水 + 券置 UNUSED + 不减名额', async () => {
    const course = await seeder.course({ maxCapacity: 5, originalPrice: 10000, allowDeduction: true })
    const user = await seeder.user()
    await seeder.addPoints(user.id, 50) // 1 积分 = 1 元 = 100 分

    const voucher = await ctx.prisma.voucher.create({
      data: {
        userId: user.id,
        mode: 'REDUCE_BY',
        amount: 10, // 代金券面额后台按元录入
        applicableAll: true,
        applicableCourseIds: [],
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        source: 'TEST',
        status: 'UNUSED',
      },
    })

    const enrolled = await ctx.enrollment.enroll(course!.id, user.id, {
      usePoints: 50,
      voucherId: voucher.id,
    })
    const order = await ctx.prisma.order.findUnique({ where: { id: enrolled.orderId } })
    expect(Number(order!.pointsDeduction)).toBe(5000)
    expect(Number(order!.voucherDeduction)).toBe(1000)
    expect(enrolled.actualPaid).toBe(4000) // 10000 - 5000 - 1000（分）

    // 券已预占
    let v = await ctx.prisma.voucher.findUnique({ where: { id: voucher.id } })
    expect(v!.status).toBe('USED')

    // 取消待支付订单
    const res = await ctx.order.cancelOrder(enrolled.orderId, user.id, '不想报了')
    expect(res.refundAmount).toBe(0)

    const cancelled = await ctx.prisma.order.findUnique({ where: { id: enrolled.orderId } })
    expect(cancelled!.status).toBe('CANCELLED')

    // 积分已回补（最新余额回到 50）
    const balance = await ctx.pricing.getPointsBalance(user.id)
    expect(balance).toBe(50)

    // 券已释放
    v = await ctx.prisma.voucher.findUnique({ where: { id: voucher.id } })
    expect(v!.status).toBe('UNUSED')

    // 名额未变（待支付本不占 currentEnrolled）
    const c = await ctx.prisma.course.findUnique({ where: { id: course!.id } })
    expect(c!.currentEnrolled).toBe(0)
  })

  it('E. refundRules 阶梯档位：不同开课距离命中不同 refundPercent', async () => {
    const rules = [
      { hoursFrom: 0, hoursTo: 24, refundPercent: 0 },
      { hoursFrom: 24, hoursTo: 72, refundPercent: 50 },
      { hoursFrom: 72, hoursTo: null, refundPercent: 90 },
    ]
    const cases: { startInHours: number; expect: number }[] = [
      { startInHours: 240, expect: 90 }, // >=72h
      { startInHours: 48, expect: 50 }, // 24~72h
      { startInHours: 12, expect: 0 }, // <24h
    ]
    for (const cse of cases) {
      const course = await seeder.course({
        maxCapacity: 5,
        originalPrice: 100,
        startInHours: cse.startInHours,
        refundRules: rules,
      })
      const user = await seeder.user()
      const enrolled = await ctx.enrollment.enroll(course!.id, user.id, {})
      await pay(enrolled.orderId)
      const res = await ctx.order.cancelOrder(enrolled.orderId, user.id, '取消')
      expect(res.refundAmount).toBe(cse.expect)
    }
  })

  it('F. HTTP 冒烟：POST /orders/enroll/:id → POST /orders/:id/cancel', async () => {
    const course = await seeder.course({
      maxCapacity: 5,
      originalPrice: 100,
      startInHours: 240,
      refundRules: [{ hoursFrom: 72, hoursTo: null, refundPercent: 80 }],
    })
    const user = await seeder.user()
    currentUser.userId = user.id // 覆盖后的 JWT Guard 读取该用户

    const enrollRes = await request(app.getHttpServer())
      .post(`/orders/enroll/${course!.id}`)
      .send({})
      .expect(201)
    expect(enrollRes.body.orderId).toBeDefined()

    await pay(enrollRes.body.orderId)

    const cancelRes = await request(app.getHttpServer())
      .post(`/orders/${enrollRes.body.orderId}/cancel`)
      .send({ reason: 'HTTP 冒烟取消' })
      .expect(201)
    expect(cancelRes.body.refundAmount).toBe(80)
  })
})
