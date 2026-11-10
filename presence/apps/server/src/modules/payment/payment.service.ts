import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { HuifuPayService } from './huifu-pay.service'
import { NotificationService } from '../../common/notification/notification.service'
import { WaitlistService } from '../waitlist/waitlist.service'
import { BrandPresenceSync } from '../member/brand-presence.sync'
import { BusinessException } from '../../common/exceptions/business.exception'
import {
  orderAmountToFen,
  orderAmountToYuan,
  SEAT_LOCK_DURATION_MINUTES,
  courseStartAt,
  POINTS_TO_FEN_RATIO,
  isFenDenominatedOrder,
} from '@fullyu/shared'
import { Prisma, OrderStatus } from '@prisma/client'
import { computeCommunityPaidUntil } from './community-membership.util'

/** 超时取消后仍收到支付成功回调时，退款原因标记（退款回调据此跳过名额扣减） */
const LATE_PAYMENT_REFUND_REASON = '订单已取消后收到支付，已自动原路退款'
/** 课程已取消后仍收到支付成功回调时，退款原因标记（订单从未占用名额） */
const COURSE_CANCELLED_REFUND_REASON = '课程已取消，已自动原路退款'

/** 这类退款没有占用过课程名额，回调时不得扣减 currentEnrolled、也不得触发候补递补 */
function skipsSeatRelease(reason: string | null | undefined): boolean {
  const value = reason || ''
  return (
    value.startsWith(LATE_PAYMENT_REFUND_REASON) || value.startsWith(COURSE_CANCELLED_REFUND_REASON)
  )
}

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
    private readonly huifuPay: HuifuPayService,
    private readonly notification: NotificationService,
    @Inject(forwardRef(() => WaitlistService))
    private readonly waitlist: WaitlistService,
    private readonly brandSync: BrandPresenceSync,
  ) {}

  /**
   * 为待支付订单创建汇付聚合支付（微信小程序），返回小程序调起参数
   */
  async createPayment(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BusinessException('订单状态不可支付', 4005)
    }
    // 超过席位锁定时间不再允许发起支付，避免定时任务取消后仍扣款
    const expireAt = order.createdAt.getTime() + SEAT_LOCK_DURATION_MINUTES * 60 * 1000
    if (Date.now() > expireAt) {
      throw new BusinessException('订单已超时，请重新预约', 4009)
    }

    const totalFen = orderAmountToFen(order.orderType, Number(order.actualPaid))
    // 0 元订单（积分/代金券全额抵扣）不能向网关下 1 分钱：直接履约，由前端跳过收银台
    if (totalFen <= 0) {
      const fulfilled = await this.fulfillPaidOrder(order.id, 'ZERO_AMOUNT')
      if (!fulfilled) throw new BusinessException('订单状态已变化，请刷新后重试', 4005)
      return { zeroAmount: true, orderId: order.id }
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user?.openId) throw new BusinessException('用户未绑定微信', 4006)

    const description = this.buildDescription(order)

    return this.huifuPay.createJsapiOrder({
      outTradeNo: order.id,
      description,
      totalFen,
      openid: user.openId,
    })
  }

  /**
   * 查询本人订单的支付结果。
   *
   * 小程序在拉起微信支付后会轮询该接口确认最终状态，再决定提示报名成功还是续付。
   * 以订单状态为准（支付回调落库后的真实结果），避免微信端回调丢失/延迟时
   * 客户端仅凭 requestPayment 回调误判「支付未完成」。
   */
  async queryStatus(orderId: string, userId: string) {
    const select = { id: true, status: true, orderType: true, refundAmount: true } as const
    let order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select,
    })
    if (!order) throw new BusinessException('订单不存在', 4004)

    // 微信支付回调可能略晚于客户端查询：待支付状态下短暂等待回调落库，
    // 避免「钱已付、页面却提示支付未完成」的误判。
    if (order.status === 'PENDING_PAYMENT') {
      for (let i = 0; i < 4 && order.status === 'PENDING_PAYMENT'; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const fresh = await this.prisma.order.findUnique({ where: { id: orderId }, select })
        if (!fresh) break
        order = fresh
      }
    }

    return {
      orderId: order.id,
      status: order.status,
      refundAmount: orderAmountToYuan(order.orderType, Number(order.refundAmount ?? 0)),
    }
  }

  /**
   * 处理支付成功回调：验签解析 → 幂等更新 → 触发履约
   * 返回汇付要求的文本回包 RECV_ORD_ID_ + 请求流水号
   */
  async handleNotify(rawBody: string): Promise<string> {
    const result = this.huifuPay.decryptNotify(rawBody)
    const ack = this.huifuPay.buildNotifyAck(result.req_seq_id)
    if (result.trade_state !== 'SUCCESS') {
      return ack
    }

    const orderId = result.out_trade_no
    // 幂等锁：避免并发/重复回调
    const lockKey = `pay_notify_lock:${orderId}`
    const locked = await this.redis.set(lockKey, '1', 10)
    // 无论是否抢到锁都以 DB 状态为准做幂等判断

    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) {
      this.logger.warn(`回调订单不存在: ${orderId}`)
      return ack
    }
    if (
      order.status === 'PAID' ||
      order.status === 'COMPLETED' ||
      order.status === 'REFUNDING' ||
      order.status === 'REFUNDED'
    ) {
      // 已处理，幂等返回成功
      return ack
    }

    // 订单已被取消（用户取消或超时）却收到支付成功：钱不能留，自动原路退回
    if (order.status === 'CANCELLED') {
      await this.refundLatePayment(orderId, result.transaction_id)
      return ack
    }

    // transaction_id 为汇付复合定位键 req_date|hf_seq_id，退款时回用
    const fulfilled = await this.fulfillPaidOrder(orderId, result.transaction_id)
    if (!fulfilled) {
      // 极窄并发：上方读到待支付，进入事务前被超时任务取消
      const fresh = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      })
      if (fresh?.status === 'CANCELLED') {
        await this.refundLatePayment(orderId, result.transaction_id)
      }
    }
    return ack
  }

  /**
   * 已取消订单收到支付成功：先记录支付流水，再全额原路退回，避免用户钱货两空。
   * 退款回调会依据 LATE_PAYMENT_REFUND_REASON 跳过名额扣减。
   */
  private async refundLatePayment(orderId: string, transactionId: string) {
    try {
      const updated = await this.prisma.order.updateMany({
        where: { id: orderId, status: 'CANCELLED' },
        data: {
          status: 'PAID',
          paymentId: transactionId,
          paymentTime: new Date(),
          cancelReason: LATE_PAYMENT_REFUND_REASON,
        },
      })
      if (!updated.count) return

      await this.refundFull(orderId, LATE_PAYMENT_REFUND_REASON, { source: 'SYSTEM' })
      this.logger.warn(`订单 ${orderId} 取消后收到支付，已发起自动退款`)
    } catch (e) {
      this.logger.error(
        `订单 ${orderId} 取消后支付自动退款失败，需人工处理: ${(e as Error).message}`,
      )
    }
  }

  /**
   * 履约：将订单置为 PAID 并按订单类型触发后续（占座 / 候补入队 / 发卡）
   * 全流程放入事务，保证一致性
   */
  async fulfillPaidOrder(orderId: string, transactionId: string): Promise<boolean> {
    let fulfilled = false
    // 支付落到已取消课程时：标记为「需自动退款」，事务后原路退回
    let refundAfterFulfill: string | null = null

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } })
      if (!order || order.status !== 'PENDING_PAYMENT') return

      // 条件更新：与超时取消并发时只有一个能成功，避免「已退款又占座」
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING_PAYMENT' },
        data: {
          status: 'PAID',
          paymentId: transactionId,
          paymentTime: new Date(),
        },
      })
      if (!updated.count) return
      fulfilled = true

      switch (order.orderType) {
        case 'COURSE':
          if (order.courseId) {
            const course = await tx.course.findUnique({
              where: { id: order.courseId },
              select: { status: true },
            })
            if (course?.status === 'PUBLISHED') {
              await tx.course.update({
                where: { id: order.courseId },
                data: { currentEnrolled: { increment: 1 } },
              })
            } else {
              // 课程在下单后已被取消/下架：不占名额，钱原路退回
              refundAfterFulfill = COURSE_CANCELLED_REFUND_REASON
            }
          }
          break
        case 'WAITLIST':
          if (order.courseId) {
            const course = await tx.course.findUnique({
              where: { id: order.courseId },
              select: { status: true },
            })
            if (course?.status !== 'PUBLISHED') {
              refundAfterFulfill = COURSE_CANCELLED_REFUND_REASON
              break
            }
          }
          // 候补订单支付成功 → 候补条目转为正式等待状态
          await tx.waitlistEntry.updateMany({
            where: { orderId: order.id, status: 'PENDING_PAYMENT' },
            data: { status: 'WAITING', paidAt: new Date() },
          })
          break
        case 'MEMBER_CARD':
          await this.fulfillMemberCard(tx, order)
          break
        case 'COMMUNITY':
          await this.fulfillCommunityMembership(tx, order)
          break
      }
    })

    if (!fulfilled) return false

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    })

    // 支付成功后立即把该用户的畅练卡附赠与订单上报同步到 CRM，不必等下一轮定时任务。
    if (order) {
      void this.brandSync.syncUser(order.userId).catch((error) => {
        this.logger.warn(
          `支付后品牌会员同步失败（${order.userId}）：${(error as Error).message}`,
        )
      })
    }

    // 事务提交后才被取消的窄窗口：撤回刚占用的名额，再退款
    if (order?.courseId && order.course && order.course.status !== 'PUBLISHED' && !refundAfterFulfill) {
      if (order.orderType === 'COURSE') {
        await this.prisma.course.updateMany({
          where: { id: order.courseId, currentEnrolled: { gt: 0 } },
          data: { currentEnrolled: { decrement: 1 } },
        })
      }
      refundAfterFulfill = COURSE_CANCELLED_REFUND_REASON
    }

    if (order?.courseId) {
      await this.redis.unlockSeat(order.courseId, order.userId).catch(() => undefined)
    }

    if (refundAfterFulfill) {
      // 未进入等待队列的候补单直接终结，避免后续被递补
      if (order?.orderType === 'WAITLIST') {
        await this.prisma.waitlistEntry.updateMany({
          where: { orderId, status: { in: ['PENDING_PAYMENT', 'WAITING'] } },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        })
      }
      try {
        await this.refundFull(orderId, refundAfterFulfill, { source: 'SYSTEM' })
      } catch (e) {
        this.logger.error(
          `订单 ${orderId} 支付后课程已取消，自动退款失败，需人工处理: ${(e as Error).message}`,
        )
      }
      return true
    }

    // 事务外下发通知（不阻断主流程）
    if (order && order.orderType === 'COURSE' && order.course) {
      await this.notification.paymentSuccess(order.userId, {
        courseName: order.course.title,
        amount: `¥${orderAmountToYuan(order.orderType, Number(order.actualPaid)).toFixed(2)}`,
        orderNo: order.id,
        orderId: order.id,
      })
    }
    return true
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
   * 社群会员履约：写入/续期一年有效期。
   * - 首次加入才增加展示人数，续费不重复累加
   * - 过期后再次购买从当前时间起算，不追溯已过期时段
   */
  private async fulfillCommunityMembership(tx: Prisma.TransactionClient, order: any) {
    if (!order.communityId) return
    const existing = await tx.communityJoin.findUnique({
      where: { communityId_userId: { communityId: order.communityId, userId: order.userId } },
    })
    const paidUntil = await this.replayCommunityPaidUntil(tx, order.userId, order.communityId)
    if (!paidUntil) return

    // 邀请/礼遇核销：同一张邀请的同一领取记录只会被使用一次
    if (order.communityInviteClaimId) {
      const consumed = await tx.communityInviteClaim.updateMany({
        where: { id: order.communityInviteClaimId, usedAt: null },
        data: { usedAt: new Date(), orderId: order.id },
      })
      if (consumed.count > 0 && order.communityInviteId) {
        await tx.communityInvite.update({
          where: { id: order.communityInviteId },
          data: { usedCount: { increment: 1 } },
        })
      }
    }

    const source = order.communityInviteClaimId
      ? Number(order.discountAmount) >= Number(order.originalPrice)
        ? 'WAIVER'
        : 'COUPON'
      : Number(order.originalPrice) > 0
        ? 'PAID'
        : 'FREE'

    if (existing) {
      await tx.communityJoin.update({
        where: { id: existing.id },
        data: { paidUntil, source, orderId: order.id },
      })
    } else {
      await tx.communityJoin.create({
        data: {
          communityId: order.communityId,
          userId: order.userId,
          paidUntil,
          source,
          orderId: order.id,
        },
      })
      await tx.community.update({
        where: { id: order.communityId },
        data: { memberCount: { increment: 1 } },
      })
    }
  }

  /**
   * Rebuild the membership expiry from all still-paid orders.
   * Used after both payment and refund so a single refund only removes
   * that order's year instead of revoking a valid renewal.
   */
  private async replayCommunityPaidUntil(
    tx: Pick<Prisma.TransactionClient, 'order'>,
    userId: string,
    communityId: string,
  ): Promise<Date | null> {
    const paidOrders = await tx.order.findMany({
      where: {
        userId,
        communityId,
        orderType: 'COMMUNITY',
        status: { in: ['PAID', 'COMPLETED'] },
      },
      select: { paymentTime: true, createdAt: true },
    })
    return computeCommunityPaidUntil(
      paidOrders.map((paidOrder) => paidOrder.paymentTime ?? paidOrder.createdAt),
    )
  }

  /**
   * 退款：按课程 refundRules 计算退款金额并发起微信退款。
   * 已完成订单关闭用户自助退款，客诉场景走后台 forceRefund。
   */
  /**
   * 用户自助取消前的退款预览：不动单、不发起退款，只按与 refundOrder 相同的口径
   * 计算本次可退金额，供前端在确认弹窗里向用户明示。
   */
  async previewRefund(orderId: string): Promise<{
    fullRefund: boolean
    refundFen: number
    totalFen: number
    percent: number
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status !== 'PAID') {
      throw new BusinessException('订单状态不可退款', 4007)
    }
    // 与 refundOrder 一致：课程开课后不再支持用户自助退款
    if (order.orderType === 'COURSE' && order.course) {
      if (Date.now() >= courseStartAt(order.course).getTime()) {
        throw new BusinessException('课程已开始，不支持自助退款', 4007)
      }
    }
    const totalFen = orderAmountToFen(order.orderType, Number(order.actualPaid))
    // 候补/社群年费/会员卡：按全额退回；课程：按 refundRules 阶梯
    const refundAmount =
      order.orderType === 'COURSE' ? this.calculateRefund(order) : Number(order.actualPaid)
    const refundFen = orderAmountToFen(order.orderType, refundAmount)
    return {
      fullRefund: refundFen >= totalFen,
      refundFen,
      totalFen,
      percent: totalFen > 0 ? Math.floor((refundFen / totalFen) * 100) : 0,
    }
  }

  async refundOrder(orderId: string, operatorReason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true, refunds: true },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status === 'COMPLETED') {
      throw new BusinessException('课程已完成，不支持自助退款', 4007)
    }
    if (order.status !== 'PAID') {
      throw new BusinessException('订单状态不可退款', 4007)
    }

    // 社群年费 / 会员卡：没有按课时消耗的阶梯规则，取消按全额原路退回；
    // 退款回调据此撤销社群有效期 / 会员卡权益。
    if (order.orderType === 'COMMUNITY') {
      return this.refundFull(orderId, operatorReason || '社群年费退款')
    }
    if (order.orderType === 'MEMBER_CARD') {
      return this.refundFull(orderId, operatorReason || '会员卡退款')
    }

    // 课程已开始后不再支持用户自助退款：此时 refundRules 通常落到 0%，
    // 若直接置「已退款」会既不退钱也不释放名额，且易引发客诉。
    // 实际未上课等情况走后台强制退款（二次审批）通道。
    if (order.orderType === 'COURSE' && order.course) {
      if (Date.now() >= courseStartAt(order.course).getTime()) {
        throw new BusinessException('课程已开始，不支持自助退款', 4007)
      }
    }

    const refundAmount = this.calculateRefund(order)
    const totalFen = orderAmountToFen(order.orderType, Number(order.actualPaid))
    const refundFen = orderAmountToFen(order.orderType, refundAmount)

    if (refundFen <= 0) {
      // 无可退金额，仅置状态；但取消仍必须释放名额并触发候补递补
      // 条件更新：并发重复取消时只有一个请求能完成权益回补与名额释放
      const closed = await this.prisma.order.updateMany({
        where: { id: orderId, status: 'PAID' },
        data: {
          status: 'REFUNDED',
          refundAmount: 0,
          refundTime: new Date(),
          cancelReason: operatorReason,
        },
      })
      if (!closed.count) {
        throw new BusinessException('订单状态已变化，请刷新后重试', 4007)
      }
      // 0 元订单（积分/券全额抵扣）视为整单退款，权益需返还
      if (totalFen <= 0) {
        await this.restoreBenefits(order)
      }
      if (order.orderType === 'COURSE' && order.courseId) {
        await this.releaseSeatAndPromote(order.courseId)
      }
      return { refundAmount: 0 }
    }

    // 条件更新：并发重复退款只有一个请求能进入网关退款
    const refunding = await this.prisma.order.updateMany({
      where: { id: orderId, status: 'PAID' },
      data: { status: 'REFUNDING', refundAmount, cancelReason: operatorReason },
    })
    if (!refunding.count) {
      throw new BusinessException('订单状态已变化，请刷新后重试', 4007)
    }

    // 自助退款同样落退款流水：回调丢失时可在后台主动查询、重试或确认失败
    const outRefundNo = this.nextOutRefundNo(orderId, order.refunds)
    const attempt = await this.prisma.orderRefund.create({
      data: {
        orderId,
        outRefundNo,
        amountFen: refundFen,
        status: 'PROCESSING',
        source: 'SELF_SERVICE',
        prevOrderStatus: order.status,
        reason: operatorReason ?? '用户取消退款',
      },
    })

    await this.refundViaGateway(order, {
      outTradeNo: order.id,
      outRefundNo,
      totalFen: Math.max(1, totalFen),
      refundFen: Math.max(1, refundFen),
      reason: operatorReason,
      paymentId: order.paymentId,
      attemptId: attempt.id,
    })

    // 现金全额退回时，积分与代金券一并返还；部分退款不返还（按实际支付比例结算）
    if (refundFen >= totalFen) {
      await this.restoreBenefits(order)
    }

    return { refundAmount }
  }

  /**
   * 全额退款（候补超时未轮上自动退款场景，不走 refundRules）
   * @param source 流水来源：用户主动取消为 SELF_SERVICE，定时任务/补偿为 SYSTEM
   */
  async refundFull(
    orderId: string,
    reason: string,
    options: { source?: 'SELF_SERVICE' | 'SYSTEM' } = {},
  ): Promise<{ refundAmount: number }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { refunds: true },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status !== 'PAID' && order.status !== 'COMPLETED') {
      return { refundAmount: 0 }
    }
    const totalFen = orderAmountToFen(order.orderType, Number(order.actualPaid))
    // 条件更新：候补超时退款与用户取消可能同时发生，只允许一次网关退款
    const refunding = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PAID', 'COMPLETED'] } },
      data: { status: 'REFUNDING', refundAmount: order.actualPaid, cancelReason: reason },
    })
    if (!refunding.count) {
      return { refundAmount: 0 }
    }
    if (totalFen > 0) {
      // 全额退款同样落流水，回调丢失时可由后台/定时任务主动查询结算
      const outRefundNo = this.nextOutRefundNo(orderId, order.refunds)
      const attempt = await this.prisma.orderRefund.create({
        data: {
          orderId,
          outRefundNo,
          amountFen: totalFen,
          status: 'PROCESSING',
          source: options.source ?? 'SELF_SERVICE',
          prevOrderStatus: order.status,
          reason,
        },
      })
      await this.refundViaGateway(order, {
        outTradeNo: order.id,
        outRefundNo,
        totalFen,
        refundFen: totalFen,
        reason,
        paymentId: order.paymentId,
        attemptId: attempt.id,
      })
    } else {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'REFUNDED', refundTime: new Date() },
      })
    }
    // 全额退款：积分与代金券一并返还，避免用户权益随订单一起消失
    await this.restoreBenefits(order)
    return { refundAmount: Number(order.actualPaid) }
  }

  /**
   * 整单退款后返还积分与代金券：
   * - 积分按预扣的负向流水等额回补
   * - 代金券未过期则恢复 UNUSED，已过期则置 EXPIRED
   * 仅在订单状态只允许进入退款一次的前提下调用，保证不重复返还。
   */
  private async restoreBenefits(order: {
    id: string
    userId: string
    pointsDeduction: Prisma.Decimal | number
    voucherId: string | null
  }) {
    const points = Math.round(Number(order.pointsDeduction) / POINTS_TO_FEN_RATIO)
    if (points > 0) {
      const last = await this.prisma.pointsRecord.findFirst({
        where: { userId: order.userId },
        orderBy: { createdAt: 'desc' },
      })
      const balance = last?.balance ?? 0
      await this.prisma.pointsRecord.create({
        data: {
          userId: order.userId,
          amount: points,
          balance: balance + points,
          type: 'OTHER',
          reason: '订单退款，积分返还',
          relatedId: order.id,
        },
      })
    }

    if (order.voucherId) {
      const voucher = await this.prisma.voucher.findUnique({
        where: { id: order.voucherId },
      })
      if (voucher) {
        await this.prisma.voucher.update({
          where: { id: voucher.id },
          data: {
            status: voucher.expiresAt.getTime() > Date.now() ? 'UNUSED' : 'EXPIRED',
            usedAt: null,
          },
        })
      }
    }
  }

  /**
   * 强制退款（客诉特殊处理，经二次审批后执行）：按指定金额原路退回，
   * 不受课程 refundRules 限制。refundAmount 单位为元，不传则退剩余全部。
   *
   * 状态机（order_refunds 流水驱动，同一订单并发/重复提交全部拦截）：
   * - 存在受理中/待确认（PROCESSING/UNKNOWN）流水 → 拒绝再次发起；
   * - 累计已退以 SUCCESS 流水为准，本次 + 累计不得超过实付，超额直接拒绝（不再静默截断）；
   * - 部分退款到账 → 订单回退退款前状态（PAID/COMPLETED），不释放名额、不回收权益；
   * - 累计退满实付 → 整单结清：REFUNDED + 释放名额 + 回收权益；
   * - 网关明确拒绝（5105/5106）→ 流水置 FAILED，订单回退，可重新发起；
   * - 网络异常等无法确认 → 流水置 UNKNOWN，订单保持 REFUNDING，后台人工重试或确认失败。
   */
  async forceRefund(
    orderId: string,
    refundAmount?: number,
    reason?: string,
    operator?: { id?: string; name?: string },
    approvalId?: string,
  ): Promise<{ refundAmount: number }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { refunds: true },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status !== 'PAID' && order.status !== 'COMPLETED') {
      if (order.status === 'REFUNDING') {
        throw new BusinessException('该订单已有退款处理中，请等待结果或先处理原退款流水', 4025)
      }
      throw new BusinessException('订单状态不可退款', 4007)
    }
    const active = order.refunds.find((r) => r.status === 'PROCESSING' || r.status === 'UNKNOWN')
    if (active) {
      throw new BusinessException(
        `该订单已有退款处理中（${active.outRefundNo}），请等待结果或先处理该流水`,
        4025,
      )
    }

    const totalFen = orderAmountToFen(order.orderType, Number(order.actualPaid))

    // 0 元订单（全积分/全券抵扣、免年费）：无可退现金，但权益仍需完整撤销
    if (totalFen <= 0) {
      const closed = await this.prisma.order.updateMany({
        where: { id: orderId, status: { in: ['PAID', 'COMPLETED'] } },
        data: {
          status: 'REFUNDED',
          refundAmount: 0,
          refundTime: new Date(),
          cancelReason: reason ?? '强制退款',
        },
      })
      if (!closed.count) {
        throw new BusinessException('订单状态已变化，请刷新后重试', 4007)
      }
      await this.restoreBenefits(order)
      if (order.orderType === 'COURSE' && order.courseId) {
        await this.releaseSeatAndPromote(order.courseId)
      }
      if (order.orderType === 'MEMBER_CARD') {
        await this.revokeMemberCard(this.prisma, order)
      }
      if (order.orderType === 'COMMUNITY' && order.communityId) {
        await this.recomputeCommunityMembership(order.userId, order.communityId)
      }
      return { refundAmount: 0 }
    }

    const refundedFen = this.sumSuccessRefundFen(order.refunds)
    const remainingFen = totalFen - refundedFen
    if (remainingFen <= 0) {
      throw new BusinessException('该订单实付金额已全部退完', 4026)
    }

    // 未指定金额 = 退剩余全部；指定金额按分取整，超过剩余直接拒绝
    let amount = refundAmount && refundAmount > 0 ? refundAmount : remainingFen / 100
    amount = Math.round(amount * 100) / 100
    const refundFen = Math.round(amount * 100)
    if (refundFen <= 0) {
      throw new BusinessException('退款金额必须大于 0', 4007)
    }
    if (refundFen > remainingFen) {
      throw new BusinessException(
        `超过可退余额，最多可退 ¥${(remainingFen / 100).toFixed(2)}`,
        4026,
      )
    }

    const outRefundNo = this.nextOutRefundNo(orderId, order.refunds)
    const attempt = await this.prisma.orderRefund.create({
      data: {
        orderId,
        outRefundNo,
        amountFen: refundFen,
        status: 'PROCESSING',
        source: 'ADMIN_FORCE',
        prevOrderStatus: order.status,
        reason: reason ?? '强制退款',
        operatorId: operator?.id,
        operatorName: operator?.name,
        approvalId,
      },
    })

    // refundAmount 列与订单金额列同口径（课程/候补/社群为分，会员卡为元），存累计已退
    const cumulativeFen = refundedFen + refundFen
    const refundColumnValue = isFenDenominatedOrder(order.orderType) ? cumulativeFen : cumulativeFen / 100
    const refunding = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PAID', 'COMPLETED'] } },
      data: {
        status: 'REFUNDING',
        refundAmount: refundColumnValue,
        cancelReason: reason ?? '强制退款',
      },
    })
    if (!refunding.count) {
      await this.prisma.orderRefund.delete({ where: { id: attempt.id } })
      throw new BusinessException('订单状态已变化，请刷新后重试', 4007)
    }

    try {
      await this.huifuPay.refund({
        outTradeNo: order.id,
        outRefundNo,
        totalFen,
        refundFen,
        reason: reason ?? '强制退款',
        paymentId: order.paymentId,
      })
    } catch (e) {
      if (e instanceof BusinessException && (e.bizCode === 5105 || e.bizCode === 5106)) {
        // 网关明确拒绝：流水 FAILED，订单回退退款前状态，允许重新发起
        await this.prisma.orderRefund.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            failCode: String(e.bizCode),
            failMessage: e.message,
            settledAt: new Date(),
          },
        })
        await this.prisma.order.updateMany({
          where: { id: orderId, status: 'REFUNDING' },
          data: {
            status: order.status,
            refundAmount: order.refundAmount,
            cancelReason: order.cancelReason,
          },
        })
        throw e
      }
      // 网络异常等：结果待确认，人工在流水上重试或确认失败
      await this.prisma.orderRefund.update({
        where: { id: attempt.id },
        data: { status: 'UNKNOWN', failMessage: (e as Error)?.message ?? String(e) },
      })
      throw new BusinessException(
        '退款申请结果待确认，请在退款流水中核对后重试或确认失败',
        5107,
      )
    }

    // 累计退满实付时，预扣的积分与代金券一并返还；部分退款不返还
    if (cumulativeFen >= totalFen) {
      await this.restoreBenefits(order)
    }

    return { refundAmount: amount }
  }

  /**
   * 退款台账：累计已退、剩余可退、处理中流水与各次申请明细，供后台展示与操作。
   */
  async refundSummary(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { refunds: { orderBy: { createdAt: 'desc' } } },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    const totalFen = orderAmountToFen(order.orderType, Number(order.actualPaid))
    const refundedFen = this.sumSuccessRefundFen(order.refunds)
    const active = order.refunds.find((r) => r.status === 'PROCESSING' || r.status === 'UNKNOWN')
    return {
      orderId,
      orderStatus: order.status,
      orderType: order.orderType,
      actualPaidFen: totalFen,
      refundedFen,
      remainingFen: Math.max(0, totalFen - refundedFen),
      activeRefundId: active?.id ?? null,
      // 有进行中流水，或旧版退款停在 REFUNDING 无流水：都可主动查询网关结果
      canQueryGateway: !!active || order.status === 'REFUNDING',
      canForceRefund:
        ['PAID', 'COMPLETED'].includes(order.status) && !active && (totalFen <= 0 || totalFen - refundedFen > 0),
      refunds: order.refunds.map((r) => ({
        id: r.id,
        outRefundNo: r.outRefundNo,
        amountYuan: (r.amountFen / 100).toFixed(2),
        status: r.status,
        source: r.source,
        reason: r.reason,
        operatorName: r.operatorName,
        attempts: r.attempts,
        gatewayRef: r.gatewayRef,
        failCode: r.failCode,
        failMessage: r.failMessage,
        createdAt: r.createdAt,
        settledAt: r.settledAt,
      })),
    }
  }

  /**
   * 重试「结果待确认」的退款：同一流水号再次送网关（汇付按 req_seq_id 幂等），
   * 不会产生第二笔扣款。网关明确拒绝时置 FAILED 并回退订单，可重新发起。
   */
  async retryRefund(orderId: string, refundId: string, operator?: { id?: string; name?: string }) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new BusinessException('订单不存在', 4004)
    const refund = await this.prisma.orderRefund.findUnique({ where: { id: refundId } })
    if (!refund || refund.orderId !== orderId) {
      throw new BusinessException('退款流水不存在', 4004)
    }
    if (refund.status !== 'UNKNOWN' && refund.status !== 'PROCESSING') {
      throw new BusinessException('仅「待确认/受理中」的退款流水可重试', 4027)
    }
    const totalFen = orderAmountToFen(order.orderType, Number(order.actualPaid))

    await this.prisma.orderRefund.update({
      where: { id: refundId },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        failCode: null,
        failMessage: null,
        settledAt: null,
        operatorName: operator?.name ?? refund.operatorName,
      },
    })
    try {
      await this.huifuPay.refund({
        outTradeNo: order.id,
        outRefundNo: refund.outRefundNo,
        totalFen: Math.max(1, totalFen),
        refundFen: refund.amountFen,
        reason: refund.reason ?? undefined,
        paymentId: order.paymentId,
      })
    } catch (e) {
      if (e instanceof BusinessException && (e.bizCode === 5105 || e.bizCode === 5106)) {
        await this.prisma.orderRefund.update({
          where: { id: refundId },
          data: {
            status: 'FAILED',
            failCode: String(e.bizCode),
            failMessage: e.message,
            settledAt: new Date(),
          },
        })
        await this.restoreOrderAfterInactiveRefund(orderId)
        throw e
      }
      await this.prisma.orderRefund.update({
        where: { id: refundId },
        data: { status: 'UNKNOWN', failMessage: (e as Error)?.message ?? String(e) },
      })
      throw new BusinessException('重试结果仍待确认，请稍后在退款流水中核对', 5107)
    }
    return { retried: true, outRefundNo: refund.outRefundNo }
  }

  /**
   * 主动向网关查询退款结果：用于回调丢失、长时间停在「受理中/待确认」的流水，
   * 以及本次改造前未落流水的旧版退款（不传 refundId 时按订单补查）。
   * 查到成功/失败后走与回调相同的结算入口，保证两条链路结果一致。
   */
  async queryRefundStatus(orderId: string, refundId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { refunds: { orderBy: { createdAt: 'desc' } } },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)

    const attempt = refundId
      ? (order.refunds.find((r) => r.id === refundId) ?? null)
      : (order.refunds.find((r) => r.status === 'PROCESSING' || r.status === 'UNKNOWN') ?? null)
    if (refundId && !attempt) throw new BusinessException('退款流水不存在', 4004)
    if (attempt && !['PROCESSING', 'UNKNOWN'].includes(attempt.status)) {
      throw new BusinessException('该退款流水已结束，无需查询', 4027)
    }
    // 旧版退款没有流水：订单停在退款中即代表退款申请曾发出
    if (!attempt && order.status !== 'REFUNDING') {
      throw new BusinessException('该订单没有进行中的退款', 4027)
    }

    const outRefundNo = attempt?.outRefundNo ?? `RF${order.id}`
    const amountFen =
      attempt?.amountFen ??
      orderAmountToFen(order.orderType, Number(order.refundAmount ?? order.actualPaid))

    // 汇付按「退款申请日期 + 退款流水号」定位；跨零点与旧数据用邻近日期兜底
    const dates = this.refundQueryDates(attempt?.createdAt ?? order.updatedAt, order.createdAt)
    let result: Awaited<ReturnType<HuifuPayService['queryRefund']>> | null = null
    for (const orgReqDate of dates) {
      const queried = await this.huifuPay.queryRefund({ outRefundNo, orgReqDate })
      result = queried
      if (queried.status !== 'NOT_FOUND') break
    }
    const gateway = result ?? {
      status: 'NOT_FOUND' as const,
      respCode: '',
      respDesc: '',
      gatewayRef: undefined,
      amountFen: undefined,
    }

    if (gateway.status === 'SUCCESS' || gateway.status === 'FAIL') {
      await this.ensureLegacyRefundAttempt(order, attempt, outRefundNo, amountFen)
      await this.settleRefundFromGateway(orderId, {
        outRefundNo,
        gatewayRef: gateway.gatewayRef,
        refundStatus: gateway.status === 'SUCCESS' ? 'SUCCESS' : 'FAIL',
      })
    } else if (gateway.status === 'PROCESSING') {
      await this.ensureLegacyRefundAttempt(order, attempt, outRefundNo, amountFen)
      // 网关确认已受理：待确认 → 受理中，并刷新 updatedAt 作为自动对账节流
      await this.prisma.orderRefund.updateMany({
        where: { orderId, outRefundNo, status: { in: ['PROCESSING', 'UNKNOWN'] } },
        data: { status: 'PROCESSING', failMessage: null },
      })
    } else {
      // 查不到不等于没退：可能尚未受理，也可能查询日期不匹配，保持订单与流水状态交人工判断
      await this.ensureLegacyRefundAttempt(order, attempt, outRefundNo, amountFen, 'UNKNOWN')
      await this.prisma.orderRefund.updateMany({
        where: { orderId, outRefundNo, status: { in: ['PROCESSING', 'UNKNOWN'] } },
        data: { failMessage: '网关未查询到该笔退款（可能尚未受理或查询日期不匹配）' },
      })
    }

    const latest = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    })
    const messages: Record<string, string> = {
      SUCCESS: '网关确认退款已到账，订单已结算',
      PROCESSING: '网关仍在处理中，请稍后再查询',
      FAIL: '网关确认退款失败，订单已回退，可重新发起退款',
      NOT_FOUND: '网关未查询到该笔退款，请核对后再重试或确认未退款',
    }
    return {
      outRefundNo,
      status: gateway.status,
      gatewayRef: gateway.gatewayRef ?? null,
      amountFen,
      message: messages[gateway.status] ?? gateway.respDesc,
      orderStatus: latest?.status ?? order.status,
    }
  }

  /**
   * 旧版退款（改造前未落流水）首次主动查询时补建流水，
   * 后续查询、重试与确认失败都围绕这条流水进行。
   */
  private async ensureLegacyRefundAttempt(
    order: { id: string; cancelReason: string | null },
    attempt: { id: string } | null,
    outRefundNo: string,
    amountFen: number,
    initialStatus: 'PROCESSING' | 'UNKNOWN' = 'PROCESSING',
  ): Promise<void> {
    if (attempt) return
    const existing = await this.prisma.orderRefund.findUnique({ where: { outRefundNo } })
    if (existing) return
    try {
      await this.prisma.orderRefund.create({
        data: {
          orderId: order.id,
          outRefundNo,
          amountFen,
          status: initialStatus,
          source: 'SYSTEM',
          // 旧版退款没有记录退款前状态；自助部分退款只可能从已支付发起
          prevOrderStatus: 'PAID',
          reason: order.cancelReason ?? '补录：主动查询退款结果',
          ...(initialStatus === 'UNKNOWN'
            ? { failMessage: '网关未查询到该笔退款（可能尚未受理或查询日期不匹配）' }
            : {}),
        },
      })
    } catch {
      // 并发查询时的唯一键冲突：另一请求已补建，继续按该流水结算即可
    }
  }

  /** 退款查询候选日期：申请日及前后一天（跨零点）＋ 订单创建日，去重后最多 4 个 */
  private refundQueryDates(primary: Date, createdAt: Date): string[] {
    const keys: string[] = []
    const push = (key: string) => {
      if (key && !keys.includes(key)) keys.push(key)
    }
    const shift = (key: string, days: number) => {
      const midnight = new Date(
        `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T00:00:00+08:00`,
      )
      return this.beijingDate(new Date(midnight.getTime() + days * 86_400_000))
    }
    const base = this.beijingDate(primary)
    push(base)
    push(shift(base, -1))
    push(shift(base, 1))
    push(this.beijingDate(createdAt))
    return keys.slice(0, 4)
  }

  /** 北京时间 yyyyMMdd，与汇付 req_date 口径一致 */
  private beijingDate(value: Date): string {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(value)
      .replace(/\D/g, '')
  }

  /**
   * 人工确认「网关实际未退款」（对账后）：流水作废，订单回退退款前状态，
   * refundAmount 列回退为 SUCCESS 流水累计值，之后可重新发起退款。
   * 不传 refundId 时用于本次改造前没有流水的旧版退款（按订单整单确认）。
   */
  async confirmRefundFailed(orderId: string, refundId?: string) {
    if (!refundId) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { refunds: true },
      })
      if (!order) throw new BusinessException('订单不存在', 4004)
      if (order.status !== 'REFUNDING') {
        throw new BusinessException('该订单没有进行中的退款', 4027)
      }
      const active = order.refunds.find(
        (r) => r.status === 'PROCESSING' || r.status === 'UNKNOWN',
      )
      if (active) {
        throw new BusinessException(
          `该订单存在进行中的退款流水（${active.outRefundNo}），请在该流水上确认`,
          4027,
        )
      }
      const outRefundNo = this.nextOutRefundNo(orderId, order.refunds)
      const amountFen = orderAmountToFen(
        order.orderType,
        Number(order.refundAmount ?? order.actualPaid),
      )
      await this.prisma.orderRefund.create({
        data: {
          orderId,
          outRefundNo,
          amountFen,
          status: 'CANCELLED',
          source: 'SYSTEM',
          prevOrderStatus: 'PAID',
          reason: order.cancelReason ?? '人工确认未退款',
          failCode: 'MANUAL_CONFIRM',
          failMessage: '人工核对网关未发生该笔退款，作废后可重新发起',
          settledAt: new Date(),
        },
      })
      await this.restoreOrderAfterInactiveRefund(orderId)
      return { confirmed: true, outRefundNo }
    }

    const refund = await this.prisma.orderRefund.findUnique({ where: { id: refundId } })
    if (!refund || refund.orderId !== orderId) {
      throw new BusinessException('退款流水不存在', 4004)
    }
    if (refund.status !== 'UNKNOWN' && refund.status !== 'PROCESSING') {
      throw new BusinessException('仅「待确认/受理中」的退款流水可确认失败', 4027)
    }
    const updated = await this.prisma.orderRefund.updateMany({
      where: { id: refundId, status: { in: ['UNKNOWN', 'PROCESSING'] } },
      data: {
        status: 'CANCELLED',
        failCode: 'MANUAL_CONFIRM',
        failMessage: '人工核对网关未发生该笔退款，作废后可重新发起',
        settledAt: new Date(),
      },
    })
    if (!updated.count) {
      throw new BusinessException('退款流水状态已变化，请刷新后重试', 4027)
    }
    await this.restoreOrderAfterInactiveRefund(orderId)
    return { confirmed: true }
  }

  /** 订单无进行中的退款流水时，把 REFUNDING 回退到退款前状态并同步累计退款列 */
  private async restoreOrderAfterInactiveRefund(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { refunds: true },
    })
    if (!order || order.status !== 'REFUNDING') return
    const active = order.refunds.find((r) => r.status === 'PROCESSING' || r.status === 'UNKNOWN')
    if (active) return
    const refundedFen = this.sumSuccessRefundFen(order.refunds)
    const refundColumnValue = isFenDenominatedOrder(order.orderType) ? refundedFen : refundedFen / 100
    const restoreStatus =
      order.refunds.find((r) => r.status === 'FAILED' || r.status === 'CANCELLED')?.prevOrderStatus || 'PAID'
    await this.prisma.order.updateMany({
      where: { id: orderId, status: 'REFUNDING' },
      data: { status: restoreStatus as OrderStatus, refundAmount: refundedFen > 0 ? refundColumnValue : null },
    })
  }

  /** SUCCESS 流水累计金额（分） */
  private sumSuccessRefundFen(refunds: { status: string; amountFen: number }[]) {
    return refunds
      .filter((r) => r.status === 'SUCCESS')
      .reduce((sum, r) => sum + r.amountFen, 0)
  }

  /** 本次退款流水号：首笔 RF+订单id，后续 RF+订单id_2、_3…（FAILED 重发即新流水） */
  private nextOutRefundNo(orderId: string, existing: { outRefundNo: string }[]) {
    const base = `RF${orderId}`
    if (!existing.some((r) => r.outRefundNo === base)) return base
    for (let i = 2; ; i++) {
      const candidate = `${base}_${i}`
      if (!existing.some((r) => r.outRefundNo === candidate)) return candidate
    }
  }

  /**
   * 发起网关退款，并在失败时保证订单状态与真实退款结果一致：
   * - 汇付「明确拒绝」（缺少流水 5105 / 受理失败 5106）：订单回退到退款前状态，允许重试；
   * - 网络等无法确认是否受理的异常：保守保留 REFUNDING，避免同一订单被重复退款，
   *   由后台按退款流水核对后再处理。
   */
  private async refundViaGateway(
    order: {
      id: string
      status: OrderStatus
      refundAmount: Prisma.Decimal | number | null
      cancelReason: string | null
    },
    payload: {
      outTradeNo: string
      outRefundNo: string
      totalFen: number
      refundFen: number
      reason?: string
      paymentId?: string | null
      attemptId?: string
    },
  ): Promise<void> {
    try {
      await this.huifuPay.refund(payload)
    } catch (e) {
      this.logger.error(
        `退款网关调用失败 order=${order.id}: ${(e as Error)?.message ?? String(e)}`,
      )
      if (e instanceof BusinessException && (e.bizCode === 5105 || e.bizCode === 5106)) {
        // 网关明确拒绝：流水判失败，订单回退退款前状态
        if (payload.attemptId) {
          await this.prisma.orderRefund.updateMany({
            where: { id: payload.attemptId, status: { in: ['PROCESSING', 'UNKNOWN'] } },
            data: {
              status: 'FAILED',
              failCode: String(e.bizCode),
              failMessage: e.message,
              settledAt: new Date(),
            },
          })
        }
        // 条件更新：若退款回调已抢先落定 REFUNDED，不覆盖终态
        await this.prisma.order.updateMany({
          where: { id: order.id, status: 'REFUNDING' },
          data: {
            status: order.status,
            refundAmount: order.refundAmount,
            cancelReason: order.cancelReason,
          },
        })
        throw e
      }
      // 网络异常等无法确认受理结果：流水置待确认，订单保持防重复退款状态
      if (payload.attemptId) {
        await this.prisma.orderRefund.updateMany({
          where: { id: payload.attemptId, status: { in: ['PROCESSING', 'UNKNOWN'] } },
          data: { status: 'UNKNOWN', failMessage: (e as Error)?.message ?? String(e) },
        })
      }
      throw new BusinessException(
        '退款申请结果待确认，请稍后在退款流水中查询核对',
        5107,
      )
    }
  }

  /**
   * 退款回调处理：置 REFUNDED，释放席位
   */
  async handleRefundNotify(rawBody: string): Promise<string> {
    const result = this.huifuPay.decryptNotify(rawBody)
    const ack = this.huifuPay.buildNotifyAck(result.req_seq_id)
    await this.settleRefundFromGateway(result.out_trade_no, {
      outRefundNo: result.req_seq_id || undefined,
      gatewayRef: result.transaction_id,
      refundStatus: result.refund_status as 'SUCCESS' | 'PROCESSING' | 'FAIL',
    })
    return ack
  }

  /**
   * 退款到账/失败的统一结算入口（回调与主动查询共用，保证两条链路幂等且行为一致）。
   * 传入 outRefundNo 时按退款流水结算；不传时按旧版整单退款处理。
   */
  private async settleRefundFromGateway(
    orderId: string,
    params: {
      outRefundNo?: string
      gatewayRef?: string
      refundStatus: 'SUCCESS' | 'PROCESSING' | 'FAIL'
    },
  ): Promise<{ settled: boolean; reason?: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true, refunds: true },
    })
    if (!order) return { settled: false, reason: 'order-not-found' }

    // 新版退款流水：out_refund_no 与回调 req_seq_id 一一对应
    const attempt = params.outRefundNo
      ? (order.refunds.find((r) => r.outRefundNo === params.outRefundNo) ?? null)
      : null

    if (attempt && ['FAILED', 'CANCELLED'].includes(attempt.status)) {
      // 已判失败的流水不允许被迟到回调重新结算
      return { settled: false, reason: 'terminal' }
    }
    // SUCCESS 流水且订单已离开 REFUNDING：重复回调，不重复结算；
    // 若订单仍停在 REFUNDING（上次结算中途失败），继续走下面的补结算。
    if (attempt?.status === 'SUCCESS' && order.status !== 'REFUNDING') {
      return { settled: false, reason: 'already-settled' }
    }

    if (attempt) {
      if (params.refundStatus !== 'SUCCESS') {
        // 网关返回失败终态：流水置 FAILED，订单回退，允许重新发起
        await this.prisma.orderRefund.updateMany({
          where: { id: attempt.id, status: { in: ['PROCESSING', 'UNKNOWN'] } },
          data: {
            status: 'FAILED',
            failCode: 'GATEWAY_FAIL',
            failMessage: '退款回调返回失败终态',
            settledAt: new Date(),
          },
        })
        await this.restoreOrderAfterInactiveRefund(orderId)
        return { settled: false, reason: 'gateway-failed' }
      }
      if (attempt.status !== 'SUCCESS') {
        const settledAttempt = await this.prisma.orderRefund.updateMany({
          where: { id: attempt.id, status: { in: ['PROCESSING', 'UNKNOWN'] } },
          data: {
            status: 'SUCCESS',
            gatewayRef: params.gatewayRef,
            settledAt: new Date(),
          },
        })
        if (!settledAttempt.count) return { settled: false, reason: 'race' }
      }
    } else if (params.refundStatus !== 'SUCCESS') {
      // 旧版退款（无流水）的失败回调：维持原有忽略行为
      return { settled: false, reason: 'ignored' }
    }

    if (order.status === 'REFUNDED') return { settled: false, reason: 'already-refunded' }
    // 只接受「已支付/已完成/退款中」的回调：待支付、已取消订单从未产生退款请求，
    // 迟到/串号回调不得把它们改成已退款，更不能扣减从未占用的名额。
    if (!['PAID', 'COMPLETED', 'REFUNDING'].includes(order.status)) {
      this.logger.warn(`忽略订单 ${orderId} 的退款回调，当前状态 ${order.status}`)
      return { settled: false, reason: 'status' }
    }

    const totalFen = orderAmountToFen(order.orderType, Number(order.actualPaid))
    // 部分退款到账：累计未到实付 → 订单回退到退款前状态，不释放名额、不回收权益
    if (attempt) {
      const successRows = await this.prisma.orderRefund.findMany({
        where: { orderId, status: 'SUCCESS' },
        select: { status: true, amountFen: true },
      })
      const cumulativeFen = this.sumSuccessRefundFen(successRows)
      if (cumulativeFen < totalFen) {
        const refundColumnValue = isFenDenominatedOrder(order.orderType)
          ? cumulativeFen
          : cumulativeFen / 100
        const restored = await this.prisma.order.updateMany({
          where: { id: orderId, status: 'REFUNDING' },
          data: {
            status: (attempt.prevOrderStatus || 'PAID') as OrderStatus,
            refundAmount: refundColumnValue,
          },
        })
        if (restored.count && order.orderType === 'COURSE' && order.course) {
          await this.notification.refundSuccess(order.userId, {
            courseName: order.course.title,
            amount: `¥${(attempt.amountFen / 100).toFixed(2)}`,
            orderId: order.id,
          })
        }
        return { settled: false, reason: 'partial' }
      }
    }

    // 取消后支付再退款 / 课程取消后支付退款：订单从未占用名额，跳过扣减与递补
    const noSeatRelease = skipsSeatRelease(order.cancelReason)
    // 只有整单退款才撤销会员卡权益；客诉部分补偿不回收卡片
    const fullRefund = attempt
      ? true // 走到这里说明本次到账后累计已退满实付
      : Number(order.refundAmount ?? order.actualPaid) >= Number(order.actualPaid)
    let settledRefund = false

    await this.prisma.$transaction(async (tx) => {
      // 条件更新：并发/重复回调只有一个能完成名额与权益变更
      const settled = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['PAID', 'COMPLETED', 'REFUNDING'] } },
        data: { status: 'REFUNDED', refundTime: new Date() },
      })
      if (!settled.count) return
      settledRefund = true

      if (order.orderType === 'COURSE' && order.courseId && !noSeatRelease) {
        await tx.course.updateMany({
          where: { id: order.courseId, currentEnrolled: { gt: 0 } },
          data: { currentEnrolled: { decrement: 1 } },
        })
      }
      if (order.orderType === 'COURSE' || order.orderType === 'WAITLIST') {
        await tx.waitlistEntry.updateMany({
          where: {
            orderId: order.id,
            status: { in: ['PENDING_PAYMENT', 'WAITING', 'CONVERTED'] },
          },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        })
      }
      if (order.orderType === 'COMMUNITY' && order.communityId) {
        // 只撤销本单贡献：续费退款后仍需保留此前未退订单的有效期。
        // 展示人数按累计口径保留，不做回减，避免续费订单退款时误扣。
        const paidUntil = await this.replayCommunityPaidUntil(
          tx,
          order.userId,
          order.communityId,
        )
        await tx.communityJoin.updateMany({
          where: { communityId: order.communityId, userId: order.userId },
          data: { paidUntil },
        })
      }
      if (order.orderType === 'MEMBER_CARD' && fullRefund) {
        await this.revokeMemberCard(tx, order)
      }
    })

    if (!settledRefund) return { settled: false, reason: 'race' }

    // 课程订单退款释放名额后触发候补递补（会员席优先）
    if (order.orderType === 'COURSE' && order.courseId && !noSeatRelease) {
      await this.waitlist.promote(order.courseId).catch(() => undefined)
    }

    if (order.orderType === 'COURSE' && order.course) {
      await this.notification.refundSuccess(order.userId, {
        courseName: order.course.title,
        amount: `¥${orderAmountToYuan(order.orderType, Number(order.refundAmount ?? order.actualPaid)).toFixed(2)}`,
        orderId: order.id,
      })
    }
    return { settled: true }
  }

  /**
   * 整单退款后回收会员卡权益：按商品时长从到期日回退。
   * - 本单新开的卡：到期日回到起始日 → 置 EXPIRED
   * - 续费单：仅扣回本单时长，之前的有效期保留
   */
  private async revokeMemberCard(
    db: Pick<Prisma.TransactionClient, 'memberCard' | 'memberCardProduct'>,
    order: { memberCardId: string | null; memberCardProductId: string | null },
  ) {
    if (!order.memberCardId) return
    const card = await db.memberCard.findUnique({ where: { id: order.memberCardId } })
    if (!card) return
    const product = order.memberCardProductId
      ? await db.memberCardProduct.findUnique({ where: { id: order.memberCardProductId } })
      : null
    const days = product?.durationDays ?? 0
    const endDate = new Date(card.endDate)
    endDate.setDate(endDate.getDate() - days)
    const expired = endDate.getTime() <= Date.now()
    await db.memberCard.update({
      where: { id: card.id },
      data: {
        endDate,
        ...(expired ? { status: 'EXPIRED' as const } : {}),
      },
    })
  }

  /** 按仍未退款的订单重算社群有效期（用于不走网关回调的 0 元退款） */
  private async recomputeCommunityMembership(userId: string, communityId: string) {
    const paidUntil = await this.replayCommunityPaidUntil(this.prisma, userId, communityId)
    await this.prisma.communityJoin.updateMany({
      where: { communityId, userId },
      data: { paidUntil },
    })
  }

  /**
   * 取消后释放一个课程名额并尝试候补递补。
   * 用于 0 元退款等不会产生退款回调的场景，避免名额永久占用。
   */
  private async releaseSeatAndPromote(courseId: string) {
    await this.prisma.course.updateMany({
      where: { id: courseId, currentEnrolled: { gt: 0 } },
      data: { currentEnrolled: { decrement: 1 } },
    })
    await this.waitlist.promote(courseId).catch(() => undefined)
  }

  /**
   * 按课程 refundRules（JSON）计算退款金额；无规则时不退款。
   * 时间基准必须与报名/开课判定一致：startDate + startTime，而不是日期零点。
   * 百分比结果取整到「分」，避免小数分进入订单与支付网关。
   */
  private calculateRefund(order: any): number {
    const paid = Number(order.actualPaid)
    if (!order.course?.startDate) return 0

    const rules = this.parseRefundRules(order.course.refundRules)
    if (!rules.length) return 0

    const now = new Date()
    const start = courseStartAt(order.course)
    const hoursUntilStart = (start.getTime() - now.getTime()) / 3_600_000

    for (const rule of rules) {
      const from = rule.hoursFrom
      const to = rule.hoursTo ?? Infinity
      if (hoursUntilStart >= from && hoursUntilStart < to) {
        return Math.round(Math.max(0, (paid * rule.refundPercent) / 100))
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
      case 'COMMUNITY':
        return 'Full愈 社群年费'
      default:
        return 'Full愈 课程报名'
    }
  }
}
