import { Injectable, Optional } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import {
  BrandPerksService,
  brandPriceUnknown,
  type BrandPerkStatus,
} from '../../common/crm/brand-perks.service'
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
  /** 单位与入参 basePrice 一致（课程链路为「分」） */
  discountAmount: number
  /** 命中的时段折扣规则 id（未命中为 null） */
  hitTimeRuleId: string | null
  /** 命中详情（前端展示"会员时段价"用；未命中为 null）。其中 fixedPrice 单位为「元」 */
  timeDiscount: TimeDiscountHit | null
  /**
   * 优惠来源：PASS = 在场畅练卡 0 元报课；BRAND = Full愈品牌会员价；null = 无会员优惠。
   * 可选字段，旧调用方忽略即可。
   */
  memberSource?: 'PASS' | 'BRAND' | null
  /** 品牌会员资格暂时无法确认（仅宽松模式下出现），前端可提示「会员价稍后确认」 */
  brandUnknown?: boolean
}

export interface MemberDiscountOptions {
  /** 预先查好的品牌会员权益（报名下单在加锁/事务外查好再传入，避免事务内等 HTTP） */
  brand?: BrandPerkStatus
  /** true：品牌资格无法确认时拒绝下单（503），不按原价扣款；false：按非会员价并标记 brandUnknown */
  strict?: boolean
}

/**
 * 品牌会员按年卡口径套用既有会员价规则（时段折扣 cardTypes / 课程会员折扣 cardType）。
 * 会议只说「把优惠逻辑落到品牌会员上」，没有单独的品牌会员价表，先复用 YEARLY 配置，见决策文档。
 */
export const BRAND_MEMBER_PRICE_CARD_TYPE: MemberCardType = 'YEARLY'

/**
 * 定价服务：阶梯价按报名顺序区间锁价 + 会员折扣计算。
 * 2026-11-08 起：
 * - 有效畅练卡 = 0 元报课（课程原价/阶梯价照常记账，抵扣额 = 全额）；
 * - 没有畅练卡的 Full愈品牌会员（CRM 权益 tierPrice）走会员价：
 *   时段折扣规则（门店特异性 + 手动优先级）→ 课程固定折扣 → 无折扣；
 * - 其他用户无会员优惠。
 * 被报名下单与候补入队复用。
 */

/** Prisma Json 列读出为 JsonValue，收窄成期望的数组类型；非数组（含 JSON null）按空数组处理 */
function jsonArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly brandPerks?: BrandPerksService,
  ) {}

  /** 查品牌会员在场权益；未接入 CRM 时视为非会员。 */
  async brandStatus(userId: string): Promise<BrandPerkStatus> {
    if (!this.brandPerks) return { perks: null, unknown: false }
    return this.brandPerks.resolve(userId)
  }

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
   * 0) 有效畅练卡 → 0 元报课（discountAmount = basePrice）
   * 非品牌会员（CRM 权益无 tierPrice）→ 无折扣；品牌会员按年卡口径：
   * 1) 时段折扣规则（按预约开始时间判定，门店特异性 > 全局兜底，组内 priority 升序）
   * 2) 未命中 → 课程 × 卡类型固定折扣（原有逻辑）
   * 3) 都没有 → 无折扣
   * 品牌会员价不写 order.cardType（那一列只记本地畅练卡），以 memberSource 区分来源。
   * @returns discountAmount 按 basePrice 计算；>100% 加价或固定价高于原价时为负数
   */
  async getMemberDiscount(
    userId: string,
    courseId: string,
    basePrice: number,
    appointmentStart: Date,
    options: MemberDiscountOptions = {},
  ): Promise<MemberDiscountResult> {
    const now = new Date()
    const none: MemberDiscountResult = {
      cardType: null,
      discountPercent: null,
      discountAmount: 0,
      hitTimeRuleId: null,
      timeDiscount: null,
      memberSource: null,
    }
    const card = await this.prisma.memberCard.findFirst({
      where: { userId, status: 'ACTIVE', endDate: { gt: now } },
      orderBy: { endDate: 'desc' },
    })
    // 0) 畅练卡：有效期内 0 元报课。基础价照常记入 originalPrice，抵扣额 = 全额，便于成本分摊。
    if (card) {
      return {
        cardType: card.type,
        discountPercent: 0,
        discountAmount: Math.max(0, basePrice),
        hitTimeRuleId: null,
        timeDiscount: null,
        memberSource: 'PASS',
      }
    }

    const brand = options.brand ?? (await this.brandStatus(userId))
    if (brand.unknown) {
      if (options.strict) throw brandPriceUnknown()
      return { ...none, brandUnknown: true }
    }
    if (!brand.perks?.tierPrice) return none
    const priceCardType = BRAND_MEMBER_PRICE_CARD_TYPE

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
      cardType: priceCardType,
      appointmentStart,
      durationMinutes: course?.duration ?? null,
    })
    if (hit) {
      if (hit.actionType === 'PERCENT') {
        // discountPercent=70 表示 7 折；>100 时 discountAmount 为负 = 峰时加价
        // 金额以「分」为单位取整，避免 0.15000000000000002 这类浮点毛刺落进订单
        const discountAmount = Math.round(basePrice * (1 - (hit.discountPercent as number) / 100))
        return {
          cardType: null,
          discountPercent: hit.discountPercent,
          discountAmount,
          hitTimeRuleId: hit.ruleId,
          timeDiscount: hit,
          memberSource: 'BRAND',
        }
      }
      // FIXED_BY_DURATION：会员价 = 固定价，折扣额 = 原价与固定价之差（可为负）
      // 单位换算点：basePrice 与订单各金额列在课程链路是「分」，而规则里配置的
      // fixedPrices.price 是「元」（后台按元录入、预览按元展示），只在此处换算一次。
      const fixedPriceFen = Math.round((hit.fixedPrice as number) * 100)
      return {
        cardType: null,
        discountPercent: null,
        discountAmount: basePrice - fixedPriceFen,
        hitTimeRuleId: hit.ruleId,
        timeDiscount: hit,
        memberSource: 'BRAND',
      }
    }

    // 2) 回退：课程 × 卡类型固定折扣（原有逻辑）
    const discount = await this.prisma.courseMemberDiscount.findUnique({
      where: { courseId_cardType: { courseId, cardType: priceCardType } },
    })
    if (!discount) {
      return { ...none, memberSource: 'BRAND' }
    }
    const discountAmount = Math.max(0, Math.round(basePrice * (1 - discount.discountPercent / 100)))
    return {
      cardType: null,
      discountPercent: discount.discountPercent,
      discountAmount,
      hitTimeRuleId: null,
      timeDiscount: null,
      memberSource: 'BRAND',
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
