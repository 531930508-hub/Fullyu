import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../common/errors';
import { brandMemberConfig, type BrandMemberConfig } from './brand-member.config';

/**
 * 品牌会员 CRM 客户端（X-Fy 契约，见 CRM docs/brand-member-api-v1.md）。
 *
 * - 签名：timestamp\nnonce\nMETHOD\n完整路径（含 /api 与查询串）\nsha256hex(rawBody)；
 * - 业务键由 CRM 侧密钥绑定，本项目固定 teahour；
 * - 会员身份只传登录顾客的本地 id，不传手机号或会员号；
 * - CRM 是卡期、价格、积分、骰子的唯一账本：失败必须显式报错，不回退本地合成数据。
 */

export const BRAND_BUSINESS = 'teahour';

export type BrandCardView = {
  cardId?: string;
  state: string;
  productCode?: string;
  productName?: string;
  priceCents?: number;
  validFrom?: string;
  validUntil?: string;
  remainingDays?: number;
  soldBy?: string;
  soldByName?: string;
};

export type BrandNotice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  /** 门店名；空串表示全部门店。 */
  store?: string;
  /** 黑板报封面图；空串表示只显示文字纸条。 */
  coverUrl?: string;
  /** 展示截止日 YYYY-MM-DD，过期后 CRM 不再下发。 */
  expireAt?: string | null;
  publishedAt?: string | null;
};

export type BrandMemberPayload = {
  member: { memberNo: string; name: string; phoneMasked: string | null };
  card: BrandCardView;
  pendingCard?: BrandCardView;
  points: {
    balance: number;
    expiring: number;
    expireAt: string | null;
    spend: Record<string, string>;
  };
  dice: {
    balance: number;
    station: number;
    monthlyEarned: number;
    /** 距下一颗骰子的进度与消费建议（金额阈值由 CRM 配置）。 */
    progress?: BrandDiceProgress | null;
  };
  prizes: { pending: number };
  savedCents: number;
  /** 到期前续费提醒：只在 EXPIRING 时 show=true，文案含本期已省金额。 */
  renewal?: { show: boolean; savedCents: number; remainingDays: number | null; text: string } | null;
  /** 会员公告/黑板报：仅有效会员下发，置顶优先，最多 20 条。 */
  notices?: BrandNotice[];
  /** 年卡实物礼的提货券：任一门店核销一次。 */
  vouchers?: BrandVoucher[];
  perks?: Record<string, unknown>;
  benefits: Array<{ business: string; title: string; desc: string }>;
  businessCards: unknown[];
  game: { enabled: boolean; dice: number; url: string | null };
  updatedAt: string;
  stale: boolean;
};

export type BrandProduct = {
  code: string;
  name: string;
  priceCents: number;
  validDays: number;
  benefits: Array<{ business: string; title: string; desc: string }>;
  pointsSpend: Record<string, string>;
  gameEnabled: boolean;
};

export type BrandQuote = {
  quoteId: string;
  productCode: string;
  priceCents: number;
  validDays: number;
  expiresAt: string;
};

export type BrandGameTicket = { ticket: string; url: string; expiresAt: string };

export type BrandDiceProgress = {
  perDieCents: number;
  progressCents: number;
  remainingCents: number;
  percent: number;
  headline: string;
  tip: { business: string; external: string; title: string; text: string };
};

export type BrandVoucher = {
  code: string;
  title: string;
  desc?: string;
  valueCents?: number;
  status: string;
  issuedAt?: string;
  redeemedAt?: string | null;
  redeemedStore?: string | null;
};

export type BrandStory = {
  id: string;
  title: string;
  quote?: string | null;
  quoteBy?: string | null;
  story: string;
  business?: string | null;
  publishedAt?: string | null;
};

export type BrandOrderReport = {
  orderRef: string;
  paidCents: number;
  savedCents?: number;
  occurredAt: string;
};

export type BrandOrderRefund = {
  orderRef: string;
  /** 累计退款金额（不是本次增量）；CRM 按累计值幂等。 */
  refundCents: number;
  occurredAt: string;
};

/** CRM 返回、且顾客能据此行动的错误：保留 CRM 文案直接透出。 */
const PASSTHROUGH_CODES: Record<string, number> = {
  GIFT_CODE_INVALID: 404,
  GIFT_CODE_PAUSED: 409,
  GIFT_CODE_EXPIRED: 409,
  GIFT_CODE_FULL: 409,
  MEMBERS_ONLY: 403,
  FEEDBACK_RATE_LIMIT: 429,
  REFUND_NOT_ALLOWED: 409,
  BAD_REQUEST: 400
};

