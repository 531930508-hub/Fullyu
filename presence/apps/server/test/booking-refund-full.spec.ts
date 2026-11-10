import {
  buildTestContext,
  Seeder,
  TestContext,
  refundNotify,
  createNotificationMock,
} from './helpers'
import { CourseTasksService } from '../src/modules/course/course-tasks.service'
import { WaitlistTasksService } from '../src/modules/waitlist/waitlist-tasks.service'
import { RedisService } from '../src/common/redis.service'

/**
 * 综合测试：报名 / 候补 / 退款 六大用户场景。
 * - 真实 RDS + 真实业务 Service，仅 mock Redis / 汇付 / 通知
 * - 定时任务以「仅处理本用例课程」的方式调用，避免扫到线上其它课程
 *
 * 场景：
 * 1. 报名后课程未成行 → 系统自动取消并全额退款
 * 2. 候补：有人退出后递补转正，会员候补席优先，会员席上限生效
 * 3. 候补到截止仍无人退出 → 自动全额退款，重复执行幂等
 * 4. 用户主动取消已报名课程 → 按 refundRules 退款；0 元档仍释放名额并递补
 * 5. 用户主动取消候补 → 全额退款，且退款途中不会被错误递补占座
 * 6. 课程结束后主动退款 → 自助关闭，只能走后台强制退款（客诉通道）
 */
