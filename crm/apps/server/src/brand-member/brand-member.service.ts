import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  BUSINESS_EXTERNAL,
  POINTS_SPEND_MODES,
  businessName,
  fromExternalBusiness,
  toExternalBusiness,
  type Business,
  type PointsSpendMode
} from '@fullyu/crm-shared';
import type {
  BrandCardProduct,
  BrandCardVersion,
  Member,
  MemberBrandCard
} from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { maskPhone } from '../common/phone';
import { GameService } from '../game/game.service';
import { audit } from '../common/audit';
import { ApiError, badRequest, conflict } from '../common/errors';
import { newId } from '../common/ids';
import { runIdempotent } from '../common/idempotency';
import type { BrandMemberContext } from './brand-member.guard';
import {
  issuePickupVouchers,
  perksOf,
  refundQuote,
  savedForCard,
  voucherView,
  yuan
} from '../program/program.rules';

const TZ_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 86400000;
const QUOTE_TTL_MS = 30 * 60 * 1000;
const TICKET_TTL_MS = 5 * 60 * 1000;
const LOCAL_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const PRODUCT_CODE = /^FY_[A-Z0-9_]{2,30}$/;
const ORDER_REF = /^[A-Za-z0-9._:-]{1,80}$/;

export type MeQuery = { business?: string; localUserId?: string };
export type QuoteInput = { business?: string; localUserId?: string; productCode?: string };
export type IssueInput = {
  quoteId?: string;
  orderRef?: string;
  paidCents?: number;
  paidAt?: string;
};
export type RefundInput = {
  orderRef?: string;
  cardId?: string;
  refundCents?: number;
  refundType?: string;
  reason?: string;
  refundedAt?: string;
};
export type TicketInput = { business?: string; localUserId?: string };

type BenefitRow = { business: string; title: string; desc: string };

const shanghaiDayStart = (at: Date): Date => {
  const local = new Date(at.getTime() + TZ_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_MS
  );
};

const addDays = (at: Date, days: number): Date => new Date(at.getTime() + days * DAY_MS);

const formatDate = (at: Date): string =>
  new Date(at.getTime() + TZ_MS).toISOString().slice(0, 10);

