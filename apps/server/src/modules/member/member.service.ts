import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

/** 连续/累计缺席达到该阈值则冻结会员卡 */
const MEMBER_FREEZE_THRESHOLD = 3

@Injectable()
export class MemberService {
  private readonly logger = new Logger('MemberService')

  constructor(private readonly prisma: PrismaService) {}

  /** 上架的会员卡商品列表 */
  async listProducts() {
    return this.prisma.memberCardProduct.findMany({
      where: { status: 'ON_SHELF' },
      orderBy: [{ sort: 'asc' }, { price: 'asc' }],
    })
  }

  /** 我的会员卡 */
  async myCards(userId: string) {
    return this.prisma.memberCard.findMany({
      where: { userId },
      orderBy: { endDate: 'desc' },
    })
  }

  /** 当前有效会员卡（未过期且 ACTIVE） */
  async activeCard(userId: string) {
    const now = new Date()
    return this.prisma.memberCard.findFirst({
      where: { userId, status: 'ACTIVE', endDate: { gt: now } },
      orderBy: { endDate: 'desc' },
    })
  }

  /**
   * 购买/续费会员卡：创建 MEMBER_CARD 待支付订单
   * 支付成功后由 PaymentService.fulfillMemberCard 生成/续期会员卡
   */
  async purchase(userId: string, productId: string) {
    const product = await this.prisma.memberCardProduct.findUnique({
      where: { id: productId },
    })
    if (!product || product.status !== 'ON_SHELF') {
      throw new BusinessException('会员卡商品不存在或已下架', 4030)
    }

    const order = await this.prisma.order.create({
      data: {
        userId,
        orderType: 'MEMBER_CARD',
        memberCardProductId: product.id,
        cardType: product.type,
        originalPrice: product.price,
        discountAmount: 0,
        pointsDeduction: 0,
        voucherDeduction: 0,
        actualPaid: product.price,
        status: 'PENDING_PAYMENT',
      },
    })

    return { orderId: order.id, actualPaid: Number(product.price) }
  }

  /**
   * 记录一次缺席：累计 absences，达到阈值自动冻结
   */
  async recordAbsence(cardId: string) {
    const card = await this.prisma.memberCard.findUnique({ where: { id: cardId } })
    if (!card) throw new BusinessException('会员卡不存在', 4031)

    const absences = card.absences + 1
    const shouldFreeze = absences >= MEMBER_FREEZE_THRESHOLD && card.status === 'ACTIVE'

    return this.prisma.memberCard.update({
      where: { id: cardId },
      data: {
        absences,
        status: shouldFreeze ? 'FROZEN' : card.status,
      },
    })
  }

  /**
   * 解冻会员卡（后台操作）：重置缺席计数
   */
  async unfreeze(cardId: string) {
    const card = await this.prisma.memberCard.findUnique({ where: { id: cardId } })
    if (!card) throw new BusinessException('会员卡不存在', 4031)
    if (card.status !== 'FROZEN') {
      throw new BusinessException('会员卡未处于冻结状态', 4032)
    }
    const now = new Date()
    const expired = card.endDate <= now
    return this.prisma.memberCard.update({
      where: { id: cardId },
      data: {
        status: expired ? 'EXPIRED' : 'ACTIVE',
        absences: 0,
      },
    })
  }

  /**
   * 冻结会员卡（后台手动操作）
   */
  async freeze(cardId: string) {
    const card = await this.prisma.memberCard.findUnique({ where: { id: cardId } })
    if (!card) throw new BusinessException('会员卡不存在', 4031)
    return this.prisma.memberCard.update({
      where: { id: cardId },
      data: { status: 'FROZEN' },
    })
  }

  // ===== 会员卡商品（后台） =====

  /** 后台商品列表（全部状态） */
  async adminListProducts() {
    return this.prisma.memberCardProduct.findMany({
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
    })
  }

  async createProduct(data: any) {
    return this.prisma.memberCardProduct.create({ data })
  }

  async updateProduct(id: string, data: any) {
    return this.prisma.memberCardProduct.update({ where: { id }, data })
  }

  /** 上架/下架商品 */
  async setProductStatus(id: string, status: 'ON_SHELF' | 'OFF_SHELF') {
    return this.prisma.memberCardProduct.update({ where: { id }, data: { status } })
  }

  /** 后台会员卡列表（可按用户/状态过滤） */
  async adminListCards(query: { userId?: string; status?: string }) {
    const where: any = {}
    if (query.userId) where.userId = query.userId
    if (query.status) where.status = query.status
    return this.prisma.memberCard.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { phone: true, nickname: true } } },
    })
  }
}
