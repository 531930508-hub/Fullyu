import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { PricingService } from '../pricing/pricing.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { SEAT_LOCK_DURATION_MINUTES, POINTS_TO_YUAN_RATIO } from '@fullyu/shared'
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
    const member = await this.pricing.getMemberDiscount(userId, courseId, basePrice)
    const priceAfterDiscount = Math.max(0, basePrice - member.discountAmount)

    const pointsBalance = await this.pricing.getPointsBalance(userId)
    const vouchers = await this.listUsableVouchers(userId, courseId)

    const isFull = course.currentEnrolled + (position - course.currentEnrolled - 1) >= course.maxCapacity
    const remaining = Math.max(0, course.maxCapacity - (position - 1))

    return {
      courseId,
      position,
      basePrice,
      memberCardType: member.cardType,
      discountPercent: member.discountPercent,
      discountAmount: member.discountAmount,
      priceAfterDiscount,
      allowDeduction: course.allowDeduction,
      pointsBalance: course.allowDeduction ? pointsBalance : 0,
      maxPointsDeduction: course.allowDeduction
        ? Math.min(pointsBalance * POINTS_TO_YUAN_RATIO, priceAfterDiscount)
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
    return this.redis.withLock(`enroll:${courseId}`, async () => {
      return this.prisma.$transaction(async (tx) => {
        const course = await tx.course.findUnique({
          where: { id: courseId },
          include: { priceTiers: true },
        })
        if (!course) throw new BusinessException('课程不存在', 4004)
        if (course.status !== 'PUBLISHED') throw new BusinessException('课程未开放报名', 4008)

        // 报名二次校验：以事务内最新数据为准，兜底“报名页停留期间课程被改期/改场”的并发场景
        const now = new Date()
        if (course.enrollStartAt && now < course.enrollStartAt) {
          throw new BusinessException('报名尚未开始', 4018)
        }
        if (course.enrollEndAt && now > course.enrollEndAt) {
          throw new BusinessException('报名已截止', 4009)
        }
        if (course.startDate && now >= course.startDate) {
          throw new BusinessException('课程已开课，无法报名', 4019)
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
        const member = await this.pricing.getMemberDiscount(userId, courseId, basePrice)
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
            pointsDeduction = Math.min(dto.usePoints * POINTS_TO_YUAN_RATIO, priceAfterDiscount)
          }
        }

        // 校验代金券
        let voucherDeduction = 0
        let voucherId: string | undefined
        if (dto.voucherId) {
          const voucher = await this.validateVoucher(tx, dto.voucherId, userId, courseId)
          voucherId = voucher.id
          if (voucher.mode === 'REDUCE_TO') {
            // 减至模式：将实付（扣积分后）降至目标价，差额即抵扣金额
            voucherDeduction = priceAfterDiscount - pointsDeduction - Number(voucher.targetPrice)
          } else {
            voucherDeduction = Math.min(Number(voucher.amount), priceAfterDiscount - pointsDeduction)
          }
          voucherDeduction = Math.max(0, voucherDeduction)
        }

        const actualPaid = Math.max(0, priceAfterDiscount - pointsDeduction - voucherDeduction)

        // 创建待支付订单
        const orderNo = await generateOrderNo(this.redis, 'COURSE')
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
            cardType: member.cardType ?? undefined,
          },
        })

        // 预扣积分（负向流水），取消/超时时回补
        if (pointsDeduction > 0) {
          const balance = await this.pricing.getPointsBalance(userId)
          const usedPoints = Math.round(pointsDeduction / POINTS_TO_YUAN_RATIO)
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
    return vouchers.filter(
      (v) => v.applicableAll || (v.applicableCourseIds as string[]).includes(courseId),
    )
  }

  private async validateVoucher(tx: any, voucherId: string, userId: string, courseId: string) {
    const voucher = await tx.voucher.findFirst({ where: { id: voucherId, userId } })
    if (!voucher) throw new BusinessException('代金券不存在', 4014)
    if (voucher.status !== 'UNUSED') throw new BusinessException('代金券不可用', 4015)
    if (voucher.expiresAt < new Date()) throw new BusinessException('代金券已过期', 4016)
    const applicable = voucher.applicableAll || (voucher.applicableCourseIds as string[]).includes(courseId)
    if (!applicable) throw new BusinessException('代金券不适用于该课程', 4017)
    return voucher
  }
}
