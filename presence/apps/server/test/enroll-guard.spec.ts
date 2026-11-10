import { INestApplication } from '@nestjs/common'
import { buildTestContext, Seeder, TestContext } from './helpers'

/**
 * 报名/候补二次校验（极端并发下课程被改期/改场后的兜底）
 *
 * enroll() 与 waitlist.join() 均在分布式锁 + 事务内重新读取课程，
 * 以最新数据为准做权威校验，防止用户在报名页停留期间课程被改动后仍下单。
 */
describe('报名/候补二次校验兜底', () => {
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

  it('A. 报名尚未开始（enrollStartAt 在未来）应被拦截', async () => {
    const course = await seeder.course({
      enrollStartAt: new Date(Date.now() + 24 * 3600 * 1000),
    })
    const user = await seeder.user()
    await expect(ctx.enrollment.enroll(course!.id, user.id, {})).rejects.toThrow(/尚未开始/)
  })

  it('B. 报名已截止（enrollEndAt 已过去）应被拦截', async () => {
    const course = await seeder.course({
      enrollEndAt: new Date(Date.now() - 3600 * 1000),
    })
    const user = await seeder.user()
    await expect(ctx.enrollment.enroll(course!.id, user.id, {})).rejects.toThrow(/已截止/)
  })

  it('C. 课程已开课或已结束（startDate 已过去，模拟改期到过去）应被拦截', async () => {
    const course = await seeder.course({ startInHours: -2 })
    const user = await seeder.user()
    await expect(ctx.enrollment.enroll(course!.id, user.id, {})).rejects.toThrow(/已开课|已结束/)
  })

  it('D. 场地被停用（改场后 isAvailable=false）应拦截报名', async () => {
    const course = await seeder.course({})
    await ctx.prisma.venue.update({
      where: { id: course!.venueId },
      data: { isAvailable: false },
    })
    const user = await seeder.user()
    await expect(ctx.enrollment.enroll(course!.id, user.id, {})).rejects.toThrow(/场地/)
  })

  it('E. 候补加入同样兜底：课程已开课或已结束时禁止候补', async () => {
    const course = await seeder.course({
      maxCapacity: 1,
      currentEnrolled: 1,
      waitlistEnabled: true,
      startInHours: -2,
    })
    const user = await seeder.user()
    await expect(ctx.waitlist.join(course!.id, user.id)).rejects.toThrow(/已开课|已结束/)
  })

  it('F. 正常课程（时间窗有效、场地可用）不被误伤，报名成功', async () => {
    const course = await seeder.course({
      enrollStartAt: new Date(Date.now() - 3600 * 1000),
      enrollEndAt: new Date(Date.now() + 100 * 3600 * 1000),
    })
    const user = await seeder.user()
    const res = await ctx.enrollment.enroll(course!.id, user.id, {})
    expect(res.orderId).toBeTruthy()
  })
})
