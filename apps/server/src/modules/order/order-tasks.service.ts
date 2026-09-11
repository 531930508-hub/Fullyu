import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { SEAT_LOCK_DURATION_MINUTES, POINTS_TO_FEN_RATIO } from '@fullyu/shared'

/**
 * 订单定时任务：待支付超时自动取消并释放占位、回补积分/代金券。
 */
@Injectable()
export class OrderTasksService {
  private readonly logger = new Logger('OrderTasksService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 每分钟扫描超时未支付的课程报名订单并取消
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async cancelExpiredOrders() {
    const deadline = new Date(Date.now() - SEAT_LOCK_DURATION_MINUTES * 60 * 1000)
    const expired = await this.prisma.order.findMany({
      where: {
        orderType: 'COURSE',
        status: 'PENDING_PAYMENT',
        createdAt: { lt: deadline },
      },
    })
    if (!expired.length) return

    for (const order of expired) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const fresh = await tx.order.findUnique({ where: { id: order.id } })
          if (!fresh || fresh.status !== 'PENDING_PAYMENT') return

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'CANCELLED',
              cancelTime: new Date(),
              cancelReason: '待支付超时自动取消',
            },
          })

          // 回补积分
          if (Number(fresh.pointsDeduction) > 0) {
            const last = await tx.pointsRecord.findFirst({
              where: { userId: fresh.userId },
              orderBy: { createdAt: 'desc' },
            })
            const balance = last?.balance ?? 0
            const refundPoints = Math.round(Number(fresh.pointsDeduction) / POINTS_TO_FEN_RATIO)
            await tx.pointsRecord.create({
              data: {
                userId: fresh.userId,
                amount: refundPoints,
                balance: balance + refundPoints,
                type: 'OTHER',
                reason: '订单超时取消，积分返还',
                relatedId: fresh.id,
              },
            })
          }

          // 回补代金券
          if (fresh.voucherId) {
            await tx.voucher.update({
              where: { id: fresh.voucherId },
              data: { status: 'UNUSED', usedAt: null },
            })
          }
        })

        if (order.courseId) {
          await this.redis.unlockSeat(order.courseId, order.userId).catch(() => undefined)
        }
      } catch (e) {
        this.logger.error(`取消超时订单失败 ${order.id}: ${(e as Error).message}`)
      }
    }
    this.logger.log(`已处理 ${expired.length} 笔超时订单`)
  }
}
