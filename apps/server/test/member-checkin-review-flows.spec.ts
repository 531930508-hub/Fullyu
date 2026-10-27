import { buildTestContext, Seeder, TestContext } from './helpers'
import { MemberService } from '../src/modules/member/member.service'
import { CheckinService } from '../src/modules/checkin/checkin.service'
import { ReviewService } from '../src/modules/review/review.service'
import { BusinessException } from '../src/common/exceptions/business.exception'
import { RedisService } from '../src/common/redis.service'

/**
 * 非资金流程：会员卡缺席冻结/解冻、签到名单与手工签到、课程评价。
 */
describe('会员卡/签到/评价非资金流程', () => {
  let ctx: TestContext
  let seeder: Seeder
  let member: MemberService
  let checkin: CheckinService
  let review: ReviewService
  const courseIds: string[] = []

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    member = new MemberService(ctx.prisma, ctx.moduleRef.get(RedisService))
    checkin = new CheckinService(ctx.prisma)
    review = new ReviewService(ctx.prisma)
  })

  afterAll(async () => {
    await ctx.prisma.review.deleteMany({ where: { courseId: { in: courseIds } } })
    await ctx.prisma.checkIn.deleteMany({ where: { courseId: { in: courseIds } } })
    await seeder.cleanup()
    await ctx.app.close()
  })

  const paidCourseOrder = async (userId: string, courseId: string, status: 'PAID' | 'CANCELLED' = 'PAID') => {
    const orderNo = await ctx.order.generateOrderNo('COURSE')
    return ctx.prisma.order.create({
      data: {
        orderNo,
        userId,
        courseId,
        orderType: 'COURSE',
        originalPrice: 100,
        actualPaid: 100,
        status,
        paymentTime: status === 'PAID' ? new Date() : null,
      },
    })
  }

  it('会员卡累计 3 次缺席自动冻结，解冻重置次数，过期卡解冻后为 EXPIRED', async () => {
    const user = await seeder.user()
    const card = await seeder.memberCard(user.id)

    expect((await member.recordAbsence(card.id)).absences).toBe(1)
    expect((await member.recordAbsence(card.id)).status).toBe('ACTIVE')
    const third = await member.recordAbsence(card.id)
    expect(third.absences).toBe(3)
    expect(third.status).toBe('FROZEN')

    await expect(member.unfreeze(card.id)).resolves.toMatchObject({ status: 'ACTIVE', absences: 0 })
    await expect(member.unfreeze(card.id)).rejects.toBeInstanceOf(BusinessException)

    await member.freeze(card.id)
    expect((await ctx.prisma.memberCard.findUnique({ where: { id: card.id } }))!.status).toBe('FROZEN')

    const expiredUser = await seeder.user()
    const expiredCard = await ctx.prisma.memberCard.create({
      data: {
        userId: expiredUser.id,
        type: 'MONTHLY',
        status: 'FROZEN',
        startDate: new Date(Date.now() - 60 * 86400 * 1000),
        endDate: new Date(Date.now() - 86400 * 1000),
        absences: 3,
      },
    })
    const thawed = await member.unfreeze(expiredCard.id)
    expect(thawed.status).toBe('EXPIRED')
    expect(thawed.absences).toBe(0)
  })

  it('签到名单只含有效报名并标记会员卡，手工签到防重复，取消后可重签', async () => {
    const user = await seeder.user()
    const cancelledUser = await seeder.user()
    const start = new Date(Date.now() + 30 * 60 * 1000)
    const hhmm = (d: Date) => `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
    const course = await seeder.course({
      startDate: start,
      endDate: new Date(start.getTime() + 3600 * 1000),
      startTime: hhmm(start),
      endTime: hhmm(new Date(start.getTime() + 3600 * 1000)),
    })
    courseIds.push(course!.id)
    await paidCourseOrder(user.id, course!.id)
    await paidCourseOrder(cancelledUser.id, course!.id, 'CANCELLED')
    await seeder.memberCard(user.id)

    const roster = await checkin.courseRoster(course!.id)
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ checkedIn: false, cardType: 'YEARLY' })
    expect(roster[0].user.id).toBe(user.id)

    await expect(checkin.manualCheckIn(course!.id, cancelledUser.id)).rejects.toBeInstanceOf(
      BusinessException,
    )
    const record = await checkin.manualCheckIn(course!.id, user.id)
    expect(record.method).toBe('MANUAL')
    await expect(checkin.manualCheckIn(course!.id, user.id)).rejects.toBeInstanceOf(BusinessException)
    expect((await checkin.courseRoster(course!.id))[0].checkedIn).toBe(true)

    await checkin.cancelCheckIn(course!.id, user.id)
    expect((await checkin.courseRoster(course!.id))[0].checkedIn).toBe(false)
    await checkin.cancelCheckIn(course!.id, user.id)
    expect((await checkin.manualCheckIn(course!.id, user.id)).id).toBeTruthy()

    const upcoming = await checkin.upcomingCheckins()
    const entry = upcoming.find((u) => u.course.id === course!.id)
    expect(entry).toBeTruthy()
    expect(entry!.roster[0].checkedIn).toBe(true)

    const searchable = await checkin.checkinCourses(course!.title)
    expect(searchable.some((c) => c.id === course!.id)).toBe(true)
  })

  it('课程评价：仅已报名可评，评分边界，重复提交覆盖，导师统计与删除', async () => {
    const user = await seeder.user()
    const course = await seeder.course()
    courseIds.push(course!.id)

    await expect(
      review.submitReview(user.id, { courseId: course!.id, rating: 5 }),
    ).rejects.toBeInstanceOf(BusinessException)
    await paidCourseOrder(user.id, course!.id)

    await expect(
      review.submitReview(user.id, { courseId: course!.id, rating: 0 }),
    ).rejects.toBeInstanceOf(BusinessException)
    await expect(
      review.submitReview(user.id, { courseId: course!.id, rating: 6 }),
    ).rejects.toBeInstanceOf(BusinessException)

    const first = await review.submitReview(user.id, {
      courseId: course!.id,
      rating: 4,
      content: '不错',
    })
    const second = await review.submitReview(user.id, {
      courseId: course!.id,
      rating: 5,
      content: '很好',
    })
    expect(second.id).toBe(first.id)
    expect(second).toMatchObject({ rating: 5, content: '很好' })
    expect(await review.courseReviews(course!.id)).toHaveLength(1)
    expect(await review.myReviews(user.id)).toHaveLength(1)

    const trainerStats = await review.trainerReviews(course!.trainerId)
    expect(trainerStats.count).toBe(1)
    expect(trainerStats.avgRating).toBe(5)

    await review.remove(second.id)
    expect(await review.courseReviews(course!.id)).toHaveLength(0)
  })
})
