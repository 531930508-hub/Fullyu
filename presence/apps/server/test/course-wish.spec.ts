import { BadRequestException } from '@nestjs/common'
import { CourseWishService } from '../src/modules/course/course-wish.service'

/**
 * 往期课程许愿的准入口径：
 * - 只在往期（已结束）课程上可许愿，在售课程直接拒绝；
 * - 重复许愿走 upsert，保持幂等且不重置许愿时间。
 */
describe('往期课程许愿准入', () => {
  function build(course: any) {
    const prisma: any = {
      course: { findUnique: jest.fn().mockResolvedValue(course) },
      courseWish: {
        upsert: jest.fn().mockResolvedValue({ id: 'w1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({ createdAt: new Date() }),
      },
    }
    return { service: new CourseWishService(prisma), prisma }
  }
  const endedCourse = {
    id: 'c1',
    status: 'PUBLISHED',
    startDate: new Date('2026-01-10T00:00:00'),
    endDate: new Date('2026-01-10T00:00:00'),
    startTime: '10:00',
    endTime: '12:00',
    maxCapacity: 10,
    currentEnrolled: 10,
  }

  it('在售课程不允许许愿', async () => {
    const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    const { service, prisma } = build({ ...endedCourse, startDate: nextWeek, endDate: nextWeek })
    await expect(service.add('c1', 'u1')).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.courseWish.upsert).not.toHaveBeenCalled()
  })

  it('已结束课程许愿成功并返回最新人数', async () => {
    const { service, prisma } = build(endedCourse)
    const res = await service.add('c1', 'u1')
    expect(prisma.courseWish.upsert).toHaveBeenCalledWith({
      where: { courseId_userId: { courseId: 'c1', userId: 'u1' } },
      create: { courseId: 'c1', userId: 'u1' },
      update: {},
    })
    expect(res).toMatchObject({ count: 1, wished: true })
  })

  it('即将会开、报名未开始的课程可以许愿', async () => {
    const start = new Date(Date.now() + 3 * 24 * 3600 * 1000)
    const { service, prisma } = build({
      ...endedCourse,
      startDate: start,
      endDate: start,
      enrollStartAt: new Date(Date.now() + 24 * 3600 * 1000),
      enrollEndAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
    })
    await expect(service.add('c1', 'u1')).resolves.toMatchObject({ wished: true })
    expect(prisma.courseWish.upsert).toHaveBeenCalled()
  })

  it('即将会开、报名已截止的课程可以许愿', async () => {
    const start = new Date(Date.now() + 2 * 24 * 3600 * 1000)
    const { service, prisma } = build({
      ...endedCourse,
      startDate: start,
      endDate: start,
      enrollEndAt: new Date(Date.now() - 3600 * 1000),
    })
    await expect(service.add('c1', 'u1')).resolves.toMatchObject({ wished: true })
    expect(prisma.courseWish.upsert).toHaveBeenCalled()
  })

  it('重复许愿幂等：第二次仍返回已许愿', async () => {
    const { service, prisma } = build(endedCourse)
    await service.add('c1', 'u1')
    await service.add('c1', 'u1')
    expect(prisma.courseWish.upsert).toHaveBeenCalledTimes(2)
    const res = await service.add('c1', 'u1')
    expect(res).toMatchObject({ count: 1, wished: true })
  })
})