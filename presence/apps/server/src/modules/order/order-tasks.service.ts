import { Injectable, Logger } from '@nestjs/common'
import { tasksEnabled } from '../../common/tasks-enabled'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { SEAT_LOCK_DURATION_MINUTES, POINTS_TO_FEN_RATIO, courseEndAt } from '@fullyu/shared'

/**
 * 订单定时任务：
 * - 待支付超时自动取消并释放占位、回补积分/代金券（课程报名、候补预付、会员卡、社群年费）
 * - 课程结束后将已支付课程订单置为「已完成」，关闭用户自助退款
 */
@Injectable()
export class OrderTasksService {
  private readonly logger = new Logger('OrderTasksService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 每分钟扫描超时未支付订单并取消
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async cancelExpiredOrders() {
    // 双机部署：备用机 TASKS_ENABLED=false，只接请求不跑定时任务（详见 common/tasks-enabled.ts）
    if (!tasksEnabled()) return
    const deadline = new Date(Date.now() - SEAT_LOCK_DURATION_MINUTES * 60 * 1000)
    const expired = await this.prisma.order.findMany({
      where: {
        orderType: { in: ['COURSE', 'WAITLIST', 'MEMBER_CARD', 'COMMUNITY'] },
        status: 'PENDING_PAYMENT',
        createdAt: { lt: deadline },
      },
      take: 200,
    })
    if (!expired.length) return

    let cancelledCount = 0
    for (const order of expired) {
      try {
        const cancelled = await this.prisma.$transaction(async (tx) => {
          // 条件更新：与支付回调并发时，先置为 PAID 的订单不再被取消
          const res = await tx.order.updateMany({
            where: { id: order.id, status: 'PENDING_PAYMENT' },
            data: {
              status: 'CANCELLED',
              cancelTime: new Date(),
              cancelReason: '待支付超时自动取消',
              refundAmount: 0,
            },
          })
          if (!res.count) return false

          // 候补待支付订单：同步释放候补条目
          if (order.orderType === 'WAITLIST') {
            await tx.waitlistEntry.updateMany({
              where: { orderId: order.id, status: 'PENDING_PAYMENT' },
              data: { status: 'CANCELLED' },
            })
          }

          // 回补积分
          if (Number(order.pointsDeduction) > 0) {
            const last = await tx.pointsRecord.findFirst({
              where: { userId: order.userId },
              orderBy: { createdAt: 'desc' },
            })
            const balance = last?.balance ?? 0
            const refundPoints = Math.round(Number(order.pointsDeduction) / POINTS_TO_FEN_RATIO)
            await tx.pointsRecord.create({
              data: {
                userId: order.userId,
                amount: refundPoints,
                balance: balance + refundPoints,
                type: 'OTHER',
                reason: '订单超时取消，积分返还',
                relatedId: order.id,
              },
            })
          }

          // 回补代金券
          if (order.voucherId) {
            await tx.voucher.update({
              where: { id: order.voucherId },
              data: { status: 'UNUSED', usedAt: null },
            })
          }

          return true
        })

        if (!cancelled) continue
        cancelledCount += 1

        if (order.courseId) {
          await this.redis.unlockSeat(order.courseId, order.userId).catch(() => undefined)
        }
      } catch (e) {
        this.logger.error(`取消超时订单失败 ${order.id}: ${(e as Error).message}`)
      }
    }
    this.logger.log(`已扫描 ${expired.length} 笔超时订单，取消 ${cancelledCount} 笔`)
  }

  /**
   * 每 5 分钟扫描：课程结束时刻已过的已支付课程订单 → 置为「已完成」。
   * - 完成后用户侧不再提供自助退款，客诉退款走后台强制退款（二次审批）
   * - 仅处理已发布/已完成课程的 PAID 订单；下架课程由未成行退款链路处理
   * - 条件更新保证与退款/取消并发时不会覆盖其它终态
   * @param courseId 仅处理指定课程（测试用，避免扫到线上其它课程）
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async completeEndedCourseOrders(courseId?: string): Promise<number> {
    // 双机部署：备用机 TASKS_ENABLED=false，只接请求不跑定时任务（详见 common/tasks-enabled.ts）
    if (!tasksEnabled()) return 0
    const now = new Date()
    // 只扫「今天及以前结课」的课程：原来只按 createdAt 升序取 500 条，
    // 一旦在售的未结课订单超过 500，后面的订单永远进不了扫描窗口，自退窗口会过期失效。
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)
    const orders = await this.prisma.order.findMany({
      where: {
        orderType: 'COURSE',
        status: 'PAID',
        ...(courseId ? { courseId } : {}),
        course: {
          status: { in: ['PUBLISHED', 'COMPLETED'] },
          endDate: { lte: todayEnd },
        },
      },
      include: { course: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    })

    let completed = 0
    for (const order of orders) {
      if (!order.course) continue
      if (now.getTime() < courseEndAt(order.course).getTime()) continue
      const res = await this.prisma.order.updateMany({
        where: { id: order.id, status: 'PAID' },
        data: { status: 'COMPLETED' },
      })
      if (res.count) completed += 1
    }
    if (completed > 0) this.logger.log(`课程结束自动完成订单 ${completed} 笔`)
    return completed
  }
}