describe('综合：报名 / 候补 / 退款六大场景', () => {
  let ctx: TestContext
  let seeder: Seeder
  let courseTasks: CourseTasksService
  let waitlistTasks: WaitlistTasksService

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    courseTasks = new CourseTasksService(
      ctx.prisma,
      ctx.payment,
      createNotificationMock() as any,
      ctx.moduleRef.get(RedisService),
    )
    waitlistTasks = new WaitlistTasksService(ctx.prisma, ctx.payment)
  })

  // 会员权益来自 CRM，用例内按需 spyOn 模拟；用例结束后恢复，避免污染其他场景
  afterEach(() => jest.restoreAllMocks())

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.app.close()  })

  /** 距当前 N 小时开课，并给出匹配的 HH:mm，避免 Seeder 固定 10:00 产生跨日时间漂移 */
  function timing(hoursAhead: number) {
    const start = new Date(Date.now() + hoursAhead * 3600 * 1000)
    const end = new Date(start.getTime() + 3600 * 1000)
    const clock = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return { startDate: start, endDate: end, startTime: clock(start), endTime: clock(end) }
  }

  const pay = (orderId: string) => ctx.payment.fulfillPaidOrder(orderId, 'TX_TEST')

  const getCourse = (id: string) => ctx.prisma.course.findUnique({ where: { id } })
  const getOrder = (id: string) => ctx.prisma.order.findUnique({ where: { id } })
  const getEntry = (orderId: string) =>
    ctx.prisma.waitlistEntry.findFirst({ where: { orderId } })

  it('1. 未成行自动退款：不足最低人数 → 取消课程、释放场地、全额退款', async () => {
    const course = await seeder.course({
      ...timing(240),
      minCapacity: 3,
      maxCapacity: 3,
      originalPrice: 100,
    })
    const formed = await seeder.course({
      ...timing(240),
      minCapacity: 2,
      maxCapacity: 3,
      originalPrice: 100,
    })

    const u1 = await seeder.user()
    const u2 = await seeder.user()
    const u3 = await seeder.user()
    const u4 = await seeder.user()

    const a = await ctx.enrollment.enroll(course!.id, u1.id, {})
    await pay(a.orderId)
    const b = await ctx.enrollment.enroll(course!.id, u2.id, {})
    await pay(b.orderId)

    const f1 = await ctx.enrollment.enroll(formed!.id, u3.id, {})
    await pay(f1.orderId)
    const f2 = await ctx.enrollment.enroll(formed!.id, u4.id, {})
    await pay(f2.orderId)

    // 课程自带场地占用；成团截止改为刚刚过去（缩小线上定时任务竞争窗口）
    await ctx.prisma.venueReservation.create({
      data: {
        venueId: course!.venueId,
        courseId: course!.id,
        date: new Date(),
        startTime: '10:00',
        endTime: '11:00',
        eventName: '未成行测试',
        contactName: '测试',
        contactPhone: '',
      },
    })
    await ctx.prisma.course.update({
      where: { id: course!.id },
      data: { groupDeadline: new Date(Date.now() - 60 * 1000) },
    })
    await ctx.prisma.course.update({
      where: { id: formed!.id },
      data: { groupDeadline: new Date(Date.now() - 60 * 1000) },
    })

    await courseTasks.cancelUnformedCourses(course!.id)
    await courseTasks.cancelUnformedCourses(formed!.id)

    const cancelled = await getCourse(course!.id)
    expect(cancelled!.status).toBe('CANCELLED')
    expect(await ctx.prisma.venueReservation.count({ where: { courseId: course!.id } })).toBe(0)

    const refunding = await ctx.prisma.order.findMany({
      where: { courseId: course!.id, orderType: 'COURSE' },
    })
    expect(refunding).toHaveLength(2)
    for (const o of refunding) {
      expect(o.status).toBe('REFUNDING')
      expect(Number(o.refundAmount)).toBe(100) // 全额（实付 100 分）
    }

    // 人数达标课程不受影响
    expect((await getCourse(formed!.id))!.status).toBe('PUBLISHED')
    const formedOrders = await ctx.prisma.order.findMany({
      where: { courseId: formed!.id, orderType: 'COURSE' },
    })
    expect(formedOrders.every((o) => o.status === 'PAID')).toBe(true)

    // 退款回调完成后订单终态
    for (const o of refunding) {
      await ctx.payment.handleRefundNotify(refundNotify(o.id))
    }
    for (const o of refunding) {
      expect((await getOrder(o.id))!.status).toBe('REFUNDED')
    }
  })

  it('2. 候补递补：品牌会员候补席优先，会员席满后进入普通席', async () => {
    const course = await seeder.course({
      ...timing(240),
      maxCapacity: 2,
      originalPrice: 100,
      memberWaitlistSeats: 1,
      refundRules: [{ hoursFrom: 72, hoursTo: null, refundPercent: 80 }],
    })

    const a = await seeder.user()
    const b = await seeder.user()
    const normal = await seeder.user()
    const member = await seeder.user()
    const member2 = await seeder.user()
    // 2026-11-08 起候补优先排位随会员权益改挂品牌会员（CRM prioritySeat），
    // 不再由本地畅练卡直接判定；这里直接给两位会员品牌权益，模拟 CRM 返回。
    const brandMembers = new Set([member.id, member2.id])
    jest.spyOn(ctx.pricing, 'brandStatus').mockImplementation(async (userId: string) =>
      brandMembers.has(userId)
        ? { perks: { prioritySeat: true, tierPrice: false, invitesPerMonth: 0 }, unknown: false }
        : { perks: null, unknown: false },
    )

    const aOrder = await ctx.enrollment.enroll(course!.id, a.id, {})
    await pay(aOrder.orderId)
    const bOrder = await ctx.enrollment.enroll(course!.id, b.id, {})
    await pay(bOrder.orderId)
    expect((await getCourse(course!.id))!.currentEnrolled).toBe(2)

    // 普通用户先排队，会员后到；第二位会员因会员席已满进入普通席
    const nJoin = await ctx.waitlist.join(course!.id, normal.id)
    const mJoin = await ctx.waitlist.join(course!.id, member.id)
    const m2Join = await ctx.waitlist.join(course!.id, member2.id)
    expect(nJoin.seatType).toBe('NORMAL')
    expect(mJoin.seatType).toBe('MEMBER')
    expect(m2Join.seatType).toBe('NORMAL')
    await pay(nJoin.orderId)
    await pay(mJoin.orderId)
    await pay(m2Join.orderId)

    // A 退课 → 空出 1 席：会员 D 优先转正，普通 C 继续排队
    await ctx.order.cancelOrder(aOrder.orderId, a.id, '临时有事')
    await ctx.payment.handleRefundNotify(refundNotify(aOrder.orderId))

    expect((await getEntry(mJoin.orderId))!.status).toBe('CONVERTED')
    expect((await getEntry(nJoin.orderId))!.status).toBe('WAITING')
    expect((await getEntry(m2Join.orderId))!.status).toBe('WAITING')
    expect((await getCourse(course!.id))!.currentEnrolled).toBe(2)

    // 转正后订单变为正式课程报名（待上课，而不是候补订单/已完成）
    const promotedOrder = await getOrder(mJoin.orderId)
    expect(promotedOrder!.status).toBe('PAID')
    expect(promotedOrder!.orderType).toBe('COURSE')

    // B 再退课 → 普通队列按 position 递补 C，E 仍在排队
    await ctx.order.cancelOrder(bOrder.orderId, b.id, '时间冲突')
    await ctx.payment.handleRefundNotify(refundNotify(bOrder.orderId))

    expect((await getEntry(nJoin.orderId))!.status).toBe('CONVERTED')
    expect((await getEntry(m2Join.orderId))!.status).toBe('WAITING')
    expect((await getCourse(course!.id))!.currentEnrolled).toBe(2)
  })

  it('3. 候补截止：一直无人退出 → 自动全额退款，重复执行幂等', async () => {
    const course = await seeder.course({
      ...timing(24),
      maxCapacity: 1,
      currentEnrolled: 1,
      originalPrice: 100,
      waitlistDeadlineHours: 48, // 开课前 48h 截止 → 当前已过
    })
    const user = await seeder.user()

    const join = await ctx.waitlist.join(course!.id, user.id)
    await pay(join.orderId)
    expect((await getEntry(join.orderId))!.status).toBe('WAITING')

    await waitlistTasks.refundExpiredWaitlist(course!.id)

    expect((await getEntry(join.orderId))!.status).toBe('REFUNDED')
    const order = await getOrder(join.orderId)
    expect(order!.status).toBe('REFUNDING')
    expect(Number(order!.refundAmount)).toBe(100) // 候补全额退

    await ctx.payment.handleRefundNotify(refundNotify(join.orderId))
    expect((await getOrder(join.orderId))!.status).toBe('REFUNDED')

    // 幂等：再跑一次不改变终态
    await waitlistTasks.refundExpiredWaitlist(course!.id)
    expect((await getOrder(join.orderId))!.status).toBe('REFUNDED')
    expect((await getEntry(join.orderId))!.status).toBe('REFUNDED')

    // 对照：未到截止时间的课程不会被误退
    const control = await seeder.course({
      ...timing(240),
      maxCapacity: 1,
      currentEnrolled: 1,
      originalPrice: 100,
      waitlistDeadlineHours: 48,
    })
    const controlJoin = await ctx.waitlist.join(control!.id, user.id)
    await pay(controlJoin.orderId)
    await waitlistTasks.refundExpiredWaitlist(control!.id)
    expect((await getEntry(controlJoin.orderId))!.status).toBe('WAITING')
    expect((await getOrder(controlJoin.orderId))!.status).toBe('PAID')
  })

  it('4. 主动取消课程：按阶梯规则退款；0 元档也释放名额并递补', async () => {
    // 4.1 距开课 240h，命中 80% 档
    const course = await seeder.course({
      ...timing(240),
      maxCapacity: 5,
      originalPrice: 100,
      refundRules: [{ hoursFrom: 72, hoursTo: null, refundPercent: 80 }],
    })
    const user = await seeder.user()
    const enrolled = await ctx.enrollment.enroll(course!.id, user.id, {})
    await pay(enrolled.orderId)

    const res = await ctx.order.cancelOrder(enrolled.orderId, user.id, '行程有变')
    expect(res.refundAmount).toBe(80)
    expect((await getOrder(enrolled.orderId))!.status).toBe('REFUNDING')
    await ctx.payment.handleRefundNotify(refundNotify(enrolled.orderId))
    expect((await getOrder(enrolled.orderId))!.status).toBe('REFUNDED')
    expect((await getCourse(course!.id))!.currentEnrolled).toBe(0)

    // 4.2 距开课不足 24h、规则 0%：取消仍应释放名额并让候补递补
    const late = await seeder.course({
      ...timing(6),
      maxCapacity: 1,
      originalPrice: 100,
      refundRules: [{ hoursFrom: 0, hoursTo: 24, refundPercent: 0 }],
    })
    const owner = await seeder.user()
    const candidate = await seeder.user()

    const ownerOrder = await ctx.enrollment.enroll(late!.id, owner.id, {})
    await pay(ownerOrder.orderId)
    const candidateJoin = await ctx.waitlist.join(late!.id, candidate.id)
    await pay(candidateJoin.orderId)
    expect((await getEntry(candidateJoin.orderId))!.status).toBe('WAITING')

    const zero = await ctx.order.cancelOrder(ownerOrder.orderId, owner.id, '临时取消')
    expect(zero.refundAmount).toBe(0)
    expect((await getOrder(ownerOrder.orderId))!.status).toBe('REFUNDED')

    // 名额已释放，候补立即转正
    expect((await getCourse(late!.id))!.currentEnrolled).toBe(1)
    expect((await getEntry(candidateJoin.orderId))!.status).toBe('CONVERTED')
    const promoted = await getOrder(candidateJoin.orderId)
    expect(promoted!.status).toBe('PAID')
    expect(promoted!.orderType).toBe('COURSE')
  })

  it('5. 主动取消候补：全额退款，退款途中不会被递补转正占座', async () => {
    const course = await seeder.course({
      ...timing(240),
      maxCapacity: 1,
      originalPrice: 100,
      refundRules: [{ hoursFrom: 72, hoursTo: null, refundPercent: 80 }],
    })
    const owner = await seeder.user()
    const candidate = await seeder.user()

    const ownerOrder = await ctx.enrollment.enroll(course!.id, owner.id, {})
    await pay(ownerOrder.orderId)
    const candidateJoin = await ctx.waitlist.join(course!.id, candidate.id)
    await pay(candidateJoin.orderId)
    expect((await getEntry(candidateJoin.orderId))!.status).toBe('WAITING')

    // 候补用户主动取消：全额退预付款
    const res = await ctx.order.cancelOrder(candidateJoin.orderId, candidate.id, '不等了')
    expect(res.refundAmount).toBe(100)
    expect((await getOrder(candidateJoin.orderId))!.status).toBe('REFUNDING')
    // 退款回调前就应退出队列，避免空闲名额被错误递补给正在退款的人
    expect((await getEntry(candidateJoin.orderId))!.status).toBe('REFUNDED')

    // 此时正式学员退课释放名额，退款中候补不得被转正
    await ctx.order.cancelOrder(ownerOrder.orderId, owner.id, '取消')
    await ctx.payment.handleRefundNotify(refundNotify(ownerOrder.orderId))

    expect((await getCourse(course!.id))!.currentEnrolled).toBe(0)
    expect((await getEntry(candidateJoin.orderId))!.status).toBe('REFUNDED')
    expect((await getOrder(candidateJoin.orderId))!.status).toBe('REFUNDING')

    // 候补退款回调完成后终态
    await ctx.payment.handleRefundNotify(refundNotify(candidateJoin.orderId))
    expect((await getOrder(candidateJoin.orderId))!.status).toBe('REFUNDED')
    expect((await getEntry(candidateJoin.orderId))!.status).toBe('REFUNDED')
  })

  it('6. 课程结束后主动退款：自助关闭，需走后台强制退款', async () => {
    const course = await seeder.course({
      ...timing(240),
      maxCapacity: 5,
      originalPrice: 100,
      refundRules: [{ hoursFrom: 0, hoursTo: 24, refundPercent: 0 }],
    })
    const user = await seeder.user()
    const enrolled = await ctx.enrollment.enroll(course!.id, user.id, {})
    await pay(enrolled.orderId)

    // 模拟课程已上完
    await ctx.prisma.course.update({
      where: { id: course!.id },
      data: {
        status: 'COMPLETED',
        startDate: new Date(Date.now() - 24 * 3600 * 1000),
        endDate: new Date(Date.now() - 23 * 3600 * 1000),
        startTime: '10:00',
        endTime: '11:00',
      },
    })

    await expect(
      ctx.order.cancelOrder(enrolled.orderId, user.id, '上完课想退款'),
    ).rejects.toThrow(/课程已开始/)

    // 自助取消被拒后订单与名额保持不变（订单仍为已支付，课程状态独立为已结束）
    expect((await getOrder(enrolled.orderId))!.status).toBe('PAID')
    expect((await getCourse(course!.id))!.currentEnrolled).toBe(1)

    // 客诉通道：后台强制退款仍可执行
    const forced = await ctx.payment.forceRefund(enrolled.orderId, undefined, '课中体验问题补偿')
    expect(forced.refundAmount).toBe(1) // 实付 100 分 = 1 元
    const forcingOrder = await getOrder(enrolled.orderId)
    expect(forcingOrder!.status).toBe('REFUNDING')
    expect(Number(forcingOrder!.refundAmount)).toBe(100) // 库内统一存「分」
    await ctx.payment.handleRefundNotify(refundNotify(enrolled.orderId))
    expect((await getOrder(enrolled.orderId))!.status).toBe('REFUNDED')
    expect((await getCourse(course!.id))!.currentEnrolled).toBe(0)
  })
})
