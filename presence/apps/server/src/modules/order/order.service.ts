import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { PaymentService } from '../payment/payment.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { SEAT_LOCK_DURATION_MINUTES, POINTS_TO_FEN_RATIO } from '@fullyu/shared'
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
    return generateOrderNo(this.redis, type, this.prisma)
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

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        // 订单列表只为“下一场课/我的预约”提供时间与场地信息，不返回封面等大字段
        course: {
          select: {
            title: true,
            startDate: true,
            startTime: true,
            endTime: true,
            venue: { select: { name: true } },
            trainer: { select: { displayName: true } },
          },
        },
        community: { select: { id: true, name: true, yearlyFee: true } },
      },
    })

    // 待支付订单返回支付截止时间，前端据此倒计时；超时后由定时任务取消
    const lockMs = SEAT_LOCK_DURATION_MINUTES * 60 * 1000
    return orders.map((order) => ({
      ...order,
      expireAt:
        order.status === 'PENDING_PAYMENT'
          ? new Date(order.createdAt.getTime() + lockMs)
          : null,
    }))
  }

  /** 首页“下一场在场”：只查最近一小批已支付课程订单，避免拉取全部订单。 */
  async findNextCourse(userId: string) {
    // 业务时区固定东八区：课程日期按 +08:00 的当天零点起算。
    const shanghaiToday = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    const today = new Date(`${shanghaiToday}T00:00:00+08:00`)
    const orders = await this.prisma.order.findMany({
      where: {
        userId,
        orderType: 'COURSE',
        status: 'PAID',
        course: { startDate: { gte: today } },
      },
      take: 50,
      select: {
        id: true,
        course: {
          select: {
            title: true,
            startDate: true,
            startTime: true,
            endTime: true,
            venue: { select: { name: true } },
            trainer: { select: { displayName: true } },
          },
        },
      },
    })
    const now = Date.now()
    // 课程日期以 +08:00 的自然日为准。
    const dateKey = (value: Date | string) => {
      const date = value instanceof Date ? value : new Date(value)
      return new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    }
    const upcoming = orders
      .filter((order) => {
        const course = order.course
        if (!course?.startDate) return false
        const start = new Date(`${dateKey(course.startDate)}T${course.startTime || '00:00'}:00+08:00`).getTime()
        return Number.isFinite(start) && start > now
      })
      .sort((a, b) =>
        dateKey(a.course!.startDate).localeCompare(dateKey(b.course!.startDate)) ||
        String(a.course!.startTime || '').localeCompare(String(b.course!.startTime || '')),
      )
    return upcoming[0] || null
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
        community: { select: { name: true, yearlyFee: true } },
        refunds: {
          select: { id: true, status: true, amountFen: true, outRefundNo: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
  }

  /**
   * 取消订单 / 用户主动退款
   * - 待支付（PENDING_PAYMENT）：取消占位，回补预扣积分与预占代金券；不涉及退款，也不减名额
   *   （未支付订单从未占用 currentEnrolled，占位仅体现在待支付计数中）
   * - 已支付且课程未开始（PAID）：走标准退款链路，名额释放与候补递补由退款成功回调统一处理
   *   · 课程订单：按课程 refundRules 阶梯计算退款并原路退回微信
   *   · 候补订单：全额退回微信
   * - 已完成（COMPLETED）：课程已结束，关闭用户自助退款；客诉退款由后台强制退款处理
   */
  /**
   * 自助取消前的退款预览：校验订单归属后委托支付服务按统一口径计算，
   * 不动单、不发起退款；开课后的课程订单会直接报「不支持自助退款」。
   */
  async refundPreview(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    return this.payment.previewRefund(orderId)
  }

  async cancelOrder(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { course: true },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)

    if (order.status === 'COMPLETED') {
      throw new BusinessException('课程已完成，不支持自助退款', 4007)
    }

    if (order.status === 'PAID') {
      if (order.orderType === 'WAITLIST') {
        const result = await this.payment.refundFull(orderId, reason || '用户取消候补')
        // 立即置为已退款：退款回调到达前若有人退出释放名额，
        // 递补只能处理 WAITING 条目，不能把正在退款的候补转正占座。
        await this.prisma.waitlistEntry.updateMany({
          where: { orderId, status: { in: ['WAITING', 'PENDING_PAYMENT'] } },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        })
        return result
      }
      return this.payment.refundOrder(orderId, reason)
    }

    if (order.status === 'PENDING_PAYMENT') {
      const cancelled = await this.prisma.$transaction(async (tx) => {
        // 条件更新：若支付回调已抢先置为 PAID，则不再取消、不重复回补积分与券
        const res = await tx.order.updateMany({
          where: { id: orderId, status: 'PENDING_PAYMENT' },
          data: {
            status: 'CANCELLED',
            cancelTime: new Date(),
            cancelReason: reason,
            refundAmount: 0,
          },
        })
        if (!res.count) return false

        // 候补待支付订单：同步释放候补条目
        if (order.orderType === 'WAITLIST') {
          await tx.waitlistEntry.updateMany({
            where: { orderId, status: 'PENDING_PAYMENT' },
            data: { status: 'CANCELLED' },
          })
        }

        // 回补预扣积分（enroll 下单时以负向流水预扣）
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

        return true
      })

      if (!cancelled) {
        throw new BusinessException('订单状态已变化，请刷新后重试', 4007)
      }

      if (order.courseId) {
        await this.redis.unlockSeat(order.courseId, userId).catch(() => undefined)
      }
      return { refundAmount: 0 }
    }

    throw new BusinessException('订单当前状态不可取消', 4007)
  }
}
