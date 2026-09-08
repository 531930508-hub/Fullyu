import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../common/prisma.service'
import { PaymentService } from '../payment/payment.service'
import { NotificationService } from '../../common/notification/notification.service'

/**
 * 课程定时任务：
 * - 成团截止到期且报名人数不足 minCapacity → 自动取消 + 全额退款 + 通知学员
 */
@Injectable()
export class CourseTasksService {
  private readonly logger = new Logger('CourseTasksService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly notification: NotificationService,
  ) {}

  /**
   * 每 5 分钟扫描：已发布且成团截止已过、报名人数不足的课程 → 自动取消
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelUnformedCourses() {
    const now = new Date()

    // 查找已过成团截止且人数不足的已发布课程
    const courses = await this.prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        groupDeadline: { not: null, lt: now },
      },
    })

    // 只处理人数不足的
    const unformed = courses.filter((c) => c.currentEnrolled < c.minCapacity)
    if (!unformed.length) return

    for (const course of unformed) {
      try {
        await this.cancelAndRefund(course)
      } catch (e) {
        this.logger.error(`未成团自动取消失败 [${course.id}] ${course.title}: ${(e as Error).message}`)
      }
    }
    this.logger.log(`未成团自动取消处理 ${unformed.length} 门课程`)
  }

  /**
   * 单门课程取消 + 全额退款 + 通知
   */
  private async cancelAndRefund(course: any) {
    const reason = '课程未达最低成团人数，系统自动取消'

    // 1. 课程状态 → CANCELLED，释放场地占用
    await this.prisma.$transaction(async (tx) => {
      await tx.course.update({
        where: { id: course.id },
        data: { status: 'CANCELLED' },
      })
      await tx.venueReservation.deleteMany({ where: { courseId: course.id } })
    })

    // 2. 全额退款所有已支付的课程订单
    const paidOrders = await this.prisma.order.findMany({
      where: { courseId: course.id, orderType: 'COURSE', status: { in: ['PAID', 'COMPLETED'] } },
    })
    for (const order of paidOrders) {
      try {
        await this.paymentService.refundFull(order.id, reason)
      } catch (e) {
        this.logger.error(`退款失败 order=${order.id}: ${(e as Error).message}`)
      }
    }

    // 3. 全额退款所有 WAITING 候补
    const waitingEntries = await this.prisma.waitlistEntry.findMany({
      where: { courseId: course.id, status: 'WAITING' },
    })
    for (const entry of waitingEntries) {
      try {
        if (entry.orderId) {
          await this.paymentService.refundFull(entry.orderId, reason)
        }
        await this.prisma.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        })
      } catch (e) {
        this.logger.error(`候补退款失败 entry=${entry.id}: ${(e as Error).message}`)
      }
    }

    // 4. 通知所有已报名用户
    const allUserIds = [
      ...paidOrders.map((o) => o.userId),
      ...waitingEntries.map((e) => e.userId),
    ]
    const uniqueUserIds = [...new Set(allUserIds)]
    for (const userId of uniqueUserIds) {
      const amount = paidOrders.find((o) => o.userId === userId)?.actualPaid
      await this.notification.refundSuccess(userId, {
        courseName: course.title,
        amount: amount ? `¥${Number(amount).toFixed(2)}` : '全额退款',
        orderId: paidOrders.find((o) => o.userId === userId)?.id ?? '',
      }).catch(() => undefined)
    }

    this.logger.log(`课程「${course.title}」未成团自动取消，退款 ${paidOrders.length} 笔订单、${waitingEntries.length} 条候补`)
  }
}
