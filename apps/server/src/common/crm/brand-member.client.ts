import { createHash, createHmac, randomBytes } from 'node:crypto'
import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BusinessException } from '../exceptions/business.exception'
import {
  brandMemberConfigFrom,
  type BrandCrmConfig,
} from './brand-member.config'

/**
 * 品牌会员 CRM 客户端（X-Fy 契约，见 CRM docs/brand-member-api-v1.md）。
 *
 * - 签名：timestamp\nnonce\nMETHOD\n完整路径（含 /api 与查询串）\nsha256hex(rawBody)；
 * - 业务键由 CRM 侧密钥绑定，本项目固定 presence；
 * - 会员身份只传登录用户的本地 id，不传手机号或会员号；
 * - CRM 是品牌卡期、价格、积分、骰子的唯一账本：失败必须显式报错，不回退合成数据。
 */

export const BRAND_BUSINESS = 'presence'

export type BrandCardView = {
  cardId?: string
  state: string
  productCode?: string
  productName?: string
  priceCents?: number
  validFrom?: string
  validUntil?: string
  remainingDays?: number
  soldBy?: string
  soldByName?: string
}

export type BrandMemberPayload = {
  member: { memberNo: string; name: string; phoneMasked: string | null }
  card: BrandCardView
  pendingCard?: BrandCardView
  points: {
    balance: number
    expiring: number
    expireAt: string | null
    spend: Record<string, string>
  }
  dice: {
    balance: number
    station: number
    monthlyEarned: number
    /** 距下一颗骰子的进度与跨业态消费建议（金额阈值由 CRM 配置）。 */
    progress?: BrandDiceProgress | null
  }
  prizes: { pending: number }
  savedCents: number
  /** 到期前续费提醒：只在 EXPIRING 时 show=true，文案含本期已省金额。 */
  renewal?: { show: boolean; savedCents: number; remainingDays: number | null; text: string } | null
  /** 年卡实物礼的提货券：任一门店核销一次。 */
  vouchers?: BrandVoucher[]
  /** 品牌会员在各业态的结构化权益；在场只读 presence 段。 */
  perks?: { presence?: Partial<BrandPresencePerks> } & Record<string, unknown>
  benefits: Array<{ business: string; title: string; desc: string }>
  businessCards: unknown[]
  game: { enabled: boolean; dice?: number; url: string | null }
  updatedAt: string
  stale: boolean
}

export type BrandProduct = {
  code: string
  name: string
  priceCents: number
  validDays: number
  benefits: Array<{ business: string; title: string; desc: string }>
  pointsSpend: Record<string, string>
  gameEnabled: boolean
}

export type BrandQuote = {
  quoteId: string
  productCode: string
  priceCents: number
  validDays: number
  expiresAt: string
}

export type BrandGameTicket = { ticket: string; url: string; expiresAt: string }

export type BrandPresencePerks = {
  /** 候补优先排位（原挂在畅练卡上，2026-11-08 会议改挂品牌会员） */
  prioritySeat: boolean
  /** 会员价（时段折扣 / 课程会员折扣，原挂在畅练卡上） */
  tierPrice: boolean
  /** 每月可邀请好友免费体验次数 */
  invitesPerMonth: number
}

export type BrandDiceProgress = {
  perDieCents: number
  progressCents: number
  remainingCents: number
  percent: number
  headline: string
  tip: { business: string; external: string; title: string; text: string }
}

export type BrandVoucher = {
  code: string
  title: string
  desc?: string
  valueCents?: number
  status: string
  issuedAt?: string
  redeemedAt?: string | null
  redeemedStore?: string | null
}

export type BrandStory = {
  id: string
  title: string
  quote?: string | null
  quoteBy?: string | null
  story: string
  business?: string | null
  publishedAt?: string | null
}

export type BrandOrderReport = {
  orderRef: string
  paidCents: number
  savedCents?: number
  occurredAt: string
}

export type BrandOrderRefund = {
  orderRef: string
  /** 累计退款金额（不是本次增量）；CRM 按累计值幂等。 */
  refundCents: number
  occurredAt: string
}

export type BrandPassBundle = {
  /** 本地畅练卡 id；续期/改期时同一 passRef 重报，CRM 按 passRef 幂等 */
  passRef: string
  /** 上海日期 YYYY-MM-DD，首尾含 */
  validFrom: string
  validUntil: string
}

export type BrandInviteList = {
  monthKey: string
  quota: number
  used: number
  remaining: number
  invites: Array<{
    code: string
    status: string
    claimed: boolean
    createdAt: string
    claimedAt: string | null
  }>
}

