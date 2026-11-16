import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { PricingService } from '../pricing/pricing.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import {
  SEAT_LOCK_DURATION_MINUTES,
  POINTS_TO_FEN_RATIO,
  voucherYuanToFen,
  resolveCourseLifecycle,
} from '@fullyu/shared'
import { generateOrderNo } from '../../common/order-no.helper'

export interface EnrollDto {
  usePoints?: number
  voucherId?: string
}

/**
 * 报名下单链路：询价（阶梯锁价 + 会员折扣）→ 校验抵扣 → 原子下单。
 * 关键路径用 Redis 锁串行化，避免超卖与阶梯价错乱。
 */
@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * 询价：返回当前报名顺序位对应价格、会员折扣、可用积分/代金券
   */
  async quote(courseId: string, userId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { priceTiers: true },
    })
    if (!course) throw new BusinessException('课程不存在', 4004)

    const position = await this.pricing.getNextPosition(this.prisma, courseId, course.currentEnrolled)
    const basePrice = this.pricing.getTierPrice(course.priceTiers, position, course.originalPrice)
    const member = await this.pricing.getMemberDiscount(
      userId,
      courseId,
      basePrice,
      this.pricing.courseStartAt(course),
    )
    const priceAfterDiscount = Math.max(0, basePrice - member.discountAmount)

    const pointsBalance = await this.pricing.getPointsBalance(userId)
    const vouchers = await this.listUsableVouchers(userId, courseId)

    const isFull = course.currentEnrolled + (position - course.currentEnrolled - 1) >= course.maxCapacity
    const remaining = Math.max(0, course.maxCapacity - (position - 1))
    const lifecycle = resolveCourseLifecycle(course)

    return {
      courseId,
      phase: lifecycle.phase,
      bookable: lifecycle.bookable,
      enrollDeadline: lifecycle.enrollDeadline,
      position,
      basePrice,
      memberCardType: member.cardType,
      discountPercent: member.discountPercent,
      timeDiscount: member.timeDiscount,
      discountAmount: member.discountAmount,
      priceAfterDiscount,
      /** PASS = 畅练卡 0 元报课；BRAND = Full愈品牌会员价；null = 无会员优惠 */
      memberSource: member.memberSource ?? null,
      /** 品牌会员资格暂时无法确认：此价格为非会员价，下单时会再次确认 */
      memberPriceUnconfirmed: Boolean(member.brandUnknown),
      allowDeduction: course.allowDeduction,
      pointsBalance: course.allowDeduction ? pointsBalance : 0,
      maxPointsDeduction: course.allowDeduction
        ? Math.min(pointsBalance * POINTS_TO_FEN_RATIO, priceAfterDiscount)
        : 0,
      vouchers,
      remaining,
      isFull,
    }
  }

  /**
   * 报名下单：锁价 + 校验抵扣 + 生成限时待支付订单（分布式锁 + 事务）
   */
  async enroll(courseId: string, userId: string, dto: EnrollDto) {
    // 品牌会员资格要走 CRM HTTP：在加锁与事务之外先查好，事务里只用结果。
    const brand = await this.pricing.brandStatus(userId)
    return this.redis.withLock(`enroll:${courseId}`, async () => {
      return this.prisma.$transaction(async (tx) => {
        const course = await tx.course.findUnique({
          where: { id: courseId },
          include: { priceTiers: true },
        })
        if (!course) throw new BusinessException('课程不存在', 4004)
        if (course.status !== 'PUBLISHED') throw new BusinessException('课程未开放报名', 4008)

        // 报名二次校验：以事务内最新数据为准，兜底“报名页停留期间课程被改期/改场”的并发场景。
        // 截止时刻按 startDate + startTime 推导，支持后台通过 enrollEndAt 开放补报名。
        const now = new Date()
        const lifecycle = resolveCourseLifecycle(course, now)
        if (lifecycle.phase === 'ENROLL_UPCOMING') {
          throw new BusinessException('报名尚未开始', 4018)
        }
        if (lifecycle.phase === 'ENDED') {
          throw new BusinessException('课程已结束，无法报名', 4019)
        }
        if (!lifecycle.bookable) {
          throw new BusinessException(
            lifecycle.phase === 'ONGOING' ? '课程已开课，无法报名' : '报名已截止',
            4009,
          )
        }
        // 场地兜底：课程被改期/改场后场地被停用则拦截报名
        const venue = await tx.venue.findUnique({ where: { id: course.venueId } })
        if (!venue || !venue.isAvailable) {
          throw new BusinessException('课程场地暂不可用，暂无法报名', 4025)
        }

        // 容量校验（含待支付占位）
        const pending = await tx.order.count({
          where: { courseId, orderType: 'COURSE', status: 'PENDING_PAYMENT' },
        })
        const occupied = course.currentEnrolled + pending
        if (occupied >= course.maxCapacity) {
          // 已满，提示前端走候补
          throw new BusinessException('课程已满，请加入候补', 4010)
        }

        // 防重复报名（已有有效订单）
        const dup = await tx.order.findFirst({
          where: {
            courseId,
            userId,
            orderType: 'COURSE',
            status: { in: ['PENDING_PAYMENT', 'PAID', 'COMPLETED'] },
          },
        })
        if (dup) throw new BusinessException('您已报名该课程', 4011)

        // 锁价
        const position = occupied + 1
        const basePrice = this.pricing.getTierPrice(course.priceTiers, position, course.originalPrice)
        // strict：品牌会员资格确认不了时拒绝下单，不按非会员价向会员多收钱
        const member = await this.pricing.getMemberDiscount(
          userId,
          courseId,
          basePrice,
          this.pricing.courseStartAt(course),
          { brand, strict: true },
        )
        const priceAfterDiscount = Math.max(0, basePrice - member.discountAmount)

        // 校验积分抵扣
        let pointsDeduction = 0
        if (dto.usePoints !== undefined && dto.usePoints !== null && dto.usePoints !== 0) {
          if (!Number.isInteger(dto.usePoints) || dto.usePoints < 0) {
            throw new BusinessException('使用积分需为非负整数', 4011)
          }
          if (dto.usePoints > 0) {
            if (!course.allowDeduction) throw new BusinessException('该课程不支持积分抵扣', 4012)
            const balance = await this.pricing.getPointsBalance(userId)
            if (dto.usePoints > balance) throw new BusinessException('积分余额不足', 4013)
            pointsDeduction = Math.min(dto.usePoints * POINTS_TO_FEN_RATIO, priceAfterDiscount)
          }
        }

        // 校验代金券
        let voucherDeduction = 0
        let voucherId: string | undefined
        let sponsorOrderId: string | undefined
        if (dto.voucherId) {
          const checked = await this.validateVoucher(tx, dto.voucherId, userId, courseId)
          const voucher = checked.voucher
          voucherId = voucher.id
          sponsorOrderId = checked.sponsorOrderId
          if (voucher.mode === 'REDUCE_TO') {
            // 减至模式：将实付（扣积分后）降至目标价，差额即抵扣金额
            voucherDeduction = priceAfterDiscount - pointsDeduction - voucherYuanToFen(Number(voucher.targetPrice))
          } else {
            voucherDeduction = Math.min(voucherYuanToFen(Number(voucher.amount)), priceAfterDiscount - pointsDeduction)
          }
          voucherDeduction = Math.max(0, voucherDeduction)
          // 已经 0 元（畅练卡 / 积分抵满）时不再占用代金券，避免券被白白核销
          if (voucherDeduction === 0) {
            voucherId = undefined
            sponsorOrderId = undefined
          }
        }

        // 买一赠一 = 邀请人 1 席 + 好友 1 席：同一张邀请人订单只能带一位好友。
        // 报名按课程加锁，这里的 count 不会被并发好友插队；已退款/已取消的同席单不占名额。
        if (sponsorOrderId) {
          const taken = await tx.order.count({
            where: {
              sponsorOrderId,
              status: { in: ['PENDING_PAYMENT', 'PAID', 'COMPLETED'] },
            },
          })
          if (taken > 0) {
            throw new BusinessException('这份邀请的同席名额已被使用，一份邀请只能带一位好友', 4022)
          }
        }

        const actualPaid = Math.max(0, priceAfterDiscount - pointsDeduction - voucherDeduction)

        // 创建待支付订单
        const orderNo = await generateOrderNo(this.redis, 'COURSE', this.prisma)
        const order = await tx.order.create({
          data: {
            orderNo,
            userId,
            courseId,
            orderType: 'COURSE',
            originalPrice: basePrice,
            discountAmount: member.discountAmount,
            pointsDeduction,
            voucherDeduction,
            actualPaid,
            status: 'PENDING_PAYMENT',
            voucherId: voucherId,
            // 买一赠一好友席：记下邀请人订单，退款/退课时据此级联取消本席
            sponsorOrderId,
            memberCardType: member.cardType ?? undefined,
            hitTimeRuleId: member.hitTimeRuleId ?? undefined,
          },
        })

        // 预扣积分（负向流水），取消/超时时回补
        if (pointsDeduction > 0) {
          const balance = await this.pricing.getPointsBalance(userId)
          const usedPoints = Math.round(pointsDeduction / POINTS_TO_FEN_RATIO)
          await tx.pointsRecord.create({
            data: {
              userId,
              amount: -usedPoints,
              balance: balance - usedPoints,
              type: 'CONSUMPTION',
              reason: `课程报名抵扣：${course.title}`,
              relatedId: order.id,
            },
          })
        }

        // 预占代金券
        if (voucherId) {
          await tx.voucher.update({
            where: { id: voucherId },
            data: { status: 'USED', usedAt: new Date() },
          })
        }

        return {
          orderId: order.id,
          actualPaid,
          expireInSeconds: SEAT_LOCK_DURATION_MINUTES * 60,
        }
      })
    })
  }

  private async listUsableVouchers(userId: string, courseId: string) {
    const now = new Date()
    const vouchers = await this.prisma.voucher.findMany({
      where: { userId, status: 'UNUSED', expiresAt: { gt: now } },
      orderBy: { amount: 'desc' },
    })
    const scoped = vouchers.filter(
      (v) => v.applicableAll || (v.applicableCourseIds as string[]).includes(courseId),
    )
    // 买一赠一券只在「邀请人也在这节课」时可展示：邀请人退课后券仍在，但不能用
    const hostIds = [
      ...new Set(scoped.map((v) => v.hostUserId).filter((id): id is string => Boolean(id))),
    ]
    if (!hostIds.length) return scoped
    const hosts = await this.prisma.order.findMany({
      where: {
        courseId,
        userId: { in: hostIds },
        orderType: 'COURSE',
        status: { in: ['PAID', 'COMPLETED'] },
      },
      select: { userId: true },
    })
    const joined = new Set(hosts.map((order) => order.userId))
    return scoped.filter((v) => !v.hostUserId || joined.has(v.hostUserId))
  }

  /**
   * 校验券可用性。买一赠一券额外要求：
   * - 不能是邀请人自己用（自己本来就付了全价）；
   * - 邀请人在这节课有已支付订单（同席成立），并把该订单记到好友订单的 sponsorOrderId 上。
   */
  private async validateVoucher(tx: any, voucherId: string, userId: string, courseId: string) {
    const voucher = await tx.voucher.findFirst({ where: { id: voucherId, userId } })
    if (!voucher) throw new BusinessException('代金券不存在', 4014)
    if (voucher.status !== 'UNUSED') throw new BusinessException('代金券不可用', 4015)
    if (voucher.expiresAt < new Date()) throw new BusinessException('代金券已过期', 4016)
    const applicable = voucher.applicableAll || (voucher.applicableCourseIds as string[]).includes(courseId)
    if (!applicable) throw new BusinessException('代金券不适用于该课程', 4017)
    if (!voucher.hostUserId) return { voucher, sponsorOrderId: undefined as string | undefined }
    if (voucher.hostUserId === userId) {
      throw new BusinessException('这是你发出的买一赠一券，请好友使用', 4020)
    }
    const sponsor = await tx.order.findFirst({
      where: {
        courseId,
        userId: voucher.hostUserId,
        orderType: 'COURSE',
        status: { in: ['PAID', 'COMPLETED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (!sponsor) {
      throw new BusinessException('买一赠一券需与邀请人报名同一节课', 4021)
    }
    return { voucher, sponsorOrderId: sponsor.id as string | undefined }
  }
}
