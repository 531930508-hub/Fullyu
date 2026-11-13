import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { BrandCardOrder } from '@prisma/client';
import type { PaymentState } from '@teahour/integrations';
import { ApiError, badRequest, conflict, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { logAction } from '../common/logs';
import { PrismaService } from '../common/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { HardwareService } from '../hardware/hardware.module';
import { BrandMemberClient } from './brand-member.client';

/**
 * 会员卡（Full愈年卡/月卡）自助购卡：下单 → JSAPI 预下单 → 验签回调落账 → CRM 开卡。
 *
 * 与茶饮订单的区别，也是这里的全部设计前提：
 * - 商品与价格不来自本地菜单，只来自 CRM 服务端报价（quoteId + priceCents），客户端传价一律忽略；
 * - 没有库存、没有出品，因此建单不占用任何本地资源，只有钱到账才产生财务分录；
 * - 卡期与权益以 CRM 为唯一账本：本地只记「钱有没有到」（payStatus）与「卡开没开」（issueStatus）；
 * - 钱到了但开卡没确认（issueStatus=unknown）**自动重试到开成为止**，不留人工对账：
 *   开卡请求带稳定 orderRef + 幂等键，CRM 按单号去重并回放同一张卡，
 *   所以重放既不会重复扣费，也不会重复延长卡期。只有「CRM 明确拒绝」（4xx 契约错误）
 *   和「CRM 调价导致实付与新报价不符」才停下来留痕，这两种情况重试再多也没用。
 */

/** 品牌卡没有门店，沿用零售/总部的 pseudo-store 约定，子商户号由服务商主商户号兜底。 */
export const BRAND_CARD_STORE_ID = 'brand';
/** 商户单号前缀：回调只能按它找回会员卡单，不会与茶饮/零售订单号混淆。 */
export const BRAND_CARD_ORDER_PREFIX = 'MB';
const brandCardOrderId = () => newId(BRAND_CARD_ORDER_PREFIX);
/** 未支付单的复用窗口：超时后重新建单，避免复用渠道侧已过期的预下单。 */
const PENDING_REUSE_MS = 30 * 60_000;
/** 轮询收敛时的渠道查询节流，避免小程序轮询把查询接口打满。 */
const QUERY_THROTTLE_MS = 2_500;
/**
 * 开卡失败后的重试节奏：先密后疏（5s→15s→1m→3m→10m），之后固定 30 分钟一次，直到开成为止。
 * 第一次退避压在 5 秒，是为了让顾客自己那次轮询（约 10 秒）就大概率等到结果。
 */
const ISSUE_RETRY_MS = [5_000, 15_000, 60_000, 3 * 60_000, 10 * 60_000];
const ISSUE_RETRY_MAX_MS = 30 * 60_000;
/** CRM 明确拒绝（4xx 契约错误）重试无益：隔 6 小时再看一眼，避免天天刷同一张失败的卡。 */
const ISSUE_REJECTED_RETRY_MS = 6 * 60 * 60_000;
/** 后台巡检间隔与批量：覆盖回调丢了、进程重启、顾客不再打开页面的单。 */
const ISSUE_SWEEP_MS = 60_000;
const ISSUE_SWEEP_BATCH = 20;

export type BrandCardOrderView = {
  id: string;
  productCode: string;
  productName: string;
  amountCents: number;
  /** pending | paid | failed | closed */
  payStatus: string;
  /** idle | issued | unknown */
  issueStatus: string;
  /** 开卡已试次数与下次重试时间（毫秒时间戳）；unknown 且到了时间会被自动重开。 */
  issueAttempts: number;
  issueNextRetryAt: number | null;
  providerRef: string | null;
  paidAt: number | null;
  cardState: string | null;
  cardValidFrom: number | null;
  cardValidUntil: number | null;
  failReason: string | null;
  issueError: string | null;
  createdAt: number;
};

export function isBrandCardOrderRef(reference: string | undefined | null): boolean {
  return typeof reference === 'string' && reference.startsWith(`${BRAND_CARD_ORDER_PREFIX}-`);
}

export function mapBrandCardOrder(row: BrandCardOrder): BrandCardOrderView {
  return {
    id: row.id,
    productCode: row.productCode,
    productName: row.productName,
    amountCents: row.amountCents,
    payStatus: row.payStatus,
    issueStatus: row.issueStatus,
    issueAttempts: row.issueAttempts,
    issueNextRetryAt: row.issueNextAt ? row.issueNextAt.getTime() : null,
    providerRef: row.providerRef,
    paidAt: row.paidAt ? row.paidAt.getTime() : null,
    cardState: row.cardState,
    cardValidFrom: row.cardValidFrom ? row.cardValidFrom.getTime() : null,
    cardValidUntil: row.cardValidUntil ? row.cardValidUntil.getTime() : null,
    failReason: row.failReason,
    issueError: row.issueError,
    createdAt: row.createdAt.getTime()
  };
}

/** CRM 的 paidAt 用北京时间落库，带 +08:00 偏移，避免 CRM 侧按 UTC 解读成前一天。 */
function shanghaiIso(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+08:00`;
}

function parseIso(value: string | undefined | null): Date | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time) : null;
}

@Injectable()
export class BrandCardPaymentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BrandCardPayment');
  private readonly lastQueryAt = new Map<string, number>();
  /** 同一张单只允许一个开卡请求在飞：回调、渠道查询、顾客轮询、后台巡检可能同时到。 */
  private readonly issuing = new Set<string>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly brand: BrandMemberClient,
    private readonly hardware: HardwareService,
    private readonly finance: FinanceService
  ) {}

  /** 后台巡检：钱已到、卡没开的单，到点就自动重开，不依赖顾客回来看页面或员工手动对账。 */
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' || !this.brand.enabled) return;
    void this.sweepIssues().catch((error) => {
      this.logger.warn(`会员卡开卡巡检启动失败: ${error instanceof Error ? error.message : String(error)}`);
    });
    this.sweepTimer = setInterval(() => {
      void this.sweepIssues().catch((error) => {
        this.logger.warn(`会员卡开卡巡检失败: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, ISSUE_SWEEP_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  /**
   * 顾客确认购卡：服务端重新向 CRM 报价（客户端只给 productCode），
   * 再按报价金额与当前登录顾客的 openId 预下单，返回 wx.requestPayment 参数。
   */
  async purchase(input: {
    customerId: string;
    productCode: string;
    clientIp?: string;
  }): Promise<{
    order: BrandCardOrderView;
    payment?: { timeStamp: string; nonceStr: string; package: string; signType: 'RSA' | 'MD5'; paySign: string };
    mode: string;
    prepayMode: string;
  }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, name: true, openId: true }
    });
    if (!customer) throw notFound('顾客不存在');
    // TX-01：渠道身份只读当前顾客已绑定的 openId，不接受客户端传入。
    if (!customer.openId) throw badRequest('请先使用微信登录后再购买会员卡');

    const quote = await this.brand.quote(customer.id, input.productCode);
    const amountCents = Math.round(quote.priceCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new ApiError(503, '会员卡报价异常，请稍后重试', { code: 'BRAND_MEMBER_UNAVAILABLE' });
    }
    const quoteExpiresAt = parseIso(quote.expiresAt);

    const gateway = this.hardware.payment;
    // 异步渠道（汇付）才有真实扣款；mock 渠道只返回模拟参数，订单会一直停在待支付，绝不假装开卡。
    const live = Boolean(gateway.asyncPayments && gateway.prepay);

    const order = await this.reusablePendingOrder(customer.id, quote.productCode, amountCents);
    const target =
      order ||
      (await this.prisma.brandCardOrder.create({
        data: {
          id: brandCardOrderId(),
          customerId: customer.id,
          productCode: quote.productCode,
          productName: await this.productName(quote.productCode),
          amountCents,
          storeId: BRAND_CARD_STORE_ID,
          quoteId: quote.quoteId,
          quoteExpiresAt,
          payStatus: 'pending',
          issueStatus: 'idle',
          payMethod: 'wechat',
          createdAt: new Date()
        }
      }));

    const common = {
      openId: customer.openId,
      orderId: target.id,
      orderNumber: target.id,
      amountCents: target.amountCents,
      description: `时叙 ${target.productName || '会员卡'}`,
      storeId: BRAND_CARD_STORE_ID,
      clientIp: input.clientIp
    };

    try {
      if (live) {
        const result = await gateway.prepay!(common);
        if (!result.ok || !result.payment) throw new Error(result.error || '支付参数获取失败');
        const updated = await this.prisma.brandCardOrder.update({
          where: { id: target.id },
          data: { prepayAt: new Date() }
        });
        return { order: mapBrandCardOrder(updated), payment: result.payment, mode: gateway.mode, prepayMode: 'live' };
      }
      const result = await this.hardware.wechat.prepay(common);
      if (!result.ok || !result.payment) throw new Error(result.error || '支付参数获取失败');
      const updated = await this.prisma.brandCardOrder.update({
        where: { id: target.id },
        data: { prepayAt: new Date() }
      });
      return {
        order: mapBrandCardOrder(updated),
        payment: result.payment,
        mode: this.hardware.wechat.mode,
        prepayMode: this.hardware.wechat.prepayMode || this.hardware.wechat.mode
      };
    } catch (error) {
      // 预下单失败就是没发起支付：本单作废（closed），钱一分没扣，顾客可直接重试。
      const message = error instanceof Error ? error.message : String(error);
      const closed = await this.prisma.brandCardOrder.update({
        where: { id: target.id },
        data: { payStatus: 'closed', failReason: message }
      });
      await logAction(this.prisma, {
        actorName: customer.name,
        action: '会员卡预下单失败',
        detail: `${closed.id} · ${closed.productName || closed.productCode} · ${message}`,
        type: 'member-card',
        storeId: BRAND_CARD_STORE_ID,
        orderId: closed.id
      });
      throw badRequest(message);
    }
  }

  /**
   * 未支付单复用：同一顾客同一产品同金额、且报价未过期，就继续用原单。
   * 重复点击「立即开通」不会产生多张待付单，也不会在渠道侧重复下单。
   */
  private async reusablePendingOrder(
    customerId: string,
    productCode: string,
    amountCents: number
  ): Promise<BrandCardOrder | null> {
    const candidate = await this.prisma.brandCardOrder.findFirst({
      where: { customerId, payStatus: 'pending' },
      orderBy: { createdAt: 'desc' }
    });
    if (!candidate) return null;
    const now = Date.now();
    const fresh = now - candidate.createdAt.getTime() < PENDING_REUSE_MS;
    const quoteUsable = !candidate.quoteExpiresAt || candidate.quoteExpiresAt.getTime() > now + 60_000;
    const sameDeal = candidate.productCode === productCode && candidate.amountCents === amountCents;
    if (fresh && quoteUsable && sameDeal) return candidate;
    // 价格或时长变了（CRM 调价/换产品）：旧单作废，按新报价建单。
    await this.prisma.brandCardOrder.update({
      where: { id: candidate.id },
      data: { payStatus: 'closed', failReason: '顾客重新发起购卡，旧单作废' }
    });
    return null;
  }

  /** 产品名只用于描述与后台留痕；CRM 目录不可用时退化为产品编码，不影响下单。 */
  private async productName(productCode: string): Promise<string> {
    try {
      const { products } = await this.brand.products();
      const hit = products.find((item) => item.code === productCode);
      return hit?.name || productCode;
    } catch {
      return productCode;
    }
  }

  async latestOrder(customerId: string): Promise<BrandCardOrderView | null> {
    const row = await this.prisma.brandCardOrder.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' }
    });
    if (!row) return null;
    return this.converge(row);
  }

  async getOrder(customerId: string, orderId: string): Promise<BrandCardOrderView> {
    const row = await this.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    if (!row || row.customerId !== customerId) throw notFound('会员卡订单不存在');
    return this.converge(row);
  }

  /**
   * 顾客读到这张单时顺手把它往前推一步：
   * - 待支付：向渠道查一次，覆盖「回调还没到」的窗口期；
   * - 已支付但开卡未确认：到点就重开一次，让那次轮询直接把卡拿回来。
   * 两件事各自节流/退避，顾客怎么刷都不会把渠道或 CRM 打穿。
   */
  private async converge(row: BrandCardOrder): Promise<BrandCardOrderView> {
    if (row.payStatus === 'pending' && row.prepayAt) return this.reconcileWithGateway(row);
    if (row.payStatus === 'paid' && row.issueStatus === 'unknown' && this.issueDue(row)) {
      await this.attemptIssue(row.id, row.paidAt || new Date());
      const fresh = await this.prisma.brandCardOrder.findUnique({ where: { id: row.id } });
      return mapBrandCardOrder(fresh || row);
    }
    return mapBrandCardOrder(row);
  }

  /** 到了下次重试时间（issueNextAt 为空视为可立刻重试）。 */
  private issueDue(row: BrandCardOrder, now = Date.now()): boolean {
    return !row.issueNextAt || row.issueNextAt.getTime() <= now;
  }

  /** 主动查询渠道：与回调走同一套落账逻辑，保证「先回调 or 先查询」结果一致。 */
  private async reconcileWithGateway(row: BrandCardOrder): Promise<BrandCardOrderView> {
    const gateway = this.hardware.payment;
    if (!gateway.asyncPayments || !gateway.query) return mapBrandCardOrder(row);
    const last = this.lastQueryAt.get(row.id) || 0;
    if (Date.now() - last < QUERY_THROTTLE_MS) return mapBrandCardOrder(row);
    this.lastQueryAt.set(row.id, Date.now());
    try {
      const result = await gateway.query({
        orderId: row.id,
        storeId: row.storeId,
        method: 'wechat',
        requestedAt: row.createdAt.getTime()
      });
      if (result.status === 'paid') {
        await this.settle({
          reference: row.id,
          providerRef: result.providerRef,
          amountCents: row.amountCents,
          status: 'paid',
          paidAt: result.paidAt
        });
      } else if (result.status === 'failed' || result.status === 'closed') {
        await this.settle({ reference: row.id, status: result.status, error: result.error });
      }
    } catch (error) {
      // 查询失败不改变本地状态：保持待支付，由顾客重试或回调收敛。
      this.logger.warn(`会员卡支付查询失败 ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const fresh = await this.prisma.brandCardOrder.findUnique({ where: { id: row.id } });
    return mapBrandCardOrder(fresh || row);
  }

  /**
   * 渠道回调落账。只接受 MB- 前缀的单号（由 hooks 控制器分流进来）。
   *
   * 落账顺序：金额/商户校验 → 事务内标记已支付并写财务分录 → 事务外调 CRM 开卡。
   * 开卡必须在事务外：CRM 慢或挂掉不能让「已收款」回滚，钱和卡的状态各自留痕。
   */
  async settle(input: {
    reference: string;
    providerRef?: string;
    amountCents?: number;
    merchantId?: string;
    status: PaymentState;
    error?: string;
    paidAt?: number;
  }): Promise<'applied' | 'duplicate' | 'failed' | 'ignored'> {
    const order = await this.prisma.brandCardOrder.findUnique({ where: { id: input.reference } });
    if (!order) {
      await logAction(this.prisma, {
        actorName: '支付网关',
        action: '会员卡回调找不到订单',
        detail: `${input.reference} · 已忽略，请核对该笔支付来源`,
        type: 'member-card'
      });
      return 'ignored';
    }
    await this.assertCallbackMatches(order, input);

    if (input.status === 'paid') {
      const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
      const providerRef = input.providerRef || `HF-${order.id}`;
      const applied = await this.prisma.$transaction(async (tx) => {
        // 条件更新做幂等锚点：并发的回调/查询只有一个能把非 paid 改成 paid。
        // 已关闭的单也允许改判：渠道说收到钱就是收到了，「关闭」只是本地记录顾客放弃，
        // 迟到的回调必须照样记账、照样开卡，否则就是收了钱不给卡。
        const claimed = await tx.brandCardOrder.updateMany({
          where: { id: order.id, payStatus: { not: 'paid' } },
          data: { payStatus: 'paid', paidAt, providerRef, payMethod: 'wechat', failReason: null }
        });
        if (claimed.count === 0) return false;
        if (order.payStatus === 'closed') {
          await logAction(tx, {
            actorName: '支付网关',
            action: '会员卡迟到回调改判',
            detail: `${order.id} · 本地已关闭但渠道确认收到款，按已支付落账并开卡`,
            type: 'member-card',
            storeId: BRAND_CARD_STORE_ID,
            orderId: order.id,
            at: paidAt.getTime()
          });
        }
        await this.finance.addEntry(
          {
            // 会员卡单不是 orders 行，财务分录的 orderId 留空（外键指向 orders），
            // 用 memo + dedupeKey 关联回 MB- 单号，报表仍按 brand 归集收入。
            orderId: null,
            storeId: BRAND_CARD_STORE_ID,
            type: 'SALE',
            amountCents: order.amountCents,
            method: '微信支付',
            settlement: 'settled',
            memo: `会员卡 ${order.productName || order.productCode} ${order.id}`,
            dedupeKey: `brand-card:${order.id}`,
            at: paidAt.getTime()
          },
          tx
        );
        await logAction(tx, {
          actorName: '支付网关',
          action: '会员卡支付到账',
          detail: `${order.id} · ${order.productName || order.productCode} · ¥${(order.amountCents / 100).toFixed(2)}`,
          type: 'member-card',
          storeId: BRAND_CARD_STORE_ID,
          orderId: order.id,
          at: paidAt.getTime()
        });
        return true;
      });
      if (!applied) return 'duplicate';
      // 开卡失败不拖累落账：钱已经记了，卡由重试队列接着开。
      await this.attemptIssue(order.id, paidAt);
      return 'applied';
    }

    if (input.status === 'failed' || input.status === 'closed') {
      const claimed = await this.prisma.brandCardOrder.updateMany({
        where: { id: order.id, payStatus: 'pending' },
        data: { payStatus: 'failed', failReason: input.error || '渠道返回支付失败' }
      });
      return claimed.count > 0 ? 'failed' : 'duplicate';
    }
    return 'ignored';
  }

  /**
   * 开卡一次：成功落 issued；失败落 unknown 并排在 issueNextAt 自动重开。
   *
   * 为什么重试是安全的：CRM 侧幂等键是稳定的（orderRef + MB-ISSUE-<单号>），
   * 重复请求只会回放同一张卡，既不会重复收款，也不会把卡期续两遍。
   * 因此这里的重试是「重复请求同一次开卡」，不是「再卖一张卡」。
   */
  private async attemptIssue(orderId: string, paidAt: Date): Promise<boolean> {
    if (this.issuing.has(orderId)) return false;
    this.issuing.add(orderId);
    try {
      const order = await this.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
      if (!order || order.payStatus !== 'paid') return false;
      if (order.issueStatus === 'issued') return true;
      const quoteId = await this.issueQuote(order);
      const result = await this.brand.issue({
        quoteId,
        orderRef: order.id,
        paidCents: order.amountCents,
        // 用落账时记下的付款时间：重试也要让 CRM 按真实付款时间算权益起始。
        paidAt: shanghaiIso(order.paidAt || paidAt),
        idempotencyKey: `${BRAND_CARD_ORDER_PREFIX}-ISSUE-${order.id}`
      });
      const card = result.card;
      await this.prisma.brandCardOrder.update({
        where: { id: order.id },
        data: {
          issueStatus: 'issued',
          crmCardId: card.cardId || null,
          cardState: card.state,
          cardValidFrom: parseIso(card.validFrom),
          cardValidUntil: parseIso(card.validUntil),
          issueError: null,
          issueNextAt: null
        }
      });
      // 本地会籍快照立即过期，让下一次 /me 直接取到新卡（否则最多滞后 5 分钟）。
      await this.prisma.customer.update({
        where: { id: order.customerId },
        data: { memberSyncedAt: null }
      });
      await logAction(this.prisma, {
        actorName: 'CRM',
        action: '会员卡开卡成功',
        detail: `${order.id} · ${order.productName || order.productCode} · 卡状态 ${card.state}${
          order.issueAttempts > 0 ? ` · 第 ${order.issueAttempts + 1} 次尝试` : ''
        }`,
        type: 'member-card',
        storeId: BRAND_CARD_STORE_ID,
        orderId: order.id
      });
      return true;
    } catch (error) {
      await this.markIssueFailure(orderId, error);
      return false;
    } finally {
      this.issuing.delete(orderId);
    }
  }

  /**
   * 开卡用的报价：没过期就原样用；过期了重新向 CRM 报价。
   * 只有价格与实付完全一致才继续开卡 —— 不一致就是真的对不上账，重试再多也开不出卡。
   */
  private async issueQuote(order: BrandCardOrder): Promise<string> {
    const expiresAt = order.quoteExpiresAt;
    if (!expiresAt || expiresAt.getTime() > Date.now() + 60_000) return order.quoteId;
    const quote = await this.brand.quote(order.customerId, order.productCode);
    const priceCents = Math.round(quote.priceCents);
    if (priceCents !== order.amountCents) {
      throw new ApiError(
        409,
        `CRM 现价 ¥${(priceCents / 100).toFixed(2)} 与实付 ¥${(order.amountCents / 100).toFixed(2)} 不一致，需退款或补差`,
        { code: 'AMOUNT_MISMATCH' }
      );
    }
    await this.prisma.brandCardOrder.update({
      where: { id: order.id },
      data: { quoteId: quote.quoteId, quoteExpiresAt: parseIso(quote.expiresAt) }
    });
    await logAction(this.prisma, {
      actorName: 'CRM',
      action: '会员卡开卡重新报价',
      detail: `${order.id} · 原报价已过期，按现价 ¥${(priceCents / 100).toFixed(2)} 重新报价后开卡`,
      type: 'member-card',
      storeId: BRAND_CARD_STORE_ID,
      orderId: order.id
    });
    return quote.quoteId;
  }

  /** 开卡失败：钱已经到账，先把状态如实落成 unknown，再排下一次自动重开。 */
  private async markIssueFailure(orderId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const row = await this.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    if (!row || row.issueStatus === 'issued') return;
    const attempts = row.issueAttempts + 1;
    const delayMs = this.issueRetryDelay(error, attempts);
    const quoteExpired = error instanceof ApiError && error.code === 'QUOTE_EXPIRED';
    await this.prisma.brandCardOrder.update({
      where: { id: orderId },
      data: {
        issueStatus: 'unknown',
        issueError: message.slice(0, 500),
        issueAttempts: attempts,
        issueNextAt: new Date(Date.now() + delayMs),
        // 报价被 CRM 判失效：把本地报价标成已过期，下一轮先重新报价再开卡，
        // 否则会拿着同一个失效 quoteId 一直重试，永远开不出来。
        ...(quoteExpired ? { quoteExpiresAt: new Date(0) } : {})
      }
    });
    const retryHint = `${Math.round(delayMs / 1000)} 秒后自动重试`;
    await logAction(this.prisma, {
      actorName: 'CRM',
      action: '会员卡已付款但开卡未确认',
      detail: `${row.id} · ${row.productName || row.productCode} · ¥${(row.amountCents / 100).toFixed(2)} · 第 ${attempts} 次开卡未确认 · ${message} · ${retryHint}`,
      type: 'member-card',
      storeId: BRAND_CARD_STORE_ID,
      orderId: row.id
    });
    this.logger.warn(`会员卡开卡未确认（第 ${attempts} 次），${retryHint} ${row.id}: ${message}`);
  }

  /**
   * 重试间隔：网络/5xx/超时按「先密后疏」重试到开成为止；
   * CRM 明确拒绝（4xx 契约错误）隔 6 小时再看一眼 —— 那种情况重试再密也没用。
   * 报价失效例外：先连续重报几次（CRM 刚过期、时钟差这类能自愈），
   * 连续三轮还不行就当死单，退到 6 小时等人工处理，避免每分钟空转。
   */
  private issueRetryDelay(error: unknown, attempts: number): number {
    if (error instanceof ApiError) {
      if (error.code === 'QUOTE_EXPIRED') {
        if (attempts > 3) return ISSUE_REJECTED_RETRY_MS;
        return ISSUE_RETRY_MS[Math.min(attempts - 1, ISSUE_RETRY_MS.length - 1)];
      }
      if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 408 && error.statusCode !== 429) {
        return ISSUE_REJECTED_RETRY_MS;
      }
    }
    return ISSUE_RETRY_MS[Math.min(attempts - 1, ISSUE_RETRY_MS.length - 1)] ?? ISSUE_RETRY_MAX_MS;
  }

  /**
   * 后台巡检：把「已付款、卡没开、到了重试时间」的单捡出来重开。
   * 覆盖回调丢失、进程重启、顾客付完就关掉小程序这几种情况 —— 不需要员工去后台对账。
   */
  async sweepIssues(now: Date = new Date()): Promise<{ attempted: number; issued: number }> {
    const rows = await this.prisma.brandCardOrder.findMany({
      where: {
        payStatus: 'paid',
        issueStatus: 'unknown',
        OR: [{ issueNextAt: null }, { issueNextAt: { lte: now } }]
      },
      orderBy: { issueNextAt: 'asc' },
      take: ISSUE_SWEEP_BATCH
    });
    let attempted = 0;
    let issued = 0;
    for (const row of rows) {
      if (this.issuing.has(row.id)) continue;
      attempted += 1;
      if (await this.attemptIssue(row.id, row.paidAt || now)) issued += 1;
    }
    if (rows.length > 0) {
      this.logger.log(`会员卡开卡巡检：待到账重开 ${rows.length} 张，本轮开成 ${issued} 张`);
    }
    return { attempted, issued };
  }

  /** 回调业务校验：金额与子商户号。任一不符拒绝落账并留痕，宁可人工核对。 */
  private async assertCallbackMatches(
    order: BrandCardOrder,
    input: { amountCents?: number; merchantId?: string }
  ): Promise<void> {
    if (input.amountCents != null && input.amountCents !== order.amountCents) {
      await logAction(this.prisma, {
        actorName: '支付网关',
        action: '会员卡回调金额不一致拦截',
        detail: `${order.id} · 应收 ¥${(order.amountCents / 100).toFixed(2)}，回调 ¥${(input.amountCents / 100).toFixed(2)}，未落账`,
        type: 'member-card',
        storeId: BRAND_CARD_STORE_ID,
        orderId: order.id
      });
      throw badRequest('回调金额与会员卡订单不一致，已拒绝落账，请人工核对');
    }
    const expected = this.hardware.payment.merchantFor?.(order.storeId) || '';
    if (input.merchantId && expected && input.merchantId !== expected) {
      await logAction(this.prisma, {
        actorName: '支付网关',
        action: '会员卡回调子商户不一致拦截',
        detail: `${order.id} · 应为 ${expected}，回调 ${input.merchantId}，未落账`,
        type: 'member-card',
        storeId: BRAND_CARD_STORE_ID,
        orderId: order.id
      });
      throw badRequest('回调子商户与会员卡收款商户不一致，已拒绝落账，请人工核对');
    }
  }

  /**
   * 顾客放弃：关闭待支付单，未扣款。
   * 关闭不是终态——若顾客其实付了钱、回调只是迟到，settle 会把单改判为已支付并开卡。
   */
  async closePending(customerId: string, orderId: string): Promise<BrandCardOrderView> {
    const row = await this.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    if (!row || row.customerId !== customerId) throw notFound('会员卡订单不存在');
    if (row.payStatus === 'paid') throw conflict('订单已支付，不能关闭');
    const updated = await this.prisma.brandCardOrder.update({
      where: { id: row.id },
      data: { payStatus: 'closed', failReason: row.failReason || '顾客放弃支付' }
    });
    return mapBrandCardOrder(updated);
  }
}