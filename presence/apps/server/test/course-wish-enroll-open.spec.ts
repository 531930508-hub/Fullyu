import { CourseTasksService } from '../src/modules/course/course-tasks.service'

/**
 * 即将会开课程许愿：报名开放时由定时任务通知尚未通知的心愿用户。
 * - 只处理报名已开放且仍在报名窗口内的课程；
 * - 发送成功才标记 notifiedAt，模板未配置/无 openid 时保留心愿。
 */
describe('报名开放心愿通知', () => {
  function build(wishesResult: any[], delivered: boolean) {
    const startDate = new Date(Date.now() + 24 * 3600 * 1000)
    const prisma: any = {
      course: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            title: '晨间瑜伽',
            status: 'PUBLISHED',
            startDate,
            endDate: startDate,
            startTime: '10:00',
            endTime: '11:00',
            enrollStartAt: new Date(Date.now() - 3600 * 1000),
            enrollEndAt: startDate,
            venueId: 'v1',
            venue: { name: '静安馆' },
          },
        ]),
      },
      courseWish: {
        findMany: jest.fn().mockResolvedValue(wishesResult),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    const notification: any = {
      courseWishReleased: jest.fn().mockResolvedValue(delivered),
    }
    const service = new CourseTasksService(prisma, {} as any, notification, {} as any)
    return { service, prisma, notification }
  }

  it('报名开放后通知心愿用户并标记已通知', async () => {
    const { service, prisma, notification } = build(
      [
        { id: 'w1', userId: 'u1' },
        { id: 'w2', userId: 'u2' },
      ],
      true,
    )
    await expect(service.notifyWishEnrollmentOpened()).resolves.toBe(2)
    expect(notification.courseWishReleased).toHaveBeenCalledTimes(2)
    expect(notification.courseWishReleased).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ courseId: 'c1', venue: '静安馆' }),
    )
    expect(prisma.courseWish.update).toHaveBeenCalledTimes(2)
    expect(prisma.courseWish.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { notifiedAt: expect.any(Date), notifiedCourseId: 'c1' },
    })
  })

  it('订阅消息未真正下发（模板未配/无 openid）时不标记心愿', async () => {
    const { service, prisma } = build([{ id: 'w1', userId: 'u1' }], false)
    await expect(service.notifyWishEnrollmentOpened()).resolves.toBe(0)
    expect(prisma.courseWish.update).not.toHaveBeenCalled()
  })
})