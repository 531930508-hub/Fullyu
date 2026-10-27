import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { HuifuPayService } from './huifu-pay.service'
import { NotificationService } from '../../common/notification/notification.service'
import { WaitlistService } from '../waitlist/waitlist.service'
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

      await this.refundFull(orderId, LATE_PAYMENT_REFUND_REASON)
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
        await this.refundFull(orderId, refundAfterFulfill)
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
  async refundOrder(orderId: string, operatorReason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status === 'COMPLETED') {
      throw new BusinessException(
        '课程已完成，不支持自助退款；如有问题请联系客服或线下工作人员',
        4007,
      )
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
        throw new BusinessException('课程已开始，不支持自助退款；如需协助请联系客服', 4007)
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

    await this.refundViaGateway(order, {
      outTradeNo: order.id,
      outRefundNo: `RF${order.id}`,
      totalFen: Math.max(1, totalFen),
      refundFen: Math.max(1, refundFen),
      reason: operatorReason,
      paymentId: order.paymentId,
    })

    // 现金全额退回时，积分与代金券一并返还；部分退款不返还（按实际支付比例结算）
    if (refundFen >= totalFen) {
      await this.restoreBenefits(order)
    }

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
      await this.refundViaGateway(order, {
        outTradeNo: order.id,
        outRefundNo: `RF${order.id}`,
        totalFen,
        refundFen: totalFen,
        reason,
        paymentId: order.paymentId,
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
   * 不受课程 refundRules 限制。refundAmount 单位为元，0 或不传则全额退。
   */
  async forceRefund(
    orderId: string,
    refundAmount?: number,
    reason?: string,
  ): Promise<{ refundAmount: number }> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new BusinessException('订单不存在', 4004)
    if (order.status !== 'PAID' && order.status !== 'COMPLETED') {
      throw new BusinessException('订单状态不可退款', 4007)
    }

    const paidYuan = orderAmountToYuan(order.orderType, Number(order.actualPaid))
    // 未指定或非法金额时全额退；不得超过实付；先按分取整，避免 12.345 这类金额进入库内
    let amount = refundAmount && refundAmount > 0 ? refundAmount : paidYuan
    amount = Math.min(amount, paidYuan)
    amount = Math.round(amount * 100) / 100
    const totalFen = orderAmountToFen(order.orderType, Number(order.actualPaid))
    const refundFen = Math.round(amount * 100)
    // refundAmount 列与订单金额列同口径：课程/候补/社群为分，会员卡为元
    const refundColumnValue = isFenDenominatedOrder(order.orderType) ? refundFen : refundFen / 100

    if (refundFen <= 0) {
      // 0 元订单（全积分/全券抵扣、免年费）也要完整撤销权益，不能只改订单状态
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

    const refunding = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PAID', 'COMPLETED'] } },
      data: {
        status: 'REFUNDING',
        refundAmount: refundColumnValue,
        cancelReason: reason ?? '强制退款',
      },
    })
    if (!refunding.count) {
      throw new BusinessException('订单状态已变化，请刷新后重试', 4007)
    }

    await this.refundViaGateway(order, {
      outTradeNo: order.id,
      outRefundNo: `RF${order.id}`,
      totalFen: Math.max(1, totalFen),
      refundFen: Math.max(1, refundFen),
      reason: reason ?? '强制退款',
      paymentId: order.paymentId,
    })

    // 强制退款全额退回时，同样返还预扣的积分与代金券
    if (refundFen >= totalFen) {
      await this.restoreBenefits(order)
    }

    return { refundAmount: amount }
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
    },
  ): Promise<void> {
    try {
      await this.huifuPay.refund(payload)
    } catch (e) {
      this.logger.error(
        `退款网关调用失败 order=${order.id}: ${(e as Error)?.message ?? String(e)}`,
      )
      if (e instanceof BusinessException && (e.bizCode === 5105 || e.bizCode === 5106)) {
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
      throw new BusinessException(
        '退款申请结果待确认，请稍后在「我的预约」查看或联系客服',
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
    if (result.refund_status !== 'SUCCESS') {
      return ack
    }
    const orderId = result.out_trade_no
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { course: true },
    })
    if (!order || order.status === 'REFUNDED') {
      return ack
    }
    // 只接受「已支付/已完成/退款中」的回调：待支付、已取消订单从未产生退款请求，
    // 迟到/串号回调不得把它们改成已退款，更不能扣减从未占用的名额。
    if (!['PAID', 'COMPLETED', 'REFUNDING'].includes(order.status)) {
      this.logger.warn(`忽略订单 ${orderId} 的退款回调，当前状态 ${order.status}`)
      return ack
    }

    // 取消后支付再退款 / 课程取消后支付退款：订单从未占用名额，跳过扣减与递补
    const noSeatRelease = skipsSeatRelease(order.cancelReason)
    // 只有整单退款才撤销会员卡权益；客诉部分补偿不回收卡片
    const fullRefund = Number(order.refundAmount ?? order.actualPaid) >= Number(order.actualPaid)
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

    if (!settledRefund) return ack

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
    return ack
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