const formatIso = (at: Date): string => {
  const local = new Date(at.getTime() + TZ_MS);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}+08:00`
  );
};

const remainingDays = (validUntil: Date, now: Date): number => {
  const end = shanghaiDayStart(validUntil).getTime() + DAY_MS - 1;
  return Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS));
};

const effectiveState = (card: MemberBrandCard, now: Date): string => {
  if (card.state === 'REFUNDED' || card.state === 'REFUND_LOCKED') return card.state;
  const today = shanghaiDayStart(now);
  if (shanghaiDayStart(card.validFrom) > today) return 'PENDING';
  if (shanghaiDayStart(card.validUntil) < today) return 'EXPIRED';
  return remainingDays(card.validUntil, now) <= 30 ? 'EXPIRING' : 'ACTIVE';
};

const readJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw || 'null');
  } catch {
    return null;
  }
};

const benefitsOf = (raw: string): BenefitRow[] => {
  const parsed = readJson(raw);
  if (!Array.isArray(parsed)) return [];
  const rows: BenefitRow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const business = toExternalBusiness(String(row.business || ''));
    if (!business || typeof row.title !== 'string' || !row.title.trim()) continue;
    rows.push({
      business,
      title: row.title.trim(),
      desc: typeof row.desc === 'string' ? row.desc.trim() : ''
    });
  }
  return rows;
};

const spendOf = (raw: string): Record<string, PointsSpendMode> => {
  const parsed = readJson(raw);
  const source = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const result: Record<string, PointsSpendMode> = {};
  for (const [internal, external] of Object.entries(BUSINESS_EXTERNAL)) {
    const value = String(source[internal] || '');
    result[external] = (POINTS_SPEND_MODES as readonly string[]).includes(value)
      ? (value as PointsSpendMode)
      : 'display_only';
  }
  return result;
};

const parseBody = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

const requireText = (value: unknown, field: string, max = 100): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw badRequest(`缺少 ${field}`);
  if (text.length > max) throw badRequest(`${field} 过长`);
  return text;
};

/**
 * 三端品牌会员契约 v1：
 * - 会员身份用「本业务本地用户 id」定位，不接受手机号/会员号，避免 PII 进入 URL 与日志；
 * - 卡期与权益在开卡时按产品版本快照，后续改价/改权益不影响已购；
 * - 续费接在当前卡期结束后一天，未生效期间返回 PENDING；
 * - CRM 不接管在场畅练卡与轻疗历史卡的卡期，1C 的 businessCards 保持空数组，待 1F 快照接入。
 */
@Injectable()
export class BrandMemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly jwt: JwtService
  ) {}

  async me(query: MeQuery, ctx: BrandMemberContext) {
    const input = parseBody(query);
    const business = this.businessOf(input.business, ctx);
    const member = await this.findMember(input.localUserId, ctx);
    const now = new Date();

    const cards = await this.prisma.memberBrandCard.findMany({
      where: { memberId: member.id, state: { not: 'REFUNDED' } },
      orderBy: { validUntil: 'desc' }
    });
    const views = cards.map((card) => ({ card, view: this.cardView(card, now) }));
    const active = views.find(
      (item) => item.view.state === 'ACTIVE' || item.view.state === 'EXPIRING'
    );
    const pending = views.find((item) => item.view.state === 'PENDING');
    const locked = views.find((item) => item.view.state === 'REFUND_LOCKED');
    const expired = views.find((item) => item.view.state === 'EXPIRED');
    const primary = active || locked || pending || expired;
    const card = primary ? primary.view : { state: 'NONE' };
    const pendingCard = active && pending ? pending.view : undefined;

    const batches = await this.prisma.pointBatch.findMany({
      where: {
        memberId: member.id,
        status: 'ACTIVE',
        remaining: { gt: 0 },
        expireAt: { gt: now }
      },
      orderBy: { expireAt: 'asc' }
    });
    const balance = batches.reduce((sum, batch) => sum + batch.remaining, 0);
    const soon = now.getTime() + 30 * DAY_MS;
    const expiring = batches
      .filter((batch) => batch.expireAt.getTime() <= soon)
      .reduce((sum, batch) => sum + batch.remaining, 0);

    const gameState = await this.game.summaryForMember(member.id);
    const gameEligible = Boolean(active && active.card.gameEnabled);
    let gameUrl: string | null = null;
    if (gameEligible) {
      const base = (process.env.CRM_GAME_URL || '').trim();
      if (base) {
        const ticket = await this.issueTicket(member.id, business, ctx.keyId, now);
        gameUrl = ticket.url;
      }
    }

    // 节省金额 = 当前生效卡期内三端订单上报的会员优惠合计；用于续费提醒与退款试算。
    const savedCents = active ? await savedForCard(this.prisma, active.card.id) : 0;
    const vouchers = active
      ? await this.prisma.pickupVoucher.findMany({
          where: { cardId: active.card.id },
          orderBy: { issuedAt: 'asc' }
        })
      : [];
    const showRenewal = Boolean(active && active.view.state === 'EXPIRING' && !pendingCard);
    // 公告表存对外业务键（teahour / retreat / presence），这里要把内部键转成对外键再匹配。
    const externalBusiness = toExternalBusiness(business) || business;
    const notices = active
      ? await this.prisma.memberNotice.findMany({
          where: {
            status: 'PUBLISHED',
            business: { in: [externalBusiness, 'all'] },
            publishedAt: { lte: now },
            OR: [{ expireAt: null }, { expireAt: { gte: now } }]
          },
          orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
          // 黑板报首屏取 3 条，其余由会员手动展开，因此这里多带一些。
          take: 20
        })
      : [];
    const renewal = showRenewal
      ? {
          show: true,
          savedCents,
          remainingDays: active!.view.remainingDays,
          text:
            savedCents > 0
              ? `这张卡已经帮你省下 ¥${yuan(savedCents)}，还有 ${active!.view.remainingDays} 天到期，续上就不断档`
              : `还有 ${active!.view.remainingDays} 天到期，续上就不断档`
        }
      : { show: false };

    const body: Record<string, unknown> = {
      member: {
        memberNo: member.memberNo,
        name: member.name,
        phoneMasked: maskPhone(member.phone)
      },
      card,
      points: {
        balance,
        expiring,
        expireAt: batches[0] ? formatDate(batches[0].expireAt) : null,
        spend: spendOf(active ? active.card.pointsSpendJson : '{}')
      },
      dice: {
        balance: gameState.balance,
        station: gameState.station,
        monthlyEarned: gameState.monthlyEarned,
        progress: gameState.progress
      },
      prizes: { pending: gameState.pendingPrizes },
      savedCents,
      renewal,
      benefits: active ? benefitsOf(active.card.benefitsJson) : [],
      perks: perksOf(active ? active.card.perksJson : '{}'),
      vouchers: vouchers.map(voucherView),
      notices: notices.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        pinned: row.pinned,
        store: row.store,
        coverUrl: row.coverUrl,
        expireAt: row.expireAt ? formatDate(row.expireAt) : null,
        publishedAt: row.publishedAt ? formatDate(row.publishedAt) : null
      })),
      businessCards: [],
      game: {
        enabled: gameEligible,
        dice: gameState.balance,
        url: gameUrl
      },
      updatedAt: formatIso(now),
      stale: false
    };
    if (pendingCard) body.pendingCard = pendingCard;
    return body;
  }

  async products() {
    const products = await this.prisma.brandCardProduct.findMany({
      where: { status: 'ACTIVE', currentVersion: { not: null } },
      orderBy: [{ sort: 'asc' }, { code: 'asc' }]
    });
    const rows = [];
    for (const product of products) {
      if (!product.currentVersion) continue;
      const version = await this.prisma.brandCardVersion.findUnique({
        where: {
          productCode_version: { productCode: product.code, version: product.currentVersion }
        }
      });
      if (!version || version.status !== 'ACTIVE') continue;
      rows.push({
        code: product.code,
        name: product.name,
        priceCents: version.priceCents,
        validDays: version.validDays,
        benefits: benefitsOf(version.benefitsJson),
        pointsSpend: spendOf(version.pointsSpendJson),
        gameEnabled: version.gameEnabled
      });
    }
    return { products: rows };
  }

  async quote(body: QuoteInput, ctx: BrandMemberContext) {
    const input = parseBody(body);
    const business = this.businessOf(input.business, ctx);
    const member = await this.findMember(input.localUserId, ctx);
    const productCode = requireText(input.productCode, 'productCode', 40);
    if (!PRODUCT_CODE.test(productCode)) throw badRequest('productCode 格式不正确');

    const { version } = await this.activeVersion(productCode);
    const now = new Date();
    const quote = await this.prisma.brandCardQuote.create({
      data: {
        id: newId('BCQ'),
        business,
        keyId: ctx.keyId,
        memberId: member.id,
        productCode,
        version: version.version,
        priceCents: version.priceCents,
        validDays: version.validDays,
        benefitsJson: version.benefitsJson,
        gameEnabled: version.gameEnabled,
        expiresAt: new Date(now.getTime() + QUOTE_TTL_MS)
      }
    });
    return {
      quoteId: quote.id,
      productCode: quote.productCode,
      priceCents: quote.priceCents,
      validDays: quote.validDays,
      expiresAt: formatIso(quote.expiresAt)
    };
  }

  async issue(
    body: IssueInput,
    ctx: BrandMemberContext,
    idempotencyKey?: string | null
  ) {
    const input = parseBody(body);
    const quoteId = requireText(input.quoteId, 'quoteId', 100);
    const orderRef = requireText(input.orderRef, 'orderRef', 80);
    if (!ORDER_REF.test(orderRef)) throw badRequest('orderRef 只能包含字母、数字与 . _ : -');
    const paidCents = input.paidCents;
    if (!Number.isInteger(paidCents) || (paidCents as number) <= 0 || (paidCents as number) > 10_000_000) {
      throw badRequest('paidCents 必须是 1–10000000 的整数（分）');
    }
    const paidAt = this.parsePaidAt(input.paidAt);
    const now = new Date();
    const key =
      (idempotencyKey || '').trim() || `ext:${ctx.business}:brand-card:issue:${orderRef}`;

    const result = await runIdempotent(
      this.prisma,
      key,
      {
        business: ctx.business,
        quoteId,
        orderRef,
        paidCents,
        paidAt: paidAt.toISOString()
      },
      async () =>
        this.prisma.$transaction(async (tx) => {
          const quote = await tx.brandCardQuote.findUnique({ where: { id: quoteId } });
          if (!quote) {
            throw new ApiError(409, '报价不存在或已失效，请重新报价', { code: 'QUOTE_EXPIRED' });
          }
          if (quote.business !== ctx.business || quote.keyId !== ctx.keyId) {
            throw new ApiError(403, '报价不属于当前业务或密钥', { code: 'BUSINESS_MISMATCH' });
          }
          if (quote.priceCents !== paidCents) {
            throw new ApiError(409, `支付金额与报价不一致（应付 ${quote.priceCents} 分）`, {
              code: 'AMOUNT_MISMATCH',
              details: { expectedCents: quote.priceCents, paidCents }
            });
          }

          // orderRef 兜底：即使幂等记录丢失，同一订单也不重复开卡。
          const prior = await tx.memberBrandCard.findUnique({
            where: { soldBy_orderRef: { soldBy: ctx.business, orderRef } }
          });
          if (prior) {
            if (prior.memberId === quote.memberId && prior.paidCents === paidCents) {
              return { card: this.cardView(prior, now), replayed: true };
            }
            throw conflict('该订单号已用于另一位会员或不同金额', {
              code: 'IDEMPOTENCY_CONFLICT'
            });
          }

          if (quote.usedAt || quote.expiresAt.getTime() <= now.getTime()) {
            throw new ApiError(409, '报价已使用或已过期，请重新报价', { code: 'QUOTE_EXPIRED' });
          }
          const claimed = await tx.brandCardQuote.updateMany({
            where: { id: quoteId, usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now }
          });
          if (claimed.count !== 1) {
            throw new ApiError(409, '报价已使用或已过期，请重新报价', { code: 'QUOTE_EXPIRED' });
          }

          const paidDay = shanghaiDayStart(paidAt);
          let start = paidDay;
          const latest = await tx.memberBrandCard.findFirst({
            where: {
              memberId: quote.memberId,
              state: { in: ['ACTIVE', 'PENDING', 'REFUND_LOCKED'] },
              validUntil: { gte: start }
            },
            orderBy: { validUntil: 'desc' }
          });
          if (latest) start = addDays(shanghaiDayStart(latest.validUntil), 1);
          const validUntil = addDays(start, quote.validDays - 1);
          const product = await tx.brandCardProduct.findUnique({
            where: { code: quote.productCode }
          });
          const version = await tx.brandCardVersion.findUnique({
            where: {
              productCode_version: { productCode: quote.productCode, version: quote.version }
            }
          });
          const member = await tx.member.findUnique({ where: { id: quote.memberId } });
          if (!member || member.status !== 'ACTIVE') {
            throw new ApiError(404, '会员不存在或已停用，不能开卡', { code: 'MEMBER_NOT_FOUND' });
          }
          const card = await tx.memberBrandCard.create({
            data: {
              id: newId('MBC'),
              memberId: quote.memberId,
              productCode: quote.productCode,
              version: quote.version,
              productName: product?.name || quote.productCode,
              priceCents: quote.priceCents,
              validDays: quote.validDays,
              validFrom: start,
              validUntil,
              state: start > shanghaiDayStart(now) ? 'PENDING' : 'ACTIVE',
              benefitsJson: quote.benefitsJson,
              pointsSpendJson: version?.pointsSpendJson || '{}',
              perksJson: version?.perksJson || '{}',
              gameEnabled: quote.gameEnabled,
              source: 'PAID',
              soldBy: ctx.business,
              soldByName: businessName(ctx.business),
              orderRef,
              paidCents,
              paidAt
            }
          });
          await tx.brandCardQuote.update({
            where: { id: quoteId },
            data: { usedCardId: card.id }
          });
          // 年卡实物礼：按版本配置发提货券，任意门店人工核销一次。
          const vouchers = await issuePickupVouchers(tx, card, version?.giftsJson);
          await audit(tx, {
            actor: {
              id: `ext:${ctx.business}:${ctx.keyId}`,
              name: `${businessName(ctx.business)} 外部接口`
            },
            action: '外部开卡',
            target: member.memberNo,
            detail:
              `${card.productName} · ${orderRef} · ${paidCents} 分 · ${formatDate(start)} → ${formatDate(validUntil)}` +
              (vouchers.length ? ` · 提货券 ${vouchers.length} 张` : '')
          });

          // 开卡事件按会员已绑定的业务写入 outbox；未配置 webhook 的业务保持待投递。
          const payload = JSON.stringify({
            topic: 'brand_card.issued',
            cardId: card.id,
            memberNo: member.memberNo,
            productCode: card.productCode,
            productName: card.productName,
            state: card.state,
            validFrom: formatDate(start),
            validUntil: formatDate(validUntil),
            paidCents,
            soldBy: toExternalBusiness(ctx.business)
          });
          const identities = await tx.memberIdentity.findMany({
            where: { memberId: member.id }
          });
          for (const identity of identities) {
            await tx.outboxEvent.create({
              data: {
                id: newId('OB'),
                topic: 'brand_card.issued',
                business: identity.business,
                memberId: member.id,
                payloadJson: payload,
                nextAttemptAt: now
              }
            });
          }
          return {
            card: this.cardView(card, now),
            vouchers: vouchers.map(voucherView),
            replayed: false
          };
        })
    );
    return result;
  }

  /**
   * 业务端退卡：资金由业务端原路退回，CRM 只撤销卡期与权益。
   * 7 天内无理由退实付（扣除已领实物礼）；7 天后退「实付 − 已享优惠 − 已领实物礼」，
   * ≤0 时拒绝并返回挽留文案；协商退款只走 CRM 后台 force-refund。
   */
  async refund(body: RefundInput, ctx: BrandMemberContext, idempotencyKey?: string | null) {
    const input = parseBody(body);
    const orderRef = typeof input.orderRef === 'string' ? input.orderRef.trim() : '';
    const cardId = typeof input.cardId === 'string' ? input.cardId.trim() : '';
    if (orderRef && !ORDER_REF.test(orderRef)) {
      throw badRequest('orderRef 只能包含字母、数字与 . _ : -');
    }
    if (!orderRef && !cardId) throw badRequest('缺少 orderRef 或 cardId');
    const rawType = requireText(input.refundType, 'refundType', 20);
    if (!['WITHIN_7D', 'AFTER_7D', 'PRORATED'].includes(rawType)) {
      throw badRequest('refundType 只能是 WITHIN_7D 或 AFTER_7D');
    }
    // PRORATED 为旧契约别名，统一按「7 天后扣除已享优惠」规则处理。
    const refundType = rawType === 'PRORATED' ? 'AFTER_7D' : rawType;
    const refundCents = input.refundCents as number;
    if (!Number.isInteger(refundCents) || refundCents < 0 || refundCents > 10_000_000) {
      throw badRequest('refundCents 必须是 0–10000000 的整数（分）');
    }
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 200) : '';
    const refundedAt = this.parseEventAt(input.refundedAt, 'refundedAt');
    const now = new Date();
    const key =
      (idempotencyKey || '').trim() ||
      `ext:${ctx.business}:brand-card:refund:${orderRef || cardId}`;

    return runIdempotent(
      this.prisma,
      key,
      {
        business: ctx.business,
        orderRef: orderRef || undefined,
        cardId: cardId || undefined,
        refundCents,
        refundType,
        refundedAt: refundedAt.toISOString()
      },
      async () =>
        this.prisma.$transaction(async (tx) => {
          let card = orderRef
            ? await tx.memberBrandCard.findUnique({
                where: { soldBy_orderRef: { soldBy: ctx.business, orderRef } }
              })
            : null;
          if (!card && cardId) {
            card = await tx.memberBrandCard.findUnique({ where: { id: cardId } });
          }
          if (!card) {
            throw new ApiError(404, '未找到对应的品牌会员卡，请联系工作人员核对', {
              code: 'CARD_NOT_FOUND'
            });
          }
          if (card.soldBy !== ctx.business) {
            throw new ApiError(403, '该卡不属于当前业务', { code: 'BUSINESS_MISMATCH' });
          }
          if (orderRef && card.orderRef !== orderRef) {
            throw new ApiError(409, '卡与订单号不匹配', { code: 'IDEMPOTENCY_CONFLICT' });
          }
          if (card.state === 'REFUNDED') {
            const sameAmount = (card.refundCents ?? 0) === (refundCents as number);
            if (!sameAmount || (card.refundType || '') !== refundType) {
              throw new ApiError(409, '该卡已按其他金额退款', {
                code: 'IDEMPOTENCY_CONFLICT'
              });
            }
            return { card: this.cardView(card, now), refund: this.refundView(card), replayed: true };
          }
          if (card.state === 'REFUND_LOCKED') {
            throw new ApiError(409, '该会员卡当前不能撤销，请联系工作人员核对', {
              code: 'CARD_NOT_REFUNDABLE'
            });
          }
          if ((refundCents as number) > card.paidCents) {
            throw badRequest('退款金额不能超过实付金额');
          }
          // 金额由 CRM 规则决定：业务端先调 refund-quote，再按试算结果原路退款并回传。
          const quote = await refundQuote(tx, card, refundedAt);
          if (!quote.allowed) {
            throw new ApiError(409, quote.message, {
              code: quote.reasonCode || 'REFUND_NOT_ALLOWED',
              details: quote
            });
          }
          if (quote.refundType !== refundType || quote.refundableCents !== refundCents) {
            throw new ApiError(
              409,
              `退款金额与规则不一致：${quote.message}`,
              { code: 'REFUND_AMOUNT_MISMATCH', details: quote }
            );
          }
          const updated = await tx.memberBrandCard.update({
            where: { id: card.id },
            data: {
              state: 'REFUNDED',
              refundType,
              refundCents,
              refundedAt,
              refundReason: reason || null
            }
          });
          await tx.pickupVoucher.updateMany({
            where: { cardId: card.id, status: 'ISSUED' },
            data: { status: 'VOID', voidReason: '会员卡已退款' }
          });
          const member = await tx.member.findUnique({ where: { id: card.memberId } });
          if (!member) {
            throw new ApiError(404, '会员不存在', { code: 'MEMBER_NOT_FOUND' });
          }
          await audit(tx, {
            actor: {
              id: `ext:${ctx.business}:${ctx.keyId}`,
              name: `${businessName(ctx.business)} 外部接口`
            },
            action: '外部退卡',
            target: member.memberNo,
            detail: `${card.productName} · ${card.orderRef} · ${refundType} · 退 ${refundCents} 分（实付 ${card.paidCents} 分）${
              reason ? ` · ${reason}` : ''
            }`
          });

          const payload = JSON.stringify({
            topic: 'brand_card.refunded',
            cardId: card.id,
            memberNo: member.memberNo,
            productCode: card.productCode,
            productName: card.productName,
            orderRef: card.orderRef,
            state: 'REFUNDED',
            refundType,
            refundCents,
            paidCents: card.paidCents,
            soldBy: toExternalBusiness(ctx.business)
          });
          const identities = await tx.memberIdentity.findMany({
            where: { memberId: card.memberId }
          });
          for (const identity of identities) {
            await tx.outboxEvent.create({
              data: {
                id: newId('OB'),
                topic: 'brand_card.refunded',
                business: identity.business,
                memberId: card.memberId,
                payloadJson: payload,
                nextAttemptAt: now
              }
            });
          }
          return { card: this.cardView(updated, now), refund: this.refundView(updated), replayed: false };
        })
    );
  }

  /**
   * 游戏 H5 用一次性票据换取 2 小时短期会话。
   * 票据只在 URL 中出现一次，浏览器不再持有 X-Fy 密钥；会话只含该会员的游戏范围。
   */
  async exchangeGameTicket(ticketValue: unknown) {
    const raw = typeof ticketValue === 'string' ? ticketValue.trim() : '';
    if (raw.length < 20 || raw.length > 200) {
      throw new ApiError(401, '游戏票据无效或已过期，请回到会员页重新进入', {
        code: 'GAME_TICKET_INVALID'
      });
    }
    const tokenHash = createHash('sha256').update(raw, 'utf8').digest('hex');
    const now = new Date();
    const row = await this.prisma.gameTicket.findUnique({
      where: { tokenHash },
      include: { member: true }
    });
    if (!row || row.expiresAt.getTime() <= now.getTime()) {
      throw new ApiError(401, '游戏票据无效或已过期，请回到会员页重新进入', {
        code: 'GAME_TICKET_INVALID'
      });
    }
    if (row.member.status !== 'ACTIVE') {
      throw new ApiError(403, '该会员已停用，不能进入愈行之旅', { code: 'GAME_UNAVAILABLE' });
    }
    const business = row.business as Business;
    const active = await this.activeCard(row.member.id, now);
    if (!active || !active.gameEnabled) {
      throw new ApiError(403, '开通有效品牌卡后才能进入愈行之旅', {
        code: 'GAME_UNAVAILABLE'
      });
    }
    if (!row.usedAt) {
      // 只记录首次使用时间；票据到期前允许刷新重进，避免 H5 刷新后直接失效。
      await this.prisma.gameTicket.update({ where: { id: row.id }, data: { usedAt: now } });
    }
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const token = this.jwt.sign(
      {
        kind: 'game',
        sub: row.member.id,
        business: toExternalBusiness(business) || business,
        ticketId: row.id
      },
      { expiresIn: '2h' }
    );
    const batches = await this.prisma.pointBatch.findMany({
      where: {
        memberId: row.member.id,
        status: 'ACTIVE',
        remaining: { gt: 0 },
        expireAt: { gt: now }
      }
    });
    return {
      token,
      expiresAt: formatIso(expiresAt),
      session: await this.game.sessionForMember(row.member.id, business),
      points: { balance: batches.reduce((sum, batch) => sum + batch.remaining, 0) }
    };
  }

  async gameTicket(body: TicketInput, ctx: BrandMemberContext) {
    const input = parseBody(body);
    const business = this.businessOf(input.business, ctx);
    const member = await this.findMember(input.localUserId, ctx);
    const now = new Date();
    const active = await this.activeCard(member.id, now);
    if (!active || !active.gameEnabled) {
      throw new ApiError(403, '开通有效品牌卡后才能进入愈行之旅', {
        code: 'GAME_UNAVAILABLE'
      });
    }
    return this.issueTicket(member.id, business, ctx.keyId, now);
  }

  private async issueTicket(memberId: string, business: Business, keyId: string, now: Date) {
    const base = (process.env.CRM_GAME_URL || '').trim();
    if (!base) {
      throw new ApiError(503, '愈行之旅地址尚未配置', { code: 'GAME_UNAVAILABLE' });
    }
    const token = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
    const expiresAt = new Date(now.getTime() + TICKET_TTL_MS);
    await this.prisma.gameTicket.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.prisma.gameTicket.create({
      data: {
        id: newId('GT'),
        tokenHash,
        memberId,
        business,
        keyId,
        expiresAt
      }
    });
    const separator = base.includes('?') ? '&' : '?';
    const url =
      `${base}${separator}embed=1&host=${encodeURIComponent(toExternalBusiness(business) || business)}` +
      `&ticket=${encodeURIComponent(token)}`;
    return { ticket: token, url, expiresAt: formatIso(expiresAt) };
  }

  private async activeCard(memberId: string, now: Date) {
    return this.prisma.memberBrandCard.findFirst({
      where: {
        memberId,
        state: { in: ['ACTIVE', 'PENDING'] },
        validFrom: { lte: now },
        validUntil: { gte: shanghaiDayStart(now) }
      },
      orderBy: { validUntil: 'desc' }
    });
  }

  private async activeVersion(
    code: string
  ): Promise<{ product: BrandCardProduct; version: BrandCardVersion }> {
    const product = await this.prisma.brandCardProduct.findUnique({
      where: { code },
      include: { versions: true }
    });
    if (!product || product.status !== 'ACTIVE' || !product.currentVersion) {
      throw new ApiError(404, '产品不存在或未生效', { code: 'PRODUCT_NOT_FOUND' });
    }
    const version = product.versions.find(
      (item) => item.version === product.currentVersion && item.status === 'ACTIVE'
    );
    if (!version) {
      throw new ApiError(404, '产品当前版本不可售', { code: 'PRODUCT_NOT_FOUND' });
    }
    return { product, version };
  }

  private businessOf(value: unknown, ctx: BrandMemberContext): Business {
    const fallback = toExternalBusiness(ctx.business) || '';
    const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    const business = fromExternalBusiness(raw);
    if (!business) {
      throw badRequest('business 只能是 teahour / retreat / presence');
    }
    if (business !== ctx.business) {
      throw new ApiError(403, '该密钥不能访问其他业务的数据', { code: 'BUSINESS_MISMATCH' });
    }
    return business;
  }

  private async findMember(localUserId: unknown, ctx: BrandMemberContext): Promise<Member> {
    const id = requireText(localUserId, 'localUserId', 64);
    if (!LOCAL_ID.test(id)) throw badRequest('localUserId 只能包含字母、数字与 . _ : -');
    const identity = await this.prisma.memberIdentity.findUnique({
      where: {
        business_localUserId: { business: ctx.business, localUserId: id }
      },
      include: { member: true }
    });
    if (!identity || identity.member.status !== 'ACTIVE') {
      throw new ApiError(404, '该用户尚未同步到 CRM 或不是有效会员', {
        code: 'MEMBER_NOT_FOUND'
      });
    }
    return identity.member;
  }

  private parsePaidAt(value: unknown): Date {
    return this.parseEventAt(value, 'paidAt');
  }

  private parseEventAt(value: unknown, field: string): Date {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw badRequest(`缺少 ${field}`);
    const at = new Date(text);
    if (Number.isNaN(at.getTime())) throw badRequest(`${field} 不是合法时间`);
    if (at.getTime() > Date.now() + 5 * 60 * 1000) {
      throw badRequest(`${field} 不能晚于当前时间 5 分钟以上`);
    }
    return at;
  }

  private refundView(card: MemberBrandCard) {
    return {
      refundType: card.refundType,
      refundCents: card.refundCents ?? 0,
      refundedAt: card.refundedAt ? formatIso(card.refundedAt) : null,
      reason: card.refundReason
    };
  }

  private cardView(card: MemberBrandCard, now: Date) {
    const state = effectiveState(card, now);
    return {
      cardId: card.id,
      state,
      productCode: card.productCode,
      productName: card.productName,
      priceCents: card.priceCents,
      validFrom: formatDate(card.validFrom),
      validUntil: formatDate(card.validUntil),
      remainingDays:
        state === 'PENDING'
          ? Math.max(
              0,
              Math.ceil(
                (shanghaiDayStart(card.validFrom).getTime() - shanghaiDayStart(now).getTime()) /
                  DAY_MS
              )
            )
          : remainingDays(card.validUntil, now),
      soldBy: toExternalBusiness(card.soldBy) || card.soldBy,
      soldByName: card.soldByName,
      source: card.source
    };
  }
}