export type BrandInviteCreated = {
  code: string
  monthKey: string
  quota: number
  used: number
  remaining: number
  expiresAt: string
}

export type BrandInviteClaim = {
  claimed: boolean
  replayed: boolean
  voucher: { kind: string; title: string; issuer: string }
}

/**
 * CRM 返回、且顾客能据此行动的错误：保留 CRM 文案直接透出。
 * 值为 [业务码, HTTP 状态]。
 */
const PASSTHROUGH_CODES: Record<string, [number, HttpStatus]> = {
  GIFT_CODE_INVALID: [4043, HttpStatus.NOT_FOUND],
  GIFT_CODE_PAUSED: [4093, HttpStatus.CONFLICT],
  GIFT_CODE_EXPIRED: [4094, HttpStatus.CONFLICT],
  GIFT_CODE_FULL: [4095, HttpStatus.CONFLICT],
  MEMBERS_ONLY: [4037, HttpStatus.FORBIDDEN],
  FEEDBACK_RATE_LIMIT: [4291, HttpStatus.TOO_MANY_REQUESTS],
  REFUND_NOT_ALLOWED: [4096, HttpStatus.CONFLICT],
  INVITE_INVALID: [4044, HttpStatus.NOT_FOUND],
  INVITE_USED: [4097, HttpStatus.CONFLICT],
  INVITE_SELF: [4098, HttpStatus.CONFLICT],
  INVITE_EXPIRED: [4099, HttpStatus.CONFLICT],
  INVITE_ALREADY_CLAIMED: [4100, HttpStatus.CONFLICT],
  INVITE_QUOTA_EXCEEDED: [4101, HttpStatus.CONFLICT],
  BAD_REQUEST: [4002, HttpStatus.BAD_REQUEST],
}

export type BrandIssueResult = {
  card: BrandCardView & { orderRef?: string; paidCents?: number }
  replayed?: boolean
}

export type BrandIssueInput = {
  quoteId: string
  orderRef: string
  paidCents: number
  paidAt: string
  idempotencyKey?: string
}

export class BrandResponseError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`品牌会员 CRM 返回 ${status}`)
    this.name = 'BrandResponseError'
  }
}

export const signBrandRequest = (
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  path: string,
  rawBody: string,
): string => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex')
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash}`, 'utf8')
    .digest('hex')
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const unavailable = () =>
  new BusinessException(
    '会员服务暂时不可用，请稍后重试',
    5030,
    HttpStatus.SERVICE_UNAVAILABLE,
  )

const disabled = () =>
  new BusinessException('品牌会员服务尚未开启', 5031, HttpStatus.SERVICE_UNAVAILABLE)

@Injectable()
export class BrandMemberClient {
  private readonly logger = new Logger('BrandMemberClient')
  private readonly config: BrandCrmConfig | null

  constructor(config: ConfigService) {
    // 配置错误直接拒绝启动：不允许「看似开启、实际不可用」。
    this.config = brandMemberConfigFrom(config)
  }

  get enabled(): boolean {
    return this.config !== null
  }

  async me(localUserId: string): Promise<BrandMemberPayload> {
    const query = new URLSearchParams({ business: BRAND_BUSINESS, localUserId })
    try {
      const body = await this.request<BrandMemberPayload>(
        'GET',
        `/api/v1/brand-member/me?${query.toString()}`,
      )
      return this.normalizeMember(body)
    } catch (error) {
      throw this.mapError(error)
    }
  }

  async products(): Promise<{ products: BrandProduct[] }> {
    try {
      const body = await this.request<{ products?: unknown }>(
        'GET',
        '/api/v1/brand-member/products',
      )
      if (!Array.isArray(body?.products)) throw unavailable()
      return { products: body.products as BrandProduct[] }
    } catch (error) {
      throw this.mapError(error)
    }
  }

  /** 报价只传产品编码；金额、版本与有效期全部由 CRM 决定。 */
  async quote(localUserId: string, productCode: string): Promise<BrandQuote> {
    try {
      const body = await this.request<BrandQuote>('POST', '/api/v1/brand-member/quote', {
        business: BRAND_BUSINESS,
        localUserId,
        productCode,
      })
      if (!body || typeof body.quoteId !== 'string' || !Number.isFinite(body.priceCents)) {
        throw unavailable()
      }
      return body
    } catch (error) {
      throw this.mapError(error)
    }
  }

  /**
   * 支付成功后开卡。只能由本服务端在验签回调后调用；
   * 顾客端没有直接调用入口，避免未付款就开卡。
   */
  async issue(input: BrandIssueInput): Promise<BrandIssueResult> {
    try {
      const body = await this.request<BrandIssueResult>(
        'POST',
        '/api/v1/brand-member/issue',
        {
          quoteId: input.quoteId,
          orderRef: input.orderRef,
          paidCents: input.paidCents,
          paidAt: input.paidAt,
        },
        input.idempotencyKey,
      )
      if (!body || !body.card || typeof body.card.state !== 'string') throw unavailable()
      return body
    } catch (error) {
      throw this.mapError(error)
    }
  }

  async gameTicket(localUserId: string): Promise<BrandGameTicket> {
    try {
      const body = await this.request<BrandGameTicket>(
        'POST',
        '/api/v1/brand-member/game/ticket',
        { business: BRAND_BUSINESS, localUserId },
      )
      if (!body || typeof body.ticket !== 'string' || typeof body.url !== 'string') {
        throw unavailable()
      }
      return body
    } catch (error) {
      throw this.mapError(error)
    }
  }

  /** 会员码兑换：码由顾客输入，身份固定为当前登录顾客；CRM 按「同人同码」幂等。 */
  async claimGift(localUserId: string, code: string) {
    try {
      const body = await this.request<{ card?: BrandCardView; days?: number; replayed?: boolean }>(
        'POST',
        '/api/v1/brand-member/gift/claim',
        { localUserId, code },
      )
      if (!body || !body.card || typeof body.card.state !== 'string') {
        throw new BusinessException('兑换结果异常，请稍后在会员页核对', 5030, HttpStatus.SERVICE_UNAVAILABLE)
      }
      return { card: body.card, days: Number(body.days) || 0, replayed: Boolean(body.replayed) }
    } catch (error) {
      throw this.mapError(error)
    }
  }

  async submitFeedback(localUserId: string, content: string, allowQuote: boolean) {
    try {
      const body = await this.request<{ id?: string }>('POST', '/api/v1/brand-member/feedback', {
        localUserId,
        content,
        allowQuote,
      })
      return { ok: true, id: typeof body?.id === 'string' ? body.id : null }
    } catch (error) {
      throw this.mapError(error)
    }
  }

  /** 会员故事：仅有效会员可读，由 CRM 判定。 */
  async stories(localUserId: string): Promise<{ stories: BrandStory[] }> {
    const query = new URLSearchParams({ localUserId })
    try {
      const body = await this.request<{ stories?: unknown }>(
        'GET',
        `/api/v1/brand-member/stories?${query.toString()}`,
      )
      return { stories: Array.isArray(body?.stories) ? (body.stories as BrandStory[]) : [] }
    } catch (error) {
      throw this.mapError(error)
    }
  }

  async invites(localUserId: string): Promise<BrandInviteList> {
    const query = new URLSearchParams({ localUserId })
    try {
      const body = await this.request<BrandInviteList>(
        'GET',
        `/api/v1/brand-member/invites?${query.toString()}`,
      )
      if (!body || !Number.isFinite(body.quota) || !Array.isArray(body.invites)) throw unavailable()
      return body
    } catch (error) {
      throw this.mapError(error)
    }
  }

  async createInvite(localUserId: string): Promise<BrandInviteCreated> {
    try {
      const body = await this.request<BrandInviteCreated>(
        'POST',
        '/api/v1/brand-member/invites/create',
        { localUserId },
      )
      if (!body || typeof body.code !== 'string') throw unavailable()
      return body
    } catch (error) {
      throw this.mapError(error)
    }
  }

  /** 好友领取邀请：CRM 只记关系与归因，体验课券由在场本地发放。 */
  async claimInvite(localUserId: string, code: string): Promise<BrandInviteClaim> {
    try {
      const body = await this.request<BrandInviteClaim>(
        'POST',
        '/api/v1/brand-member/invites/claim',
        { localUserId, code },
      )
      if (!body || body.claimed !== true) throw unavailable()
      return { claimed: true, replayed: Boolean(body.replayed), voucher: body.voucher }
    } catch (error) {
      throw this.mapError(error)
    }
  }

  /**
   * 以下为后台同步任务专用：抛出原始 BrandResponseError / BusinessException，
   * 由调用方决定退避与重试，不在客户端吞掉失败；顾客入口不得调用。
   */
  async reportOrder(localUserId: string, order: BrandOrderReport) {
    return this.request<{ replayed?: boolean }>(
      'POST',
      '/api/v1/brand-member/orders/report',
      { localUserId, ...order },
      `presence:order:${order.orderRef}`,
    )
  }

  async refundOrder(localUserId: string, refund: BrandOrderRefund) {
    return this.request<{ replayed?: boolean; order?: { full?: boolean } }>(
      'POST',
      '/api/v1/brand-member/orders/refund',
      { localUserId, ...refund },
      `presence:refund:${refund.orderRef}:${refund.refundCents}`,
    )
  }

  /**
   * 畅练卡有效期内附赠同期品牌会员（CRM 侧 FY_BUNDLE 卡）。
   * CRM 按 passRef 幂等：同日期重放、改日期即更新、撤销后可再次附赠，
   * 所以这里不带 Idempotency-Key，避免「撤销→重新附赠→再撤销」被旧响应重放。
   */
  async bundlePass(localUserId: string, pass: BrandPassBundle) {
    return this.request<{ card?: BrandCardView; replayed?: boolean }>(
      'POST',
      '/api/v1/brand-member/bundle',
      { localUserId, ...pass },
    )
  }

  async revokeBundle(localUserId: string, passRef: string, reason?: string) {
    return this.request<{ card?: BrandCardView; replayed?: boolean }>(
      'POST',
      '/api/v1/brand-member/bundle/revoke',
      { localUserId, passRef, ...(reason ? { reason } : {}) },
    )
  }

  private normalizeMember(body: BrandMemberPayload): BrandMemberPayload {
    const card = asRecord(body?.card)
    const points = asRecord(body?.points)
    if (
      !body ||
      typeof body.member?.memberNo !== 'string' ||
      typeof card.state !== 'string' ||
      !Number.isFinite(points.balance)
    ) {
      throw unavailable()
    }
    return body
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const config = this.config
    if (!config) throw disabled()

    const rawBody = payload === undefined ? '' : JSON.stringify(payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = randomBytes(16).toString('hex')
    const signature = signBrandRequest(config.secret, timestamp, nonce, method, path, rawBody)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    let response: Response
    try {
      response = await fetch(`${config.baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          'x-fy-key': config.keyId,
          'x-fy-timestamp': timestamp,
          'x-fy-nonce': nonce,
          'x-fy-signature': signature,
          ...(rawBody ? { 'content-type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        body: rawBody || undefined,
        signal: controller.signal,
      })
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError' ? '超时' : '网络异常'
      this.logger.warn(`品牌会员 CRM ${reason}：${method} ${path}`)
      throw unavailable()
    } finally {
      clearTimeout(timer)
    }

    let text: string
    try {
      text = await response.text()
    } catch {
      this.logger.warn(`品牌会员 CRM 响应读取失败：${method} ${path}`)
      throw unavailable()
    }
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text.slice(0, 200)
      }
    }
    if (!response.ok) throw new BrandResponseError(response.status, body)
    return body as T
  }

  /**
   * 只透出顾客可理解、可行动的几种情况；签名、配置与内部错误统一按服务不可用处理，
   * 并记录状态码便于运维定位，不把 CRM 内部堆栈或密钥相关信息带给顾客。
   */
  private mapError(error: unknown): BusinessException {
    if (error instanceof BusinessException) return error
    if (error instanceof BrandResponseError) {
      const payload = asRecord(error.payload)
      const code = typeof payload.error === 'string' ? payload.error : ''
      if (code === 'MEMBER_NOT_FOUND') {
        return new BusinessException(
          '你的会员档案正在同步，请稍后重试',
          4041,
          HttpStatus.NOT_FOUND,
        )
      }
      if (code === 'GAME_UNAVAILABLE') {
        return new BusinessException(
          '开通有效 Full愈卡后才能进入愈行之旅',
          4036,
          HttpStatus.FORBIDDEN,
        )
      }
      if (code === 'PRODUCT_NOT_FOUND') {
        return new BusinessException('该会员卡暂不可售，请稍后重试', 4042, HttpStatus.NOT_FOUND)
      }
      if (code === 'QUOTE_EXPIRED') {
        return new BusinessException('报价已失效，请重新发起支付', 4091, HttpStatus.CONFLICT)
      }
      if (code === 'AMOUNT_MISMATCH') {
        return new BusinessException('支付金额与报价不一致，请重新支付', 4092, HttpStatus.CONFLICT)
      }
      const passthrough = PASSTHROUGH_CODES[code]
      if (passthrough) {
        const message =
          typeof payload.message === 'string' && payload.message.trim()
            ? payload.message.trim().slice(0, 120)
            : '操作未完成，请稍后重试'
        return new BusinessException(message, passthrough[0], passthrough[1])
      }
      this.logger.warn(`品牌会员 CRM 调用失败：HTTP ${error.status} ${code || ''}`.trim())
      return unavailable()
    }
    this.logger.warn(
      `品牌会员 CRM 调用失败：${error instanceof Error ? error.message : '未知错误'}`,
    )
    return unavailable()
  }
}