export type BrandIssueResult = {
  card: BrandCardView & { orderRef?: string; paidCents?: number };
  replayed?: boolean;
};

export type BrandIssueInput = {
  quoteId: string;
  orderRef: string;
  paidCents: number;
  paidAt: string;
  idempotencyKey?: string;
};

export class BrandResponseError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown
  ) {
    super(`品牌会员 CRM 返回 ${status}`);
    this.name = 'BrandResponseError';
  }
}

export const signBrandRequest = (
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  path: string,
  rawBody: string
): string => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash}`, 'utf8')
    .digest('hex');
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

@Injectable()
export class BrandMemberClient {
  private readonly logger = new Logger('BrandMemberClient');
  private readonly config: BrandMemberConfig | null;

  constructor() {
    this.config = brandMemberConfig();
  }

  get enabled(): boolean {
    return this.config !== null;
  }

  async me(localUserId: string): Promise<BrandMemberPayload> {
    const query = new URLSearchParams({ business: BRAND_BUSINESS, localUserId });
    try {
      const body = await this.request<BrandMemberPayload>(
        'GET',
        `/api/v1/brand-member/me?${query.toString()}`
      );
      return this.normalizeMember(body);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async products(): Promise<{ products: BrandProduct[] }> {
    try {
      const body = await this.request<{ products?: unknown }>(
        'GET',
        '/api/v1/brand-member/products'
      );
      if (!Array.isArray(body?.products)) {
        throw new ApiError(503, '会员卡目录暂时不可用，请稍后重试', {
          code: 'BRAND_MEMBER_UNAVAILABLE'
        });
      }
      return { products: body.products as BrandProduct[] };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** 报价只传产品编码；金额、版本与有效期全部由 CRM 决定。 */
  async quote(localUserId: string, productCode: string): Promise<BrandQuote> {
    try {
      const body = await this.request<BrandQuote>('POST', '/api/v1/brand-member/quote', {
        business: BRAND_BUSINESS,
        localUserId,
        productCode
      });
      if (!body || typeof body.quoteId !== 'string' || !Number.isFinite(body.priceCents)) {
        throw new ApiError(503, '会员卡报价异常，请稍后重试', {
          code: 'BRAND_MEMBER_UNAVAILABLE'
        });
      }
      return body;
    } catch (error) {
      throw this.mapError(error);
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
          paidAt: input.paidAt
        },
        input.idempotencyKey
      );
      if (!body || !body.card || typeof body.card.state !== 'string') {
        throw new ApiError(503, '开卡结果异常，请联系客服核对', {
          code: 'BRAND_MEMBER_UNAVAILABLE'
        });
      }
      return body;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async gameTicket(localUserId: string): Promise<BrandGameTicket> {
    try {
      const body = await this.request<BrandGameTicket>(
        'POST',
        '/api/v1/brand-member/game/ticket',
        { business: BRAND_BUSINESS, localUserId }
      );
      if (!body || typeof body.ticket !== 'string' || typeof body.url !== 'string') {
        throw new ApiError(503, '愈行之旅暂时不可用，请稍后重试', {
          code: 'BRAND_MEMBER_UNAVAILABLE'
        });
      }
      return body;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** 会员码兑换：码由顾客输入，身份固定为当前登录顾客；CRM 按「同人同码」幂等。 */
  async claimGift(localUserId: string, code: string) {
    try {
      const body = await this.request<{ card?: BrandCardView; days?: number; replayed?: boolean }>(
        'POST',
        '/api/v1/brand-member/gift/claim',
        { localUserId, code }
      );
      if (!body || !body.card || typeof body.card.state !== 'string') {
        throw new ApiError(503, '兑换结果异常，请稍后在会员页核对', {
          code: 'BRAND_MEMBER_UNAVAILABLE'
        });
      }
      return { card: body.card, days: Number(body.days) || 0, replayed: Boolean(body.replayed) };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async submitFeedback(localUserId: string, content: string, allowQuote: boolean) {
    try {
      const body = await this.request<{ id?: string }>('POST', '/api/v1/brand-member/feedback', {
        localUserId,
        content,
        allowQuote
      });
      return { ok: true, id: typeof body?.id === 'string' ? body.id : null };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** 会员故事：仅有效会员可读，由 CRM 判定。 */
  async stories(localUserId: string): Promise<{ stories: BrandStory[] }> {
    const query = new URLSearchParams({ localUserId });
    try {
      const body = await this.request<{ stories?: unknown }>(
        'GET',
        `/api/v1/brand-member/stories?${query.toString()}`
      );
      return { stories: Array.isArray(body?.stories) ? (body.stories as BrandStory[]) : [] };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * 订单上报与累计退款：只由服务端后台任务调用，不经过顾客入口。
   * 这里抛出原始 BrandResponseError / ApiError，由调用方决定退避与重试，
   * 不在客户端吞掉失败。
   */
  async reportOrder(localUserId: string, order: BrandOrderReport) {
    return this.request<{ replayed?: boolean }>(
      'POST',
      '/api/v1/brand-member/orders/report',
      { localUserId, ...order },
      `teahour:order:${order.orderRef}`
    );
  }

  async refundOrder(localUserId: string, refund: BrandOrderRefund) {
    return this.request<{ replayed?: boolean; order?: { full?: boolean } }>(
      'POST',
      '/api/v1/brand-member/orders/refund',
      { localUserId, ...refund },
      `teahour:refund:${refund.orderRef}:${refund.refundCents}`
    );
  }

  private normalizeMember(body: BrandMemberPayload): BrandMemberPayload {
    const card = asRecord(body?.card);
    const points = asRecord(body?.points);
    if (
      !body ||
      typeof body.member?.memberNo !== 'string' ||
      typeof card.state !== 'string' ||
      !Number.isFinite(points.balance)
    ) {
      throw new ApiError(503, '会员服务返回数据异常，请稍后重试', {
        code: 'BRAND_MEMBER_UNAVAILABLE'
      });
    }
    return body;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const config = this.config;
    if (!config) {
      throw new ApiError(503, '品牌会员服务尚未开启', { code: 'BRAND_MEMBER_DISABLED' });
    }

    const rawBody = payload === undefined ? '' : JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString('hex');
    const signature = signBrandRequest(config.secret, timestamp, nonce, method, path, rawBody);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    let response: Response;
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
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {})
        },
        body: rawBody || undefined,
        signal: controller.signal
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError' ? '超时' : '网络异常';
      this.logger.warn(`品牌会员 CRM ${reason}：${method} ${path}`);
      throw new ApiError(503, '会员服务暂时不可用，请稍后重试', {
        code: 'BRAND_MEMBER_UNAVAILABLE'
      });
    } finally {
      clearTimeout(timer);
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      this.logger.warn(`品牌会员 CRM 响应读取失败：${method} ${path}`);
      throw new ApiError(503, '会员服务暂时不可用，请稍后重试', {
        code: 'BRAND_MEMBER_UNAVAILABLE'
      });
    }
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text.slice(0, 200);
      }
    }
    if (!response.ok) throw new BrandResponseError(response.status, body);
    return body as T;
  }

  /**
   * 只透出顾客可理解、可行动的几种情况；签名、配置与内部错误统一按服务不可用处理，
   * 并记录状态码便于运维定位，不把 CRM 内部堆栈或密钥相关信息带给顾客。
   */
  private mapError(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (error instanceof BrandResponseError) {
      const payload = asRecord(error.payload);
      const code = typeof payload.error === 'string' ? payload.error : '';
      if (code === 'MEMBER_NOT_FOUND') {
        return new ApiError(404, '你的会员档案正在同步，请稍后重试', { code });
      }
      if (code === 'GAME_UNAVAILABLE') {
        return new ApiError(403, '开通有效 Full愈卡后才能进入愈行之旅', { code });
      }
      if (code === 'PRODUCT_NOT_FOUND') {
        return new ApiError(404, '该会员卡暂不可售，请稍后重试', { code });
      }
      if (code === 'QUOTE_EXPIRED') {
        return new ApiError(409, '报价已失效，请重新发起支付', { code });
      }
      if (code === 'AMOUNT_MISMATCH') {
        return new ApiError(409, '支付金额与报价不一致，请重新支付', { code });
      }
      if (code in PASSTHROUGH_CODES) {
        const message =
          typeof payload.message === 'string' && payload.message.trim()
            ? payload.message.trim().slice(0, 120)
            : '操作未完成，请稍后重试';
        return new ApiError(PASSTHROUGH_CODES[code], message, { code });
      }
      this.logger.warn(`品牌会员 CRM 调用失败：HTTP ${error.status} ${code || ''}`.trim());
      return new ApiError(503, '会员服务暂时不可用，请稍后重试', {
        code: 'BRAND_MEMBER_UNAVAILABLE'
      });
    }
    this.logger.warn(`品牌会员 CRM 调用失败：${error instanceof Error ? error.message : '未知错误'}`);
    return new ApiError(503, '会员服务暂时不可用，请稍后重试', {
      code: 'BRAND_MEMBER_UNAVAILABLE'
    });
  }
}
