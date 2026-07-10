import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { Prisma, MemberCardType } from '@prisma/client'

export interface PriceQuote {
  position: number
  basePrice: number
  memberCardType: MemberCardType | null
  discountPercent: number | null
  discountAmount: number
  priceAfterDiscount: number
}

/**
 * 定价服务：阶梯价按报名顺序区间锁价 + 会员折扣计算。
 * 被报名下单（Task3）与候补入队（Task4）复用。
 */
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

  /**
   * 计算会员折扣（取用户当前有效会员卡对应的课程折扣配置）
   * @returns discountAmount 为按 basePrice 计算的抵扣金额
   */
  async getMemberDiscount(
    userId: string,
    courseId: string,
    basePrice: number,
  ): Promise<{ cardType: MemberCardType | null; discountPercent: number | null; discountAmount: number }> {
    const now = new Date()
    const card = await this.prisma.memberCard.findFirst({
      where: { userId, status: 'ACTIVE', endDate: { gt: now } },
      orderBy: { endDate: 'desc' },
    })
    if (!card) return { cardType: null, discountPercent: null, discountAmount: 0 }

    const discount = await this.prisma.courseMemberDiscount.findUnique({
      where: { courseId_cardType: { courseId, cardType: card.type } },
    })
    if (!discount) return { cardType: card.type, discountPercent: null, discountAmount: 0 }

    // discountPercent=70 表示 7 折，抵扣 = basePrice * (1 - 70/100)
    const discountAmount = Math.max(0, basePrice * (1 - discount.discountPercent / 100))
    return {
      cardType: card.type,
      discountPercent: discount.discountPercent,
      discountAmount,
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
