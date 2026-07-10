import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { WechatPayService } from './wechat-pay.service'
import { NotificationService } from '../../common/notification/notification.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { Prisma } from '@prisma/client'

/** 退款规则条目 */
interface RefundRule {
  hoursFrom: number
  hoursTo: number | null
  refundPercent: number
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger('PaymentService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wechatPay: WechatPayService,
    private readonly notification: NotificationService,
  ) {}

  /**
   * 为待支付订单创建微信 JSAPI 支付，返回小程序调起参数
   */
  async createPayment(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BusinessException('订单状态不可支付', 4005)
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user?.openId) throw new BusinessException('用户未绑定微信', 4006)

    const totalFen = Math.round(Number(order.actualPaid) * 100)
    const description = this.buildDescription(order)

    return this.wechatPay.createJsapiOrder({
      outTradeNo: order.id,
      description,
      totalFen: Math.max(1, totalFen),
      openid: user.openId,
    })
  }

  /**
   * 处理支付成功回调：验签解密 → 幂等更新 → 触发履约
   */
  async handleNotify(rawBody: string): Promise<{ code: string; message: string }> {
    const result = this.wechatPay.decryptNotify(rawBody)
    if (result.trade_state !== 'SUCCESS') {
      return { code: 'SUCCESS', message: 'OK' }
    }

    const orderId = result.out_trade_no
    // 幂等锁：避免并发/重复回调
    const lockKey = `pay_notify_lock:${orderId}`
    const locked = await this.redis.set(lockKey, '1', 10)
    // 无论是否抢到锁都以 DB 状态为准做幂等判断

    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) {
      this.logger.warn(`回调订单不存在: ${orderId}`)
      return { code: 'SUCCESS', message: 'OK' }
    }
    if (order.status === 'PAID' || order.status === 'COMPLETED') {
      // 已处理，幂等返回成功
      return { code: 'SUCCESS', message: 'OK' }
    }

    await this.fulfillPaidOrder(orderId, result.transaction_id)
    return { code: 'SUCCESS', message: 'OK' }
  }

  /**
   * 履约：将订单置为 PAID 并按订单类型触发后续（占座 / 候补入队 / 发卡）
   * 全流程放入事务，保证一致性
   */
  async fulfillPaidOrder(orderId: string, transactionId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order || order.status !== 'PENDING_PAYMENT') return

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          paymentId: transactionId,
          paymentTime: new Date(),
        },
      })

      switch (order.orderType) {
        case 'COURSE':
          if (order.courseId) {
            await tx.course.update({
              where: { id: order.courseId },
              data: { currentEnrolled: { increment: 1 } },
            })
          }
          break
        case 'WAITLIST':
          // 候补订单支付成功 → 候补条目转为正式等待状态
          await tx.waitlistEntry.updateMany({
            where: { orderId: order.id, status: 'PENDING_PAYMENT' },
            data: { status: 'WAITING', paidAt: new Date() },
          })
          break
        case 'MEMBER_CARD':
          await this.fulfillMemberCard(tx, order)
          break
      }
    })

    // 事务外释放席位锁 & 下发通知（不阻断主流程）
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    })
    if (order?.courseId) {
      await this.redis.unlockSeat(order.courseId, order.userId).catch(() => undefined)
    }
    if (order && order.orderType === 'COURSE' && order.course) {
      await this.notification.paymentSuccess(order.userId, {
        courseName: order.course.title,
        amount: `¥${Number(order.actualPaid).toFixed(2)}`,
        orderNo: order.id,
        orderId: order.id,
      })
    }
  }

  /**
   * 会员卡履约：生成或续期会员卡（叠加 durationDays）
   */
  private async fulfillMemberCard(tx: Prisma.TransactionClient, order: any) {
    if (!order.memberCardProductId) return
    const product = await tx.memberCardProduct.findUnique({
      where: { id: order.memberCardProductId },
    })
    if (!product) return

    // 查找该用户同类型有效会员卡以续期
    const existing = await tx.memberCard.findFirst({
      where: { userId: order.userId, type: product.type, status: 'ACTIVE' },
      orderBy: { endDate: 'desc' },
    })

    const now = new Date()
    let card
    if (existing && existing.endDate > now) {
      // 续期：从原到期日叠加
      const newEnd = new Date(existing.endDate)
      newEnd.setDate(newEnd.getDate() + product.durationDays)
      card = await tx.memberCard.update({
        where: { id: existing.id },
        data: { endDate: newEnd },
      })
    } else {
      const endDate = new Date(now)
      endDate.setDate(endDate.getDate() + product.durationDays)
      card = await tx.memberCard.create({
        data: {
          userId: order.userId,
          type: product.type,
          status: 'ACTIVE',
          startDate: now,
          endDate,
        },
      })
    }

    await tx.order.update({
      where: { id: order.id },
      data: { memberCardId: card.id },
    })
  }

  /**
   * 退款：按课程 refundRules 计算退款金额并发起微信退款
   */
  async refundOrder(orderId: string, operatorReason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status !== 'PAID' && order.status !== 'COMPLETED') {
      throw new BusinessException('订单状态不可退款', 4007)
    }

    const refundAmount = this.calculateRefund(order)
    const totalFen = Math.round(Number(order.actualPaid) * 100)
    const refundFen = Math.round(refundAmount * 100)

    if (refundFen <= 0) {
      // 无可退金额，仅置状态
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'REFUNDED',
          refundAmount: 0,
          refundTime: new Date(),
          cancelReason: operatorReason,
        },
      })
      return { refundAmount: 0 }
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'REFUNDING', refundAmount, cancelReason: operatorReason },
    })

    await this.wechatPay.refund({
      outTradeNo: order.id,
      outRefundNo: `RF${order.id}`,
      totalFen: Math.max(1, totalFen),
      refundFen: Math.max(1, refundFen),
      reason: operatorReason,
    })

    return { refundAmount }
  }

  /**
   * 全额退款（候补超时未轮上自动退款场景，不走 refundRules）
   */
  async refundFull(orderId: string, reason: string): Promise<{ refundAmount: number }> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status !== 'PAID' && order.status !== 'COMPLETED') {
      return { refundAmount: 0 }
    }
    const totalFen = Math.round(Number(order.actualPaid) * 100)
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'REFUNDING', refundAmount: order.actualPaid, cancelReason: reason },
    })
    if (totalFen > 0) {
      await this.wechatPay.refund({
        outTradeNo: order.id,
        outRefundNo: `RF${order.id}`,
        totalFen,
        refundFen: totalFen,
        reason,
      })
    } else {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'REFUNDED', refundTime: new Date() },
      })
    }
    return { refundAmount: Number(order.actualPaid) }
  }

  /**
   * 退款回调处理：置 REFUNDED，释放席位
   */
  async handleRefundNotify(rawBody: string): Promise<{ code: string; message: string }> {
    const result = this.wechatPay.decryptNotify(rawBody)
    if (result.refund_status !== 'SUCCESS') {
      return { code: 'SUCCESS', message: 'OK' }
    }
    const orderId = result.out_trade_no
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    })
    if (!order || order.status === 'REFUNDED') {
      return { code: 'SUCCESS', message: 'OK' }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'REFUNDED', refundTime: new Date() },
      })
      if (order.orderType === 'COURSE' && order.courseId) {
        await tx.course.update({
          where: { id: order.courseId },
          data: { currentEnrolled: { decrement: 1 } },
        })
      }
      if (order.orderType === 'WAITLIST') {
        await tx.waitlistEntry.updateMany({
          where: { orderId: order.id },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        })
      }
    })

    if (order.orderType === 'COURSE' && order.course) {
      await this.notification.refundSuccess(order.userId, {
        courseName: order.course.title,
        amount: `¥${Number(order.refundAmount ?? order.actualPaid).toFixed(2)}`,
        orderId: order.id,
      })
    }
    return { code: 'SUCCESS', message: 'OK' }
  }

  /**
   * 按课程 refundRules（JSON）计算退款金额；无规则时不退款
   */
  private calculateRefund(order: any): number {
    const paid = Number(order.actualPaid)
    if (!order.course?.startDate) return 0

    const rules = this.parseRefundRules(order.course.refundRules)
    if (!rules.length) return 0

    const now = new Date()
    const start = new Date(order.course.startDate)
    const hoursUntilStart = (start.getTime() - now.getTime()) / 3_600_000

    for (const rule of rules) {
      const from = rule.hoursFrom
      const to = rule.hoursTo ?? Infinity
      if (hoursUntilStart >= from && hoursUntilStart < to) {
        return Math.max(0, (paid * rule.refundPercent) / 100)
      }
    }
    return 0
  }

  private parseRefundRules(raw: any): RefundRule[] {
    if (!raw) return []
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  private buildDescription(order: any): string {
    switch (order.orderType) {
      case 'MEMBER_CARD':
        return 'Full愈 会员卡'
      case 'WAITLIST':
        return 'Full愈 课程候补'
      default:
        return 'Full愈 课程报名'
    }
  }
}
