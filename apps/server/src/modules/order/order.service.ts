import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { WaitlistService } from '../waitlist/waitlist.service'
import { SEAT_LOCK_DURATION_MINUTES } from '@fullyu/shared'

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly waitlist: WaitlistService,
  ) {}

  /**
   * 预约锁定席位
   */
  async lockSeat(courseId: string, userId: string) {
    // 1. 检查课程是否有空位
    const course = await this.prisma.course.findUnique({ where: { id: courseId } })
    if (!course) throw new Error('课程不存在')
    if (course.currentEnrolled >= course.maxCapacity) throw new Error('席位已满')

    // 2. Redis 锁定席位
    const locked = await this.redis.lockSeat(
      courseId,
      userId,
      SEAT_LOCK_DURATION_MINUTES * 60,
    )
    if (!locked) throw new Error('您已锁定该课程席位，请在10分钟内完成支付')

    return { locked: true, ttl: SEAT_LOCK_DURATION_MINUTES * 60 }
  }

  /**
   * 创建订单
   */
  async createOrder(data: {
    userId: string
    courseId: string
    originalPrice: number
    discountAmount: number
    pointsDeduction: number
    voucherDeduction: number
    voucherId?: string
  }) {
    const actualPaid = data.originalPrice - data.discountAmount - data.pointsDeduction - data.voucherDeduction

    return this.prisma.order.create({
      data: {
        userId: data.userId,
        courseId: data.courseId,
        originalPrice: data.originalPrice,
        discountAmount: data.discountAmount,
        pointsDeduction: data.pointsDeduction,
        voucherDeduction: data.voucherDeduction,
        actualPaid: Math.max(0, actualPaid),
        voucherId: data.voucherId,
      },
    })
  }

  /**
   * 获取用户订单列表
   */
  async findByUser(userId: string, status?: string) {
    const where: any = { userId }
    if (status) where.status = status

    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        course: {
          select: { title: true, coverImage: true, startDate: true, startTime: true, endTime: true },
        },
      },
    })
  }

  /**
   * 后台订单列表（可按状态/类型/关键字过滤）
   */
  async adminList(query: { status?: string; orderType?: string; keyword?: string }) {
    const where: any = {}
    if (query.status) where.status = query.status
    if (query.orderType) where.orderType = query.orderType
    if (query.keyword) {
      where.OR = [
        { user: { phone: { contains: query.keyword } } },
        { user: { nickname: { contains: query.keyword, mode: 'insensitive' } } },
      ]
    }
    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { phone: true, nickname: true } },
        course: { select: { title: true, startDate: true } },
      },
    })
  }

  /**
   * 取消订单
   */
  async cancelOrder(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { course: true },
    })
    if (!order) throw new Error('订单不存在')

    // 计算退款金额（根据退款规则）
    const refundAmount = this.calculateRefund(order)

    // 更新订单状态
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancelTime: new Date(),
        cancelReason: reason,
        refundAmount,
      },
    })

    // 释放席位（仅课程订单）
    if (order.courseId) {
      await this.prisma.course.update({
        where: { id: order.courseId },
        data: { currentEnrolled: { decrement: 1 } },
      })

      // 释放 Redis 锁
      await this.redis.unlockSeat(order.courseId, userId)

      // 退课释放名额后触发候补递补
      await this.waitlist.promote(order.courseId).catch(() => undefined)
    }

    return { refundAmount }
  }

  private calculateRefund(order: any): number {
    const now = new Date()
    const courseStart = new Date(order.course.startDate)
    const hoursUntilStart = (courseStart.getTime() - now.getTime()) / (1000 * 60 * 60)

    if (hoursUntilStart >= 24) return Number(order.actualPaid) * 0.9
    if (hoursUntilStart >= 1) return Number(order.actualPaid) * 0.6
    return 0
  }
}
