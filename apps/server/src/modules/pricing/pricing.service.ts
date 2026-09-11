import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { Prisma, MemberCardType } from '@prisma/client'
import {
  pickTimeDiscountRule,
  type TimeDiscountFixedPrice,
  type TimeDiscountHit,
  type TimeDiscountRange,
  type TimeDiscountRuleLike,
} from '@fullyu/shared'

export interface PriceQuote {
  position: number
  basePrice: number
  memberCardType: MemberCardType | null
  discountPercent: number | null
  discountAmount: number
  priceAfterDiscount: number
}

export interface MemberDiscountResult {
  cardType: MemberCardType | null
  discountPercent: number | null
  discountAmount: number
  /** 命中的时段折扣规则 id（未命中为 null） */
  hitTimeRuleId: string | null
  /** 命中详情（前端展示"会员时段价"用；未命中为 null） */
  timeDiscount: TimeDiscountHit | null
}

/**
 * 定价服务：阶梯价按报名顺序区间锁价 + 会员折扣计算。
 * 会员折扣 = 时段折扣规则（门店特异性 + 手动优先级）→ 课程固定折扣 → 无折扣。
 * 被报名下单与候补入队复用。
 */

/** Prisma Json 列读出为 JsonValue，收窄成期望的数组类型；非数组（含 JSON null）按空数组处理 */
function jsonArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 计算课程下一个报名顺序位（已报名 + 待支付占位 + 1）
   */
  async getNextPosition(
    client: Prisma.TransactionClient | PrismaService,
    courseId: string,
    currentEnrolled: number,
  ): Promise<number> {
    const pending = await client.order.count({
      where: { courseId, orderType: 'COURSE', status: 'PENDING_PAYMENT' },
    })
    return currentEnrolled + pending + 1
  }

  /**
   * 按报名顺序位取阶梯价；无匹配区间时回退课程原价
   */
  getTierPrice(
    tiers: Array<{ seatFrom: number; seatTo: number; price: Prisma.Decimal | number }>,
    position: number,
    fallback: Prisma.Decimal | number,
  ): number {
    const hit = tiers.find((t) => position >= t.seatFrom && position <= t.seatTo)
    return Number(hit ? hit.price : fallback)
  }

  /** 由 startDate（日期）+ startTime（HH:mm）拼出课程实际开课时刻（同 checkin 模块口径） */
  courseStartAt(course: { startDate: Date; startTime: string }): Date {
    const d = new Date(course.startDate)
    const [h, m] = (course.startTime || '00:00').split(':').map((v) => Number(v))
    d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0)
    return d
  }

  /**
   * 计算会员折扣：
   * 1) 时段折扣规则（按预约开始时间判定，门店特异性 > 全局兜底，组内 priority 升序）
   * 2) 未命中 → 课程 × 卡类型固定折扣（原有逻辑）
   * 3) 都没有 → 无折扣
   * @returns discountAmount 按 basePrice 计算；>100% 加价或固定价高于原价时为负数
   */
  async getMemberDiscount(
    userId: string,
    courseId: string,
    basePrice: number,
    appointmentStart: Date,
  ): Promise<MemberDiscountResult> {
    const now = new Date()
    const card = await this.prisma.memberCard.findFirst({
      where: { userId, status: 'ACTIVE', endDate: { gt: now } },
      orderBy: { endDate: 'desc' },
    })
    if (!card) {
      return { cardType: null, discountPercent: null, discountAmount: 0, hitTimeRuleId: null, timeDiscount: null }
    }

    // 1) 时段折扣规则
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { duration: true, venue: { select: { orgId: true } } },
    })
    const rows = await this.prisma.memberTimeDiscountRule.findMany({ where: { status: 'ENABLED' } })
    const rules: TimeDiscountRuleLike[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      orgIds: jsonArray<string>(r.orgIds),
      cardTypes: jsonArray<string>(r.cardTypes),
      priority: r.priority,
      weekdays: jsonArray<number>(r.weekdays),
      timeRanges: jsonArray<TimeDiscountRange>(r.timeRanges),
      validFrom: r.validFrom,
      validTo: r.validTo,
      actionType: r.actionType,
      discountPercent: r.discountPercent,
      fixedPrices: r.fixedPrices == null ? null : jsonArray<TimeDiscountFixedPrice>(r.fixedPrices),
      enabled: true,
    }))
    const hit = pickTimeDiscountRule(rules, {
      orgId: course?.venue?.orgId ?? null,
      cardType: card.type,
      appointmentStart,
      durationMinutes: course?.duration ?? null,
    })
    if (hit) {
      if (hit.actionType === 'PERCENT') {
        // discountPercent=70 表示 7 折；>100 时 discountAmount 为负 = 峰时加价
        const discountAmount = basePrice * (1 - (hit.discountPercent as number) / 100)
        return {
          cardType: card.type,
          discountPercent: hit.discountPercent,
          discountAmount,
          hitTimeRuleId: hit.ruleId,
          timeDiscount: hit,
        }
      }
      // FIXED_BY_DURATION：会员价 = 固定价，折扣额 = 原价与固定价之差（可为负）
      const fixedPrice = hit.fixedPrice as number
      return {
        cardType: card.type,
        discountPercent: null,
        discountAmount: basePrice - fixedPrice,
        hitTimeRuleId: hit.ruleId,
        timeDiscount: hit,
      }
    }

    // 2) 回退：课程 × 卡类型固定折扣（原有逻辑）
    const discount = await this.prisma.courseMemberDiscount.findUnique({
      where: { courseId_cardType: { courseId, cardType: card.type } },
    })
    if (!discount) {
      return { cardType: card.type, discountPercent: null, discountAmount: 0, hitTimeRuleId: null, timeDiscount: null }
    }
    const discountAmount = Math.max(0, basePrice * (1 - discount.discountPercent / 100))
    return {
      cardType: card.type,
      discountPercent: discount.discountPercent,
      discountAmount,
      hitTimeRuleId: null,
      timeDiscount: null,
    }
  }

  /**
   * 用户当前积分余额（取最近一条积分流水的余额）
   */
  async getPointsBalance(userId: string): Promise<number> {
    const last = await this.prisma.pointsRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return last?.balance ?? 0
  }
}
