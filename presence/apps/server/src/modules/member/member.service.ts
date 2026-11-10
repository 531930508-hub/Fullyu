import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { generateOrderNo } from '../../common/order-no.helper'
import { isValidImageDataUrl, normalizeImageDataUrl } from '../../common/image.util'
import { SEAT_LOCK_DURATION_MINUTES } from '@fullyu/shared'

/** 连续/累计缺席达到该阈值则冻结会员卡 */
const MEMBER_FREEZE_THRESHOLD = 3

@Injectable()
export class MemberService {
  private readonly logger = new Logger('MemberService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

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

  /**
   * 当前有效会员卡（未过期且 ACTIVE）。
   * withStats 仅供畅练卡页使用：按当前卡期统计「用卡报课省下的金额」，
   * 用于临期复购提示。其他页面不传，避免首页/个人页为了一张卡多跑聚合查询。
   */
  async activeCard(userId: string, options: { withStats?: boolean } = {}) {
    const now = new Date()
    const card = await this.prisma.memberCard.findFirst({
      where: { userId, status: 'ACTIVE', endDate: { gt: now } },
      orderBy: { endDate: 'desc' },
    })
    if (!card || !options.withStats) return card

    // 畅练卡订单的 discountAmount 为「分」，且 cardType 有值；
    // 品牌会员价订单 cardType 为空，不会混进畅练卡的节省里。
    const stats = await this.prisma.order.aggregate({
      where: {
        userId,
        orderType: 'COURSE',
        status: { in: ['PAID', 'COMPLETED'] },
        cardType: { not: null },
        paymentTime: { gte: card.startDate, lte: now },
      },
      _sum: { discountAmount: true },
      _count: { _all: true },
    })

    return {
      ...card,
      stats: {
        savedCents: Math.max(0, Math.round(Number(stats._sum.discountAmount) || 0)),
        classCount: stats._count._all,
      },
    }
  }

  /**
   * 购买/续费会员卡：创建 MEMBER_CARD 待支付订单
   * 支付成功后由 PaymentService.fulfillMemberCard 生成/续期会员卡
   * 个人核验照片规则：首次开卡必须上传照片；续期/重新购买可选择不改或修改一次（传则覆盖）。
   * 照片仅可经本链路或后台录入，用户无法在有效期内自助修改。
   */
  async purchase(userId: string, productId: string, photo?: string) {
    const product = await this.prisma.memberCardProduct.findUnique({
      where: { id: productId },
    })
    if (!product || product.status !== 'ON_SHELF') {
      throw new BusinessException('会员卡商品不存在或已下架', 4030)
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new BusinessException('用户不存在', 4033)
    const trimmedPhoto = typeof photo === 'string' ? photo.trim() : ''
    const normalizedPhoto = trimmedPhoto ? normalizeImageDataUrl(trimmedPhoto) : null
    if (trimmedPhoto && !normalizedPhoto) {
      throw new BusinessException('照片格式不正确，请上传 JPG / PNG / WEBP 图片（不超过 5MB）', 4035)
    }
    // 历史脏数据（任意字符串）不能当作已核验照片，否则后台会显示裂图且签到无法核对
    if (!isValidImageDataUrl(user.photo) && !normalizedPhoto) {
      throw new BusinessException('开卡需上传个人照片用于线下签到核验', 4034)
    }
    if (normalizedPhoto) {
      await this.prisma.user.update({ where: { id: userId }, data: { photo: normalizedPhoto } })
    }

    // 防重：同一商品短时间重复点击/重复进入只保留一笔待支付订单
    const pending = await this.prisma.order.findFirst({
      where: {
        userId,
        orderType: 'MEMBER_CARD',
        memberCardProductId: product.id,
        status: 'PENDING_PAYMENT',
        createdAt: { gt: new Date(Date.now() - SEAT_LOCK_DURATION_MINUTES * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (pending) {
      return { orderId: pending.id, actualPaid: Number(pending.actualPaid), reused: true }
    }

    const order = await this.prisma.order.create({
      data: {
        orderNo: await generateOrderNo(this.redis, 'MEMBER_CARD', this.prisma),
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
    return this.prisma.memberCardProduct.create({ data: this.buildProductData(data, true) })
  }

  async updateProduct(id: string, data: any) {
    return this.prisma.memberCardProduct.update({ where: { id }, data: this.buildProductData(data, false) })
  }

  /** 白名单构建会员卡商品数据，避免前端未知字段直通 Prisma。价格单位为元 */
  private buildProductData(data: any, isCreate: boolean) {
    const out: any = {}
    if (data.type !== undefined) out.type = data.type
    if (data.name !== undefined) out.name = data.name
    if (data.price !== undefined) out.price = Number(data.price)
    if (data.durationDays !== undefined) out.durationDays = Number(data.durationDays)
    if (data.description !== undefined) out.description = data.description
    if (data.benefits !== undefined) out.benefits = Array.isArray(data.benefits) ? data.benefits : []
    if (data.status !== undefined) out.status = data.status
    if (data.sort !== undefined) out.sort = Number(data.sort)
    if (isCreate && out.benefits === undefined) out.benefits = []
    return out
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
    const cards = await this.prisma.memberCard.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, phone: true, nickname: true, photo: true } } },
    })
    // 照片有效性由服务端判定，后台不再尝试渲染历史脏数据
    return cards.map((card) => ({
      ...card,
      user: card.user
        ? { ...card.user, photoValid: isValidImageDataUrl(card.user.photo) }
        : null,
    }))
  }
}
