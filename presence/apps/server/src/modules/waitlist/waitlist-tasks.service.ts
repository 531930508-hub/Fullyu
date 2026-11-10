import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../common/prisma.service'
import { PaymentService } from '../payment/payment.service'

/**
 * 候补定时任务：
 * - 候补截止（开课前 waitlistDeadlineHours 小时）到点仍未轮上 → 自动全额退款
 * - 待支付候补订单超时清理
 */
@Injectable()
export class WaitlistTasksService {
  private readonly logger = new Logger('WaitlistTasksService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * 每 5 分钟扫描：候补截止仍未轮上的 WAITING 条目 → 全额退款
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async refundExpiredWaitlist() {
    const now = new Date()
    const entries = await this.prisma.waitlistEntry.findMany({
      where: { status: 'WAITING' },
      include: { course: true },
    })

    let count = 0
    for (const entry of entries) {
      const course = entry.course
      if (!course?.startDate) continue

      const deadlineHours = course.waitlistDeadlineHours
        ? Number(course.waitlistDeadlineHours)
        : 0
      const deadline = new Date(
        new Date(course.startDate).getTime() - deadlineHours * 3_600_000,
      )
      if (now < deadline) continue

      try {
        if (entry.orderId) {
          await this.paymentService.refundFull(entry.orderId, '候补截止未轮上，自动全额退款')
        }
        // 退款回调会最终置 REFUNDED；此处先标记，避免重复处理
        await this.prisma.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        })
        count++
      } catch (e) {
        this.logger.error(`候补退款失败 ${entry.id}: ${(e as Error).message}`)
      }
    }
    if (count > 0) this.logger.log(`候补超时退款处理 ${count} 条`)
  }
}
