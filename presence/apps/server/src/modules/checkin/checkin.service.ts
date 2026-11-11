import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { CrmClient } from '../../common/crm/crm.client'

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmClient,
  ) {}

  /** 某课程报名学员 + 签到状态 + 报名日期 + 有效会员卡 */
  async courseRoster(courseId: string) {
    const now = new Date()
    const [orders, checkIns] = await Promise.all([
      this.prisma.order.findMany({
        where: { courseId, orderType: 'COURSE', status: { in: ['PAID', 'COMPLETED'] } },
        include: { user: { select: { id: true, phone: true, nickname: true, avatar: true, photo: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.checkIn.findMany({ where: { courseId } }),
    ])
    const checkedUserIds = new Set(checkIns.map((c) => c.userId))
    const userIds = orders.map((o) => o.userId)
    const [cards, birthdays] = await Promise.all([
      userIds.length
        ? this.prisma.memberCard.findMany({
            where: { userId: { in: userIds }, status: 'ACTIVE', endDate: { gt: now } },
            select: { userId: true, type: true },
            orderBy: { endDate: 'desc' },
          })
        : [],
      this.crm.getBirthdays(userIds),
    ])
    const cardMap = new Map(cards.map((c) => [c.userId, c.type]))
    return orders.map((o) => ({
      orderId: o.id,
      user: { ...o.user, birthday: birthdays.get(o.userId) ?? null },
      checkedIn: checkedUserIds.has(o.userId),
      enrolledAt: o.createdAt,
      cardType: cardMap.get(o.userId) ?? null,
    }))
  }

  /** 手工签到 */
  async manualCheckIn(courseId: string, userId: string) {
    const exists = await this.prisma.checkIn.findUnique({
      where: { userId_courseId: { userId, courseId } },
    })
    if (exists) throw new BusinessException('该学员已签到', 4080)

    const order = await this.prisma.order.findFirst({
      where: { courseId, userId, orderType: 'COURSE', status: { in: ['PAID', 'COMPLETED'] } },
    })
    if (!order) throw new BusinessException('该学员未报名该课程', 4081)

    return this.prisma.checkIn.create({
      data: { courseId, userId, method: 'MANUAL' },
    })
  }

  /** 取消签到 */
  async cancelCheckIn(courseId: string, userId: string) {
    await this.prisma.checkIn
      .delete({ where: { userId_courseId: { userId, courseId } } })
      .catch(() => undefined)
    return { success: true }
  }

  /** 由 startDate（日期）+ startTime（HH:mm）拼出课程实际开课时刻 */
  private courseStartAt(course: { startDate: Date; startTime: string }): Date {
    const d = new Date(course.startDate)
    const [h, m] = (course.startTime || '00:00').split(':').map((v) => Number(v))
    d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0)
    return d
  }

  /**
   * 签到首页默认：开课时刻落在 [now-1h, now+2h] 的课程 + 各自报名名单（含个人照片）
   * 便于员工在开课前后线下核对人脸并签到
   */
  async upcomingCheckins() {
    const now = new Date()
    const from = new Date(now.getTime() - 60 * 60 * 1000)
    const to = new Date(now.getTime() + 120 * 60 * 1000)
    const dayFrom = new Date(from)
    dayFrom.setHours(0, 0, 0, 0)
    const dayTo = new Date(to)
    dayTo.setHours(23, 59, 59, 999)
    const courses = await this.prisma.course.findMany({
      where: {
        status: { in: ['PUBLISHED', 'COMPLETED'] },
        startDate: { gte: dayFrom, lte: dayTo },
      },
      orderBy: { startDate: 'asc' },
      select: { id: true, title: true, startDate: true, startTime: true, endTime: true, status: true },
    })
    const inWindow = courses.filter((c) => {
      const s = this.courseStartAt(c)
      return s >= from && s <= to
    })
    const result = []
    for (const c of inWindow) {
      const roster = await this.courseRoster(c.id)
      result.push({ course: c, roster })
    }
    return result
  }

  /**
   * 签到管理可检索的课程范围：尚未结课 + 近3日内结课（endDate >= now-3d），排除草稿/已下架
   */
  async checkinCourses(keyword?: string) {
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const where: any = {
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      endDate: { gte: threeDaysAgo },
    }
    if (keyword) where.title = { contains: keyword }
    return this.prisma.course.findMany({
      where,
      orderBy: { startDate: 'desc' },
      select: { id: true, title: true, startDate: true, startTime: true, endDate: true, status: true },
    })
  }
}
