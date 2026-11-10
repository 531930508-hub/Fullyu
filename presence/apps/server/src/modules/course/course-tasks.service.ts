import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../common/prisma.service'
import { PaymentService } from '../payment/payment.service'
import { NotificationService } from '../../common/notification/notification.service'
import { RedisService } from '../../common/redis.service'
import { orderAmountToYuan, courseStartAt } from '@fullyu/shared'

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
    private readonly redis: RedisService,
  ) {}

  /**
   * 每 5 分钟扫描：已发布且成团截止已过、报名人数不足的课程 → 自动取消
   * @param courseId 仅处理指定课程（测试/人工单课补偿用；定时任务不传）
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelUnformedCourses(courseId?: string) {
    const now = new Date()

    // 查找已过成团截止且人数不足的已发布课程
    const courses = await this.prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        groupDeadline: { not: null, lt: now },
        ...(courseId ? { id: courseId } : {}),
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
        await this.paymentService.refundFull(order.id, reason, { source: 'SYSTEM' })
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
          await this.paymentService.refundFull(entry.orderId, reason, { source: 'SYSTEM' })
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
        amount: amount ? `¥${orderAmountToYuan('COURSE', Number(amount)).toFixed(2)}` : '全额退款',
        orderId: paidOrders.find((o) => o.userId === userId)?.id ?? '',
      }).catch(() => undefined)
    }

    this.logger.log(`课程「${course.title}」未成团自动取消，退款 ${paidOrders.length} 笔订单、${waitingEntries.length} 条候补`)
  }

  /**
   * 每 5 分钟扫描：开课前 70 分钟窗口内已支付的正式课订单 → 下发「开课提醒」订阅消息。
   * - 用户在报课时通过 requestSubscribeMessage 一次性授权；未授权则微信侧拒绝（43101），不影响流程；
   * - Redis 去重键保证每笔订单只提醒一次（TTL 24h）；
   * - 窗口取 70 分钟而非 60：5 分钟一次的扫描必然在「剩 60±10 分钟」内命中一次，
   *   同时覆盖临开课前才完成支付的订单（此时窗口内任一扫描都会补发）。
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendCourseStartReminders(): Promise<number> {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + 70 * 60 * 1000)
    // startDate 存的是开课日 0 点（后台按 YYYY-MM-DD 提交），真实开课时刻 = 日期 + startTime，
    // 因此先按「今天」粗筛，再用 shared 的 courseStartAt 口径精筛 70 分钟窗口。
    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000)
    const orders = await this.prisma.order.findMany({
      where: {
        orderType: 'COURSE',
        status: 'PAID',
        course: { status: 'PUBLISHED', startDate: { gte: dayStart, lt: dayEnd } },
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            status: true,
            startDate: true,
            startTime: true,
            venue: { select: { name: true } },
          },
        },
      },
    })

    let sent = 0
    for (const order of orders) {
      const course = order.course
      if (!course) continue
      const startAt = courseStartAt(course)
      if (startAt.getTime() < now.getTime() || startAt.getTime() > windowEnd.getTime()) continue
      // 首次命中才发送：锁键被占用说明已提醒过
      const firstHit = await this.redis.acquireLock(`course:reminder:${order.id}`, 24 * 3600)
      if (!firstHit) continue
      const pad = (n: number) => String(n).padStart(2, '0')
      const startText = `${startAt.getFullYear()}-${pad(startAt.getMonth() + 1)}-${pad(startAt.getDate())} ${pad(startAt.getHours())}:${pad(startAt.getMinutes())}`
      try {
        await this.notification.courseReminder(order.userId, {
          courseName: course.title,
          startTime: startText.trim(),
          venue: course.venue?.name || '待确认',
          courseId: course.id,
        })
        sent++
      } catch (e) {
        this.logger.warn(`开课提醒下发失败 [${order.id}] ${(e as Error).message}`)
      }
    }
    if (sent > 0) this.logger.log(`开课提醒已下发 ${sent} 笔订单`)
    return sent
  }
}
