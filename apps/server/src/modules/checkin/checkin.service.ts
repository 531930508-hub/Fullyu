import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class CheckinService {
  constructor(private readonly prisma: PrismaService) {}

  /** 某课程报名学员 + 签到状态 */
  async courseRoster(courseId: string) {
    const [orders, checkIns] = await Promise.all([
      this.prisma.order.findMany({
        where: { courseId, orderType: 'COURSE', status: { in: ['PAID', 'COMPLETED'] } },
        include: { user: { select: { id: true, phone: true, nickname: true, avatar: true } } },
      }),
      this.prisma.checkIn.findMany({ where: { courseId } }),
    ])
    const checkedUserIds = new Set(checkIns.map((c) => c.userId))
    return orders.map((o) => ({
      orderId: o.id,
      user: o.user,
      checkedIn: checkedUserIds.has(o.userId),
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
}
