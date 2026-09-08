import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { PaymentService } from '../payment/payment.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { SEAT_LOCK_DURATION_MINUTES, POINTS_TO_YUAN_RATIO } from '@fullyu/shared'
import { generateOrderNo } from '../../common/order-no.helper'

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly payment: PaymentService,
  ) {}

  /**
   * 生成自定义订单号：前缀+YYMMDD+5位流水
   * C=课程 M=会员卡 W=候补
   */
  async generateOrderNo(type: 'COURSE' | 'MEMBER_CARD' | 'WAITLIST'): Promise<string> {
    return generateOrderNo(this.redis, type)
  }

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
    orderType?: 'COURSE' | 'MEMBER_CARD' | 'WAITLIST'
  }) {
    const actualPaid = data.originalPrice - data.discountAmount - data.pointsDeduction - data.voucherDeduction
    const orderType = data.orderType || 'COURSE'
    const orderNo = await this.generateOrderNo(orderType)

    return this.prisma.order.create({
      data: {
        orderNo,
        userId: data.userId,
        courseId: data.courseId,
        orderType,
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
        { user: { nickname: { contains: query.keyword } } },
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
   * 取消订单 / 用户主动退款
   * - 待支付（PENDING_PAYMENT）：取消占位，回补预扣积分与预占代金券；不涉及退款，也不减名额
   *   （未支付订单从未占用 currentEnrolled，占位仅体现在待支付计数中）
   * - 已支付（PAID/COMPLETED）：走标准退款链路，名额释放与候补递补由退款成功回调统一处理
   *   · 课程订单：按课程 refundRules 阶梯计算退款并原路退回微信
   *   · 候补订单：全额退回微信
   */
  async cancelOrder(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { course: true },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)

    if (order.status === 'PAID' || order.status === 'COMPLETED') {
      if (order.orderType === 'WAITLIST') {
        return this.payment.refundFull(orderId, reason || '用户取消候补')
      }
      return this.payment.refundOrder(orderId, reason)
    }

    if (order.status === 'PENDING_PAYMENT') {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            cancelTime: new Date(),
            cancelReason: reason,
            refundAmount: 0,
          },
        })

        // 回补预扣积分（enroll 下单时以负向流水预扣）
        if (Number(order.pointsDeduction) > 0) {
          const last = await tx.pointsRecord.findFirst({
            where: { userId: order.userId },
            orderBy: { createdAt: 'desc' },
          })
          const balance = last?.balance ?? 0
          const refundPoints = Math.round(Number(order.pointsDeduction) / POINTS_TO_YUAN_RATIO)
          await tx.pointsRecord.create({
            data: {
              userId: order.userId,
              amount: refundPoints,
              balance: balance + refundPoints,
              type: 'OTHER',
              reason: '取消订单，积分返还',
              relatedId: order.id,
            },
          })
        }

        // 回补预占代金券
        if (order.voucherId) {
          await tx.voucher.update({
            where: { id: order.voucherId },
            data: { status: 'UNUSED', usedAt: null },
          })
        }
      })

      if (order.courseId) {
        await this.redis.unlockSeat(order.courseId, userId).catch(() => undefined)
      }
      return { refundAmount: 0 }
    }

    throw new BusinessException('订单当前状态不可取消', 4007)
  }
}
