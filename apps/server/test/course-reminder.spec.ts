import {
  buildTestContext,
  Seeder,
  TestContext,
} from './helpers'
import { CourseTasksService } from '../src/modules/course/course-tasks.service'

/**
 * 开课提醒调度测试：
 * - 命中窗口（开课前 70 分钟内）的 PAID 课程订单 → 发送一次订阅消息
 * - 未支付订单 / 开课时间在窗口外 → 不发送
 * - Redis 锁去重：同一订单不重复发送
 * 口径对齐生产：startDate 为开课日 0 点，真实开课时刻 = 日期 + startTime。
 */
describe('CourseTasksService.sendCourseStartReminders 开课提醒', () => {
  let ctx: TestContext
  let seeder: Seeder
  let reminderCalls: Array<{ userId: string; params: any }>
  let courseTasks: CourseTasksService

  /** 带真实 NX 语义的 Redis mock：同一锁键只有首次能拿到 */
  function createNxRedisMock() {
    const held = new Set<string>()
    return {
      acquireLock: async (key: string) => {
        if (held.has(key)) return false
        held.add(key)
        return true
      },
    } as any
  }

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    reminderCalls = []
    courseTasks = new CourseTasksService(
      ctx.prisma,
      ctx.payment,
      {
        courseReminder: async (userId: string, params: any) => {
          reminderCalls.push({ userId, params })
        },
        waitlistPromoted: async () => undefined,
        paymentSuccess: async () => undefined,
        refundSuccess: async () => undefined,
      } as any,
      createNxRedisMock(),
    )
  })

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.app.close()
  })

  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const dayStart = () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }

  async function courseStartingAt(minutesAhead: number, startDayOffset = 0) {
    const start = new Date(Date.now() + minutesAhead * 60 * 1000)
    const base = dayStart()
    return seeder.course({
      status: 'PUBLISHED',
      // 生产口径：startDate = 开课日 0 点，真实开课时刻由 startTime 决定
      startDate: new Date(base.getTime() + startDayOffset * 24 * 3600 * 1000),
      endDate: new Date(base.getTime() + (startDayOffset + 1) * 24 * 3600 * 1000),
      startTime: clock(start),
      endTime: clock(new Date(start.getTime() + 2 * 3600 * 1000)),
      maxCapacity: 5,
      originalPrice: 10000,
    })
  }

  async function paidOrderFor(userId: string, course: any) {
    const res = await ctx.enrollment.enroll(course.id, userId, {})
    await ctx.payment.fulfillPaidOrder(res.orderId, 'TX_TEST')
    return res.orderId
  }

  it('窗口内已支付订单发送一次提醒，未支付与窗口外订单不发送，且不重复发送', async () => {
    const paidUser = await seeder.user()
    const unpaidUser = await seeder.user()
    const farUser = await seeder.user()

    // 命中窗口：30 分钟后开课（今天）
    const inWindow = await courseStartingAt(30)
    await paidOrderFor(paidUser.id, inWindow)
    // 未支付：同在窗口内，但订单停留在待支付
    const unpaidCourse = await courseStartingAt(30)
    await ctx.enrollment.enroll(unpaidCourse.id, unpaidUser.id, {})
    // 窗口外：明天上午开课
    const farCourse = await courseStartingAt(600, 1)
    await paidOrderFor(farUser.id, farCourse)

    const callsBefore = reminderCalls.length
    const sent = await courseTasks.sendCourseStartReminders()

    expect(sent).toBeGreaterThanOrEqual(1)
    // 本用例课程的提醒确实发出，字段格式正确
    const hit = reminderCalls.slice(callsBefore).find((c) => c.params.courseId === inWindow.id)
    expect(hit).toBeTruthy()
    expect(hit!.userId).toBe(paidUser.id)
    expect(hit!.params.courseName).toBe(inWindow.title)
    const d = dayStart()
    const expectedStart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clock(new Date(Date.now() + 30 * 60 * 1000))}`
    expect(hit!.params.startTime).toBe(expectedStart)
    expect(hit!.params.venue).toBeTruthy()

    // 未支付订单与窗口外订单均未被提醒
    const newCalls = reminderCalls.slice(callsBefore)
    expect(newCalls.find((c) => c.params.courseId === unpaidCourse.id)).toBeUndefined()
    expect(newCalls.find((c) => c.params.courseId === farCourse.id)).toBeUndefined()

    // 第二次扫描：锁已占用，不重复发送
    const sentAgain = await courseTasks.sendCourseStartReminders()
    expect(sentAgain).toBeLessThanOrEqual(sent)
    const hitCount = reminderCalls
      .slice(callsBefore)
      .filter((c) => c.params.courseId === inWindow.id).length
    expect(hitCount).toBe(1)
  })
})
