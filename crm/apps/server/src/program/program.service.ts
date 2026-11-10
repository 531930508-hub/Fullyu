import { Injectable, Logger } from '@nestjs/common';
import type { MemberBrandCard, Prisma } from '@prisma/client';
import { businessName, toExternalBusiness, type Business } from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { GameService } from '../game/game.service';
import { audit } from '../common/audit';
import { hasPerm, type StaffContext } from '../common/auth.types';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../common/errors';
import { newId } from '../common/ids';
import type { BrandMemberContext } from '../brand-member/brand-member.guard';
import { GIFT_APP_LABEL, normalizeAppTarget, type GiftAppTarget } from './gift-qr';
import { RetreatPaymentClient } from './retreat-payment.client';
import {
  DAY_MS,
  addDays,
  cardActiveAt,
  emitCardEvent,
  extActor,
  formatDate,
  formatIso,
  issuePickupVouchers,
  maskPhone,
  memberByLocal,
  monthKeyOf,
  nextStart,
  perksOf,
  randomCode,
  refundQuote,
  shanghaiDayStart,
  voucherView
} from './program.rules';

const ORDER_REF = /^[A-Za-z0-9._:-]{1,80}$/;
const CAMPAIGN_CODE = /^[A-Z0-9]{4,16}$/;
const MONEY_MAX = 10_000_000;
/** 超过默认赠送天数需另一人审批。 */
export const GIFT_DEFAULT_DAYS = 30;
const GIFT_MAX_DAYS = 365;
const INVITE_TTL_DAYS = 30;
const FEEDBACK_DAILY_CAP = 5;

const obj = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

const text = (value: unknown, field: string, { min = 1, max = 100 } = {}): string => {
  const out = typeof value === 'string' ? value.trim() : '';
  if (out.length < min) throw badRequest(min > 1 ? `${field}至少 ${min} 个字` : `缺少 ${field}`);
  if (out.length > max) throw badRequest(`${field}不能超过 ${max} 个字`);
  return out;
};

const optText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const cents = (value: unknown, field: string, min = 0): number => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > MONEY_MAX) {
    throw badRequest(`${field} 必须是 ${min}–${MONEY_MAX} 的整数（分）`);
  }
  return value as number;
};

const orderRefOf = (value: unknown): string => {
  const ref = text(value, 'orderRef', { max: 80 });
  if (!ORDER_REF.test(ref)) throw badRequest('orderRef 只能包含字母、数字与 . _ : -');
  return ref;
};

const eventAt = (value: unknown, field: string): Date => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw badRequest(`缺少 ${field}`);
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) throw badRequest(`${field} 不是合法时间`);
  if (at.getTime() > Date.now() + 5 * 60 * 1000) {
    throw badRequest(`${field} 不能晚于当前时间 5 分钟以上`);
  }
  return at;
};

/** YYYY-MM-DD → 上海当日 00:00 */
const dayOf = (value: unknown, field: string): Date => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw badRequest(`${field} 需为 YYYY-MM-DD`);
  const at = new Date(`${raw}T00:00:00+08:00`);
  if (Number.isNaN(at.getTime())) throw badRequest(`${field} 不是合法日期`);
  return at;
};

const actorOf = (staff: StaffContext) => ({ id: staff.id, name: staff.name });

const cardBrief = (card: MemberBrandCard) => ({
  cardId: card.id,
  state: card.state,
  source: card.source,
  productCode: card.productCode,
  productName: card.productName,
  validFrom: formatDate(card.validFrom),
  validUntil: formatDate(card.validUntil)
});

/**
 * 2026-11-08 会议落地的会员运营能力：
 * 订单上报（净消费/节省/得骰）、赠送会员码、提货券、意见反馈与会员故事、
 * 在场畅练卡附赠品牌会员、邀请好友、退款试算与后台协商退款。
 */
@Injectable()
export class ProgramService {
  private readonly logger = new Logger(ProgramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly retreat: RetreatPaymentClient
  ) {}

  // ───────────────────────── 订单上报 ─────────────────────────

  async reportOrder(body: unknown, ctx: BrandMemberContext) {
    const input = obj(body);
    const member = await memberByLocal(this.prisma, ctx, input.localUserId);
    const orderRef = orderRefOf(input.orderRef);
    const paidCents = cents(input.paidCents, 'paidCents');
    const savedCents = input.savedCents === undefined ? 0 : cents(input.savedCents, 'savedCents');
    const occurredAt = eventAt(input.occurredAt, 'occurredAt');
    const now = new Date();

    let replayed = false;
    const prior = await this.prisma.memberOrder.findUnique({
      where: { business_orderRef_kind: { business: ctx.business, orderRef, kind: 'ORDER' } }
    });
    let order = prior;
    if (prior) {
      if (
        prior.memberId !== member.id ||
        prior.paidCents !== paidCents ||
        prior.savedCents !== savedCents
      ) {
        throw conflict('该订单号已上报过不同的会员或金额', { code: 'IDEMPOTENCY_CONFLICT' });
      }
      replayed = true;
    } else {
      const card = await cardActiveAt(this.prisma, member.id, occurredAt);
      try {
        order = await this.prisma.memberOrder.create({
          data: {
            id: newId('MO'),
            memberId: member.id,
            business: ctx.business,
            orderRef,
            kind: 'ORDER',
            paidCents,
            savedCents: card ? savedCents : 0,
            cardId: card?.id ?? null,
            occurredAt
          }
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw conflict('该订单正在上报，请稍后重试', { code: 'IDEMPOTENCY_CONFLICT' });
        }
        throw error;
      }
    }
    const row = order!;

    let dice: Awaited<ReturnType<GameService['earnOrderForMember']>> | null = null;
    if (row.cardId && paidCents > 0) {
      const card = await this.prisma.memberBrandCard.findUnique({ where: { id: row.cardId } });
      if (card && card.gameEnabled && card.state !== 'REFUNDED') {
        dice = await this.game.earnOrderForMember(member.id, ctx.business, orderRef, paidCents, now);
      }
    }
    return {
      order: {
        orderRef,
        paidCents: row.paidCents,
        savedCents: row.savedCents,
        brandMember: Boolean(row.cardId),
        occurredAt: formatIso(row.occurredAt)
      },
      dice: dice
        ? { earned: dice.dice, balance: dice.balance, capped: dice.capped, replayed: dice.replayed }
        : null,
      progress: dice ? dice.progress : await this.game.progressForMember(member.id, now),
      replayed
    };
  }

  /**
   * 订单退款：净消费与节省按比例冲回；每次新增退款都同步回收骰子。
   * 退款按金额每满一颗扣 1 颗，允许扣成负数，后续消费先补回。
   */
  async refundOrder(body: unknown, ctx: BrandMemberContext) {
    const input = obj(body);
    const member = await memberByLocal(this.prisma, ctx, input.localUserId);
    const orderRef = orderRefOf(input.orderRef);
    const refundCents = cents(input.refundCents, 'refundCents', 1);
    const occurredAt = eventAt(input.occurredAt, 'occurredAt');

    const order = await this.prisma.memberOrder.findUnique({
      where: { business_orderRef_kind: { business: ctx.business, orderRef, kind: 'ORDER' } }
    });
    if (!order || order.memberId !== member.id) {
      throw new ApiError(404, '未找到该会员的原订单上报记录', { code: 'ORDER_NOT_FOUND' });
    }
    if (refundCents > order.paidCents) throw badRequest('退款金额不能超过订单实付');
    const prior = await this.prisma.memberOrder.findUnique({
      where: { business_orderRef_kind: { business: ctx.business, orderRef, kind: 'REFUND' } }
    });
    // refundCents 为该订单「累计已退」金额：同一订单多次部分退款时上报新的累计值，
    // 相同累计值视为重放，累计值变小视为乱序/冲突。
    const full = refundCents === order.paidCents;
    const savedBack = full
      ? order.savedCents
      : Math.round((order.savedCents * refundCents) / Math.max(1, order.paidCents));
    const before = prior ? -prior.paidCents : 0;
    const added = refundCents - before;
    let replayed = false;
    if (prior) {
      if (refundCents < before) {
        throw conflict('该订单已上报更高的累计退款金额', { code: 'IDEMPOTENCY_CONFLICT' });
      }
      if (refundCents === before) {
        replayed = true;
      } else {
        const bumped = await this.prisma.memberOrder.updateMany({
          where: { id: prior.id, paidCents: prior.paidCents },
          data: { paidCents: -refundCents, savedCents: -savedBack, occurredAt }
        });
        if (bumped.count !== 1) {
          throw conflict('该订单退款正在上报，请稍后重试', { code: 'IDEMPOTENCY_CONFLICT' });
        }
      }
    } else {
      await this.prisma.memberOrder.create({
        data: {
          id: newId('MO'),
          memberId: member.id,
          business: ctx.business,
          orderRef,
          kind: 'REFUND',
          paidCents: -refundCents,
          savedCents: -savedBack,
          cardId: order.cardId,
          occurredAt
        }
      });
    }
    const dice = added > 0
      ? await this.game.refundOrderForMember(member.id, ctx.business, orderRef, added)
      : null;
    return {
      order: { orderRef, refundCents, full },
      dice: dice
        ? {
            reclaimed: dice.reclaimed,
            balance: dice.balance,
            carryCents: dice.carryCents,
            progress: dice.progress
          }
        : null,
      replayed
    };
  }

  // ───────────────────────── 退款试算 ─────────────────────────

  async externalRefundQuote(query: unknown, ctx: BrandMemberContext) {
    const input = obj(query);
    const orderRef = optText(input.orderRef, 80);
    const cardId = optText(input.cardId, 100);
    if (!orderRef && !cardId) throw badRequest('缺少 orderRef 或 cardId');
    const card = orderRef
      ? await this.prisma.memberBrandCard.findUnique({
          where: { soldBy_orderRef: { soldBy: ctx.business, orderRef } }
        })
      : await this.prisma.memberBrandCard.findUnique({ where: { id: cardId } });
    if (!card) {
      throw new ApiError(404, '未找到对应的品牌会员卡', { code: 'CARD_NOT_FOUND' });
    }
    if (card.soldBy !== ctx.business) {
      throw new ApiError(403, '该卡不属于当前业务', { code: 'BUSINESS_MISMATCH' });
    }
    return refundQuote(this.prisma, card);
  }

  async adminRefundQuote(cardId: string) {
    const card = await this.prisma.memberBrandCard.findUnique({ where: { id: cardId } });
    if (!card) throw notFound('品牌卡不存在');
    return refundQuote(this.prisma, card);
  }

  /**
   * 后台协商退款：只撤销 CRM 卡期，资金由财务在收款侧退回（轻疗线上单走内部接口）。
   * 新后台入口统一走 refundIssuedCard，这里保留给会员详情页的快捷入口。
   */
  async forceRefund(cardId: string, body: unknown, staff: StaffContext) {
    const input = obj(body);
    const reason = text(input.reason, '协商原因', { min: 4, max: 200 });
    const refundCents = cents(input.refundCents, 'refundCents', 1);
    const card = await this.prisma.memberBrandCard.findUnique({ where: { id: cardId } });
    if (!card) throw notFound('品牌卡不存在');
    if (card.state === 'REFUNDED') throw conflict('该会员卡已退款', { code: 'ALREADY_REFUNDED' });
    if (refundCents > card.paidCents) throw badRequest('退款金额不能超过实付金额');
    const quote = await refundQuote(this.prisma, card, new Date());
    const result = await this.markCardRefunded(
      cardId,
      { refundType: 'NEGOTIATED', refundCents, reason },
      staff,
      '协商退款',
      `规则可退 ${quote.refundableCents} 分`
    );
    return {
      card: result.card,
      refund: { refundType: 'NEGOTIATED', refundCents, reason, ruleQuote: quote },
      voidedVouchers: result.voidedVouchers
    };
  }

  // ───────────────────────── 会员卡台账（CRM 为中心） ─────────────────────────

  private cardAdminView(card: MemberBrandCard, member?: {
    id: string;
    memberNo: string;
    name: string;
    phone: string | null;
    status: string;
  }, now = new Date()) {
    const today = shanghaiDayStart(now);
    let effectiveState = card.state;
    if (card.state === 'ACTIVE') {
      if (card.validUntil.getTime() < today.getTime()) effectiveState = 'EXPIRED';
      else if (card.validUntil.getTime() - today.getTime() <= 30 * DAY_MS) effectiveState = 'EXPIRING';
    }
    return {
      cardId: card.id,
      productCode: card.productCode,
      productName: card.productName,
      version: card.version,
      source: card.source,
      state: card.state,
      effectiveState,
      validFrom: formatDate(card.validFrom),
      validUntil: formatDate(card.validUntil),
      priceCents: card.priceCents,
      paidCents: card.paidCents,
      paidAt: formatIso(card.paidAt),
      orderRef: card.orderRef,
      soldBy: card.soldBy,
      soldByName: card.soldByName,
      refundType: card.refundType,
      refundCents: card.refundCents ?? 0,
      refundedAt: card.refundedAt ? formatIso(card.refundedAt) : null,
      refundReason: card.refundReason,
      gameEnabled: card.gameEnabled,
      createdAt: formatIso(card.createdAt),
      ...(member ? { member } : {})
    };
  }

  /** 后台会员卡台账：按会员/状态/来源/产品/售出业务/订单号/发卡日期检索。 */
  async adminCards(query: unknown) {
    const input = obj(query);
    const page = Math.max(1, Math.min(9999, Number(input.page) || 1));
    const size = Math.min(50, Math.max(5, Number(input.size) || 20));
    const where: Prisma.MemberBrandCardWhereInput = {};
    const state = optText(input.state, 20).toUpperCase();
    if (['ACTIVE', 'PENDING', 'REFUND_LOCKED', 'REFUNDED'].includes(state)) where.state = state;
    const source = optText(input.source, 20).toUpperCase();
    if (['PAID', 'GIFT', 'MANUAL', 'BUNDLE'].includes(source)) where.source = source;
    const productCode = optText(input.productCode, 40);
    if (productCode) where.productCode = productCode;
    const soldBy = optText(input.soldBy, 20);
    if (['sx', 'ql', 'zc'].includes(soldBy)) where.soldBy = soldBy;
    const orderRef = optText(input.orderRef, 80);
    if (orderRef) where.orderRef = { contains: orderRef };
    const keyword = optText(input.q, 60);
    if (keyword) {
      where.OR = [
        { id: { contains: keyword } },
        { orderRef: { contains: keyword } },
        { member: { memberNo: { contains: keyword } } },
        { member: { name: { contains: keyword } } },
        { member: { phone: { contains: keyword } } }
      ];
    }
    const from = optText(input.from, 10) ? dayOf(input.from, 'from') : null;
    const to = optText(input.to, 10) ? dayOf(input.to, 'to') : null;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lt: addDays(to, 1) } : {})
      };
    }
    const now = new Date();
    const [total, rows, grouped, sums, products] = await Promise.all([
      this.prisma.memberBrandCard.count({ where }),
      this.prisma.memberBrandCard.findMany({
        where,
        include: {
          member: { select: { id: true, memberNo: true, name: true, phone: true, status: true } }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * size,
        take: size
      }),
      this.prisma.memberBrandCard.groupBy({
        by: ['state'],
        where,
        _count: { _all: true }
      }),
      this.prisma.memberBrandCard.aggregate({
        where,
        _sum: { paidCents: true, refundCents: true }
      }),
      this.prisma.brandCardProduct.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ sort: 'asc' }, { code: 'asc' }],
        select: { code: true, name: true, currentVersion: true }
      })
    ]);
    const counts: Record<string, number> = {};
    for (const row of grouped) counts[row.state] = row._count._all;
    return {
      items: rows.map((row) => this.cardAdminView(row, row.member, now)),
      total,
      page,
      size,
      summary: {
        total: grouped.reduce((sum, row) => sum + row._count._all, 0),
        active: counts.ACTIVE || 0,
        pending: counts.PENDING || 0,
        refunded: counts.REFUNDED || 0,
        netPaidCents: Math.max(0, (sums._sum.paidCents || 0) - (sums._sum.refundCents || 0))
      },
      products
    };
  }

  /** 单张卡：会员、提货码、退款试算、轻疗订单快照（查不到不阻塞页面）。 */
  async adminCardDetail(cardId: string) {
    const card = await this.prisma.memberBrandCard.findUnique({
      where: { id: cardId },
      include: {
        member: { select: { id: true, memberNo: true, name: true, phone: true, status: true } }
      }
    });
    if (!card) throw notFound('会员卡不存在');
    const vouchers = await this.prisma.pickupVoucher.findMany({
      where: { cardId: card.id },
      orderBy: { issuedAt: 'asc' }
    });
    const quote = ['PAID', 'MANUAL'].includes(card.source)
      ? await refundQuote(this.prisma, card)
      : null;
    let retreat: Record<string, unknown> = { configured: this.retreat.enabled };
    if (card.soldBy === 'ql' && card.source === 'PAID') {
      if (!this.retreat.enabled) {
        retreat = { ...retreat, error: '未配置 CRM_RETREAT_*，无法查询轻疗订单' };
      } else {
        try {
          retreat = { ...retreat, order: await this.retreat.order(card.orderRef) };
        } catch (error) {
          retreat = {
            ...retreat,
            error: error instanceof Error ? error.message : '轻疗订单查询失败'
          };
        }
      }
    }
    const parse = (raw: string): unknown => {
      try {
        return JSON.parse(raw || 'null');
      } catch {
        return null;
      }
    };
    return {
      card: {
        ...this.cardAdminView(card, card.member),
        benefits: parse(card.benefitsJson) || [],
        perks: parse(card.perksJson) || {},
        pointsSpend: parse(card.pointsSpendJson) || {}
      },
      member: card.member,
      vouchers: vouchers.map(voucherView),
      quote,
      retreat
    };
  }

  /**
   * CRM 手工发卡/续费：GIFT 赠送（无实收）或 MANUAL 线下收款。
   * 新卡接在会员最后一张有效卡之后；订单号可外部传入做幂等，缺省生成 CRM-*。
   */
  async manualIssue(body: unknown, staff: StaffContext) {
    const input = obj(body);
    const memberId = text(input.memberId, 'memberId', { max: 80 });
    const productCode = text(input.productCode, '产品编码', { max: 40 });
    const mode = text(input.mode, '发卡方式', { max: 10 }).toUpperCase();
    if (!['GIFT', 'MANUAL'].includes(mode)) {
      throw badRequest('发卡方式只能是 GIFT（赠送）或 MANUAL（线下收款）');
    }
    const paidCents =
      mode === 'GIFT' ? 0 : cents(input.paidCents, 'paidCents', 1);
    if (mode === 'GIFT' && input.paidCents !== undefined && input.paidCents !== null) {
      throw badRequest('赠送卡不能登记实付金额，请改用线下收款发卡');
    }
    const soldBy = optText(input.soldBy, 20) || 'ql';
    if (!['sx', 'ql', 'zc'].includes(soldBy)) throw badRequest('soldBy 只能是 sx / ql / zc');
    const note = optText(input.note, 200);
    const orderRef = optText(input.orderRef, 80);
    if (orderRef && !ORDER_REF.test(orderRef)) {
      throw badRequest('orderRef 只能包含字母、数字与 . _ : -');
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member || member.status !== 'ACTIVE') throw notFound('会员不存在或已停用');
      const product = await tx.brandCardProduct.findUnique({ where: { code: productCode } });
      if (!product || !product.currentVersion) {
        throw conflict('该卡产品暂无在售版本', { code: 'PRODUCT_NOT_FOUND' });
      }
      const version = await tx.brandCardVersion.findUnique({
        where: { productCode_version: { productCode, version: product.currentVersion } }
      });
      if (!version || version.status !== 'ACTIVE') {
        throw conflict('该卡产品当前版本不可售', { code: 'PRODUCT_NOT_FOUND' });
      }
      const ref = orderRef || `CRM-${mode === 'GIFT' ? 'G' : 'M'}-${Date.now()}-${randomCode(4)}`;
      const prior = await tx.memberBrandCard.findUnique({
        where: { soldBy_orderRef: { soldBy, orderRef: ref } }
      });
      if (prior) {
        if (prior.memberId === memberId && prior.productCode === productCode) {
          return { card: this.cardAdminView(prior, member, now), vouchers: [], replayed: true };
        }
        throw conflict('该订单号已用于其他会员或产品', { code: 'IDEMPOTENCY_CONFLICT' });
      }
      const start = await nextStart(tx, memberId, now);
      const validUntil = addDays(start, version.validDays - 1);
      const card = await tx.memberBrandCard.create({
        data: {
          id: newId('MBC'),
          memberId,
          productCode,
          version: version.version,
          productName: product.name,
          priceCents: version.priceCents,
          validDays: version.validDays,
          validFrom: start,
          validUntil,
          state: start > shanghaiDayStart(now) ? 'PENDING' : 'ACTIVE',
          benefitsJson: version.benefitsJson,
          pointsSpendJson: version.pointsSpendJson,
          perksJson: version.perksJson,
          gameEnabled: version.gameEnabled,
          source: mode,
          soldBy,
          soldByName: `${businessName(soldBy as Business)} · CRM 手工发卡`,
          orderRef: ref,
          paidCents,
          paidAt: now
        }
      });
      const vouchers = await issuePickupVouchers(tx, card, version.giftsJson);
      await audit(tx, {
        actor: actorOf(staff),
        action: mode === 'GIFT' ? '手工赠送会员卡' : '手工发卡',
        target: member.memberNo,
        detail:
          `${card.productName} v${card.version} · ${formatDate(start)} → ${formatDate(validUntil)}` +
          ` · ${mode === 'GIFT' ? '赠送' : `实收 ${paidCents} 分`}` +
          (vouchers.length ? ` · 提货券 ${vouchers.length} 张` : '') +
          (note ? ` · ${note}` : '')
      });
      await emitCardEvent(tx, 'brand_card.issued', card, member.memberNo, {
        source: card.source,
        orderRef: ref,
        paidCents,
        soldBy: toExternalBusiness(soldBy as Business),
        manual: true,
        operatorName: staff.name
      });
      return {
        card: this.cardAdminView(card, member, now),
        vouchers: vouchers.map(voucherView),
        replayed: false
      };
    });
  }

  /**
   * 统一退款入口：
   * - RULE：按 CRM 规则试算；轻疗线上卡先调轻疗内部接口原路退款再落 CRM；手工卡只记账（财务线下退）。
   * - NEGOTIATED：协商金额；轻疗线上卡同样先退款再落 CRM，其他情况只落 CRM。
   * - SYNC：轻疗已退款但 CRM 未落库时补记录（钱身先动导致 CRM 写失败后的恢复入口）。
   */
  async adminRefundCard(cardId: string, body: unknown, staff: StaffContext) {
    const input = obj(body);
    const kind = text(input.kind ?? 'RULE', '退款方式', { max: 20 }).toUpperCase();
    if (!['RULE', 'NEGOTIATED', 'SYNC'].includes(kind)) {
      throw badRequest('退款方式只能是 RULE / NEGOTIATED / SYNC');
    }
    const card = await this.prisma.memberBrandCard.findUnique({ where: { id: cardId } });
    if (!card) throw notFound('会员卡不存在');
    if (card.state === 'REFUNDED') {
      throw conflict('该会员卡已退款', { code: 'ALREADY_REFUNDED' });
    }
    if (!['PAID', 'MANUAL'].includes(card.source)) {
      throw conflict('赠送或附赠的会员资格无需退款', { code: 'CARD_NOT_REFUNDABLE' });
    }

    if (kind === 'SYNC') {
      if (card.soldBy !== 'ql' || card.source !== 'PAID') {
        throw conflict('只有轻疗线上售出的卡需要同步轻疗退款状态', { code: 'SYNC_NOT_APPLICABLE' });
      }
      const remote = await this.retreat.order(card.orderRef);
      if (remote.state !== 3) {
        throw conflict('轻疗侧订单尚未退款，不能只同步状态', { code: 'RETREAT_NOT_REFUNDED' });
      }
      const refundCents = Math.max(0, Number(remote.refundCents) || 0);
      const refundType = this.normalizeRefundType(remote.refundType) || 'NEGOTIATED';
      const result = await this.markCardRefunded(
        cardId,
        { refundType, refundCents, reason: '轻疗已退款，CRM 同步卡状态' },
        staff,
        '同步退款',
        `轻疗单号 ${card.orderRef}`
      );
      return { ...result, refund: { ...result.refund, remote }, remote };
    }

    if (kind === 'RULE') {
      const quote = await refundQuote(this.prisma, card);
      if (!quote.allowed) {
        throw conflict(quote.message, { code: quote.reasonCode || 'REFUND_NOT_ALLOWED' });
      }
      if (card.soldBy !== 'ql' || card.source !== 'PAID') {
        if (card.source === 'MANUAL') {
          const result = await this.markCardRefunded(
            cardId,
            { refundType: quote.refundType, refundCents: quote.refundableCents, reason: 'CRM 规则退款（线下退回）' },
            staff,
            '规则退款',
            '手工发卡，资金由财务线下退回'
          );
          return { ...result, quote, offline: true };
        }
        throw conflict('该卡由售卡业务端收款，请在对应业务后台退款或使用协商退款', {
          code: 'RETREAT_REQUIRED'
        });
      }
      const remote = await this.retreat.order(card.orderRef);
      if (remote.state === 3) {
        const refundCents = Math.max(0, Number(remote.refundCents) || 0);
        const refundType = this.normalizeRefundType(remote.refundType) || quote.refundType;
        const result = await this.markCardRefunded(
          cardId,
          { refundType, refundCents, reason: '轻疗已退款，CRM 同步卡状态' },
          staff,
          '同步退款',
          `轻疗单号 ${card.orderRef}`
        );
        return { ...result, quote, remote, alreadyRefunded: true };
      }
      const paid = await this.retreat.refund({
        orderSn: card.orderRef,
        refundCents: quote.refundableCents,
        refundType: quote.refundType,
        reason: 'CRM 会员卡规则退款',
        operatorName: staff.name
      });
      const actual = Number(paid.refundCents);
      const refundCents = Number.isInteger(actual) && actual >= 0 ? actual : quote.refundableCents;
      const result = await this.markCardRefundedAfterRemote(
        cardId,
        { refundType: quote.refundType, refundCents, reason: 'CRM 规则退款（轻疗原路退回）' },
        staff,
        '规则退款',
        paid.amountMismatch
          ? `轻疗实退 ${refundCents} 分与试算 ${quote.refundableCents} 分不一致`
          : undefined
      );
      return {
        ...result,
        quote,
        remote: paid,
        amountMismatch: Boolean(paid.amountMismatch)
      };
    }

    const reason = text(input.reason, '协商原因', { min: 4, max: 200 });
    const refundCents = cents(input.refundCents, 'refundCents', 1);
    if (refundCents > card.paidCents) throw badRequest('退款金额不能超过实付金额');
    if (card.soldBy === 'ql' && card.source === 'PAID') {
      const remote = await this.retreat.refund({
        orderSn: card.orderRef,
        refundCents,
        refundType: 'NEGOTIATED',
        reason,
        operatorName: staff.name
      });
      const actual = Number(remote.refundCents);
      const finalCents = Number.isInteger(actual) && actual > 0 ? actual : refundCents;
      const result = await this.markCardRefundedAfterRemote(
        cardId,
        { refundType: 'NEGOTIATED', refundCents: finalCents, reason },
        staff,
        '协商退款',
        `轻疗原路退回 ${finalCents} 分`
      );
      return { ...result, remote };
    }
    const result = await this.markCardRefunded(
      cardId,
      { refundType: 'NEGOTIATED', refundCents, reason },
      staff,
      '协商退款',
      card.source === 'MANUAL' ? '手工发卡，资金由财务线下退回' : undefined
    );
    return { ...result, offline: true };
  }

  /** 重试轻疗侧的开卡/撤销：只对轻疗线上卡开放。 */
  async adminRetryCard(cardId: string, body: unknown, staff: StaffContext) {
    const input = obj(body);
    const kind = text(input.kind ?? 'SETTLE', '重试类型', { max: 20 }).toUpperCase();
    if (!['SETTLE', 'CRM_REFUND'].includes(kind)) {
      throw badRequest('重试类型只能是 SETTLE / CRM_REFUND');
    }
    const card = await this.prisma.memberBrandCard.findUnique({ where: { id: cardId } });
    if (!card) throw notFound('会员卡不存在');
    if (card.soldBy !== 'ql' || card.source !== 'PAID') {
      throw conflict('只有轻疗线上售出的卡支持重试开卡或撤销', { code: 'RETREAT_NOT_APPLICABLE' });
    }
    const remote = await this.retreat.retry(card.orderRef, kind as 'SETTLE' | 'CRM_REFUND');
    await audit(this.prisma, {
      actor: actorOf(staff),
      action: kind === 'SETTLE' ? '重试开卡' : '重试撤销',
      target: card.orderRef,
      detail: `轻疗单号 ${card.orderRef} · ${card.productName}`
    });
    return { card: this.cardAdminView(card), remote };
  }

  /** 解除客户在轻疗的“连续两次 7 天退款”购买锁定。 */
  async adminUnlockMember(memberId: string, staff: StaffContext) {
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw notFound('会员不存在');
    if (!member.phone) throw badRequest('会员缺少手机号，无法在轻疗定位客户');
    const result = await this.retreat.unlock(member.phone);
    await audit(this.prisma, {
      actor: actorOf(staff),
      action: '解除品牌会员购买锁定',
      target: member.memberNo,
      detail: result.wasLocked ? '原为锁定，已解除' : '原未锁定，已确认'
    });
    return {
      memberId: member.id,
      memberNo: member.memberNo,
      customerId: result.customerId ?? null,
      wasLocked: Boolean(result.wasLocked),
      unlocked: Boolean(result.unlocked)
    };
  }

  private normalizeRefundType(value: unknown): string | null {
    const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return ['WITHIN_7D', 'AFTER_7D', 'PRORATED', 'NEGOTIATED', 'BUNDLE_REVOKED'].includes(text)
      ? text
      : null;
  }

  /** 轻疗已退款成功后落 CRM；失败时给出可重试的明确提示，不让操作员以为没退款。 */
  private async markCardRefundedAfterRemote(
    cardId: string,
    input: { refundType: string; refundCents: number; reason: string },
    staff: StaffContext,
    action: string,
    extraDetail?: string
  ) {
    try {
      return await this.markCardRefunded(cardId, input, staff, action, extraDetail);
    } catch (error) {
      this.logger.error(
        `轻疗已退款但 CRM 落库失败 cardId=${cardId} error=${error instanceof Error ? error.message : 'unknown'}`
      );
      throw new ApiError(
        500,
        '轻疗已退款成功，但 CRM 记录同步失败。请点击“同步退款”补记录，勿重复退款。',
        { code: 'CRM_SYNC_FAILED' }
      );
    }
  }

  /** 撤销卡期、作废未核销提货码、审计并通知三端；重复调用按已退款返回。 */
  private async markCardRefunded(
    cardId: string,
    input: { refundType: string; refundCents: number; reason: string },
    staff: StaffContext,
    action: string,
    extraDetail?: string
  ) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.memberBrandCard.findUnique({ where: { id: cardId } });
      if (!card) throw notFound('会员卡不存在');
      if (card.state === 'REFUNDED') {
        return {
          card: {
            ...cardBrief(card),
            paidCents: card.paidCents,
            orderRef: card.orderRef,
            refundType: card.refundType,
            refundCents: card.refundCents ?? 0,
            refundedAt: card.refundedAt ? formatIso(card.refundedAt) : null
          },
          refund: {
            refundType: card.refundType || input.refundType,
            refundCents: card.refundCents ?? 0,
            reason: card.refundReason || input.reason
          },
          voidedVouchers: 0,
          replayed: true
        };
      }
      if (!['PAID', 'MANUAL'].includes(card.source)) {
        throw conflict('赠送或附赠的会员资格无需退款', { code: 'CARD_NOT_REFUNDABLE' });
      }
      if (input.refundCents > card.paidCents) {
        throw badRequest('退款金额不能超过实付金额');
      }
      const updated = await tx.memberBrandCard.update({
        where: { id: card.id },
        data: {
          state: 'REFUNDED',
          refundType: input.refundType,
          refundCents: input.refundCents,
          refundedAt: now,
          refundReason: input.reason
        }
      });
      const voided = await tx.pickupVoucher.updateMany({
        where: { cardId: card.id, status: 'ISSUED' },
        data: { status: 'VOID', voidReason: '会员卡退款' }
      });
      const member = await tx.member.findUniqueOrThrow({ where: { id: card.memberId } });
      await audit(tx, {
        actor: actorOf(staff),
        action,
        target: member.memberNo,
        detail:
          `${card.productName} · 退 ${input.refundCents} 分（${input.refundType}）` +
          ` · 作废提货券 ${voided.count} 张 · ${input.reason}` +
          (extraDetail ? ` · ${extraDetail}` : '')
      });
      await emitCardEvent(tx, 'brand_card.refunded', updated, member.memberNo, {
        orderRef: card.orderRef,
        refundType: input.refundType,
        refundCents: input.refundCents,
        soldBy: toExternalBusiness(card.soldBy as Business)
      });
      return {
        card: {
          ...cardBrief(updated),
          paidCents: card.paidCents,
          orderRef: card.orderRef,
          refundType: input.refundType,
          refundCents: input.refundCents,
          refundedAt: formatIso(now)
        },
        refund: {
          refundType: input.refundType,
          refundCents: input.refundCents,
          reason: input.reason
        },
        voidedVouchers: voided.count,
        replayed: false
      };
    });
  }

  // ───────────────────────── 赠送会员码 ─────────────────────────

  async listCampaigns(query: unknown) {
    const status = optText(obj(query).status, 30);
    const rows = await this.prisma.giftCampaign.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    const now = new Date();
    return { items: rows.map((row) => this.campaignView(row, now)) };
  }

  async campaignDetail(id: string) {
    const row = await this.prisma.giftCampaign.findUnique({
      where: { id },
      include: { claims: { include: { member: true }, orderBy: { claimedAt: 'desc' }, take: 500 } }
    });
    if (!row) throw notFound('会员码活动不存在');
    return {
      campaign: this.campaignView(row, new Date()),
      claims: row.claims.map((claim) => ({
        memberId: claim.memberId,
        memberNo: claim.member.memberNo,
        name: claim.member.name,
        phone: claim.member.phone,
        business: claim.business,
        businessName: businessName(claim.business as Business),
        cardId: claim.cardId,
        claimedAt: formatIso(claim.claimedAt)
      })),
      print: {
        code: row.code,
        title: 'Full愈 品牌会员体验',
        appTarget: this.safeAppTarget(row.appTarget),
        appName: GIFT_APP_LABEL[this.safeAppTarget(row.appTarget)],
        line: `微信扫小程序码打开${GIFT_APP_LABEL[this.safeAppTarget(row.appTarget)]}会员页，登录后自动领取 ${row.days} 天品牌会员`,
        deadline: row.claimDeadline ? formatDate(row.claimDeadline) : null
      }
    };
  }

  async createCampaign(body: unknown, staff: StaffContext) {
    const input = obj(body);
    const name = text(input.name, '活动名称', { max: 40 });
    const rawCode = optText(input.code, 16).toUpperCase();
    if (rawCode && !CAMPAIGN_CODE.test(rawCode)) {
      throw badRequest('会员码只能是 4–16 位大写字母或数字');
    }
    const days = input.days === undefined ? GIFT_DEFAULT_DAYS : Number(input.days);
    if (!Number.isInteger(days) || days < 1 || days > GIFT_MAX_DAYS) {
      throw badRequest(`赠送天数需为 1–${GIFT_MAX_DAYS} 的整数`);
    }
    let quota: number | null = null;
    if (input.quota !== undefined && input.quota !== null && input.quota !== '') {
      quota = Number(input.quota);
      if (!Number.isInteger(quota) || quota < 1 || quota > 100000) {
        throw badRequest('名额需为 1–100000 的整数；不限名额请留空');
      }
    }
    let claimDeadline: Date | null = null;
    if (input.claimDeadline) {
      claimDeadline = new Date(dayOf(input.claimDeadline, 'claimDeadline').getTime() + DAY_MS - 1);
      if (claimDeadline.getTime() < Date.now()) throw badRequest('领取截止日不能早于今天');
    }
    const referrerType = optText(input.referrerType, 20).toUpperCase();
    if (referrerType && !['STAFF', 'THERAPIST', 'PARTNER'].includes(referrerType)) {
      throw badRequest('推荐人类型只能是 STAFF / THERAPIST / PARTNER');
    }
    let appTarget: GiftAppTarget;
    try {
      appTarget = normalizeAppTarget(input.appTarget);
    } catch {
      throw badRequest('目标小程序只能是 时叙（sx）/ 在场（zc）/ 轻疗（ql）');
    }
    const needsApproval = days > GIFT_DEFAULT_DAYS;
    let code = rawCode || randomCode();
    if (!rawCode) {
      for (let i = 0; i < 5 && (await this.prisma.giftCampaign.findUnique({ where: { code } })); i += 1) {
        code = randomCode();
      }
    } else if (await this.prisma.giftCampaign.findUnique({ where: { code } })) {
      throw conflict('该会员码已被使用', { code: 'CODE_TAKEN' });
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.giftCampaign.create({
        data: {
          id: newId('GC'),
          code,
          name,
          channelTag: optText(input.channelTag, 30),
          referrerType: referrerType || '',
          referrerName: referrerType ? optText(input.referrerName, 30) : '',
          days,
          quota,
          appTarget,
          claimDeadline,
          status: needsApproval ? 'PENDING_APPROVAL' : 'ACTIVE',
          note: optText(input.note, 200),
          createdBy: staff.id,
          createdByName: staff.name
        }
      });
      await audit(tx, {
        actor: actorOf(staff),
        action: '创建会员码',
        target: code,
        detail: `${name} · ${days} 天 · ${GIFT_APP_LABEL[appTarget]}小程序 · 名额 ${quota ?? '不限'}${needsApproval ? ' · 待审批' : ''}`
      });
      return this.campaignView(row, new Date());
    });
  }

  async decideCampaign(id: string, decision: 'approve' | 'reject', body: unknown, staff: StaffContext) {
    const note = optText(obj(body).note, 200);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.giftCampaign.findUnique({ where: { id } });
      if (!row) throw notFound('会员码活动不存在');
      if (row.status !== 'PENDING_APPROVAL') {
        throw conflict('该会员码不在待审批状态', { code: 'STATE_CONFLICT' });
      }
      if (row.createdBy === staff.id) {
        throw forbidden('发起人不能审批自己的会员码，请由另一位同事审批');
      }
      const updated = await tx.giftCampaign.update({
        where: { id },
        data: {
          status: decision === 'approve' ? 'ACTIVE' : 'REJECTED',
          approvedBy: staff.id,
          approvedByName: staff.name,
          approvedAt: new Date(),
          note: note ? `${row.note ? `${row.note}；` : ''}审批：${note}`.slice(0, 400) : row.note
        }
      });
      await audit(tx, {
        actor: actorOf(staff),
        action: decision === 'approve' ? '审批通过会员码' : '驳回会员码',
        target: row.code,
        detail: `${row.name} · ${row.days} 天${note ? ` · ${note}` : ''}`
      });
      return this.campaignView(updated, new Date());
    });
  }

  async toggleCampaign(id: string, action: 'pause' | 'resume', staff: StaffContext) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.giftCampaign.findUnique({ where: { id } });
      if (!row) throw notFound('会员码活动不存在');
      const from = action === 'pause' ? 'ACTIVE' : 'PAUSED';
      if (row.status !== from) throw conflict('当前状态不能执行该操作', { code: 'STATE_CONFLICT' });
      const updated = await tx.giftCampaign.update({
        where: { id },
        data: { status: action === 'pause' ? 'PAUSED' : 'ACTIVE' }
      });
      await audit(tx, {
        actor: actorOf(staff),
        action: action === 'pause' ? '暂停会员码' : '恢复会员码',
        target: row.code,
        detail: row.name
      });
      return this.campaignView(updated, new Date());
    });
  }

  /** 会员码已印出后改目标端，只影响之后生成的二维码；不追溯已领取记录。 */
  async updateCampaignTarget(id: string, body: unknown, staff: StaffContext) {
    let appTarget: GiftAppTarget;
    try {
      appTarget = normalizeAppTarget(obj(body).appTarget);
    } catch {
      throw badRequest('目标小程序只能是 时叙（sx）/ 在场（zc）/ 轻疗（ql）');
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.giftCampaign.findUnique({ where: { id } });
      if (!row) throw notFound('会员码活动不存在');
      if (row.status === 'REJECTED') throw conflict('已驳回的会员码不能修改', { code: 'STATE_CONFLICT' });
      const updated = await tx.giftCampaign.update({ where: { id }, data: { appTarget } });
      await audit(tx, {
        actor: actorOf(staff),
        action: '修改会员码目标小程序',
        target: row.code,
        detail: `${GIFT_APP_LABEL[this.safeAppTarget(row.appTarget)]} → ${GIFT_APP_LABEL[appTarget]}`
      });
      return this.campaignView(updated, new Date());
    });
  }

  /** 会员在三端「会员码」入口领取；每个活动每位会员限领一次。 */
  async claimGift(body: unknown, ctx: BrandMemberContext) {
    const input = obj(body);
    const member = await memberByLocal(this.prisma, ctx, input.localUserId);
    const code = optText(input.code, 16).toUpperCase().replace(/\s+/g, '');
    if (!CAMPAIGN_CODE.test(code)) {
      throw new ApiError(404, '会员码不存在，请核对后再试', { code: 'GIFT_CODE_INVALID' });
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.giftCampaign.findUnique({ where: { code } });
      if (!campaign || campaign.status === 'REJECTED' || campaign.status === 'PENDING_APPROVAL') {
        throw new ApiError(404, '会员码不存在，请核对后再试', { code: 'GIFT_CODE_INVALID' });
      }
      const existing = await tx.giftClaim.findUnique({
        where: { campaignId_memberId: { campaignId: campaign.id, memberId: member.id } }
      });
      if (existing) {
        const card = await tx.memberBrandCard.findUnique({ where: { id: existing.cardId } });
        return { card: card ? cardBrief(card) : null, days: campaign.days, replayed: true };
      }
      if (campaign.status === 'PAUSED') {
        throw new ApiError(409, '该会员码暂停领取', { code: 'GIFT_CODE_PAUSED' });
      }
      if (campaign.claimDeadline && campaign.claimDeadline.getTime() < now.getTime()) {
        throw new ApiError(409, '该会员码已过领取截止日', { code: 'GIFT_CODE_EXPIRED' });
      }
      const bumped = await tx.giftCampaign.updateMany({
        where: {
          id: campaign.id,
          status: 'ACTIVE',
          ...(campaign.quota !== null ? { claimed: { lt: campaign.quota } } : {})
        },
        data: { claimed: { increment: 1 } }
      });
      if (bumped.count !== 1) {
        throw new ApiError(409, '已满，该会员码名额已领完', { code: 'GIFT_CODE_FULL' });
      }
      const template = await this.annualTemplate(tx);
      const start = await nextStart(tx, member.id, now);
      const validUntil = addDays(start, campaign.days - 1);
      const card = await tx.memberBrandCard.create({
        data: {
          id: newId('MBC'),
          memberId: member.id,
          productCode: 'FY_GIFT',
          version: template.version,
          productName: `赠送会员 · ${campaign.days} 天`,
          priceCents: 0,
          validDays: campaign.days,
          validFrom: start,
          validUntil,
          state: start > shanghaiDayStart(now) ? 'PENDING' : 'ACTIVE',
          benefitsJson: template.benefitsJson,
          pointsSpendJson: template.pointsSpendJson,
          perksJson: template.perksJson,
          gameEnabled: template.gameEnabled,
          soldBy: ctx.business,
          soldByName: businessName(ctx.business),
          orderRef: `gift:${campaign.code}:${member.memberNo}`,
          paidCents: 0,
          paidAt: now,
          source: 'GIFT',
          giftCampaignId: campaign.id
        }
      });
      await tx.giftClaim.create({
        data: {
          id: newId('GCL'),
          campaignId: campaign.id,
          memberId: member.id,
          business: ctx.business,
          cardId: card.id
        }
      });
      await audit(tx, {
        actor: extActor(ctx),
        action: '领取会员码',
        target: member.memberNo,
        detail:
          `${campaign.code} · ${campaign.name} · ${campaign.days} 天 · 渠道 ${campaign.channelTag || '-'}` +
          (campaign.referrerName ? ` · 推荐人 ${campaign.referrerName}` : '')
      });
      await emitCardEvent(tx, 'brand_card.issued', card, member.memberNo, {
        soldBy: toExternalBusiness(ctx.business)
      });
      return { card: cardBrief(card), days: campaign.days, replayed: false };
    });
  }

  private campaignView(
    row: Prisma.GiftCampaignGetPayload<Record<string, never>>,
    now: Date
  ) {
    const expired = Boolean(row.claimDeadline && row.claimDeadline.getTime() < now.getTime());
    const full = row.quota !== null && row.claimed >= row.quota;
    const appTarget = this.safeAppTarget(row.appTarget);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      channelTag: row.channelTag,
      referrerType: row.referrerType,
      referrerName: row.referrerName,
      days: row.days,
      quota: row.quota,
      claimed: row.claimed,
      appTarget,
      appName: GIFT_APP_LABEL[appTarget],
      claimDeadline: row.claimDeadline ? formatDate(row.claimDeadline) : null,
      status: row.status,
      display:
        row.status === 'ACTIVE' ? (full ? '已满' : expired ? '已截止' : '领取中') : row.status,
      note: row.note,
      needsApproval: row.days > GIFT_DEFAULT_DAYS,
      createdByName: row.createdByName,
      approvedByName: row.approvedByName,
      createdAt: formatIso(row.createdAt)
    };
  }

  /** 历史数据或手工改库出现空值时按默认端展示，不影响既有会员码。 */
  private safeAppTarget(value: string | null | undefined): GiftAppTarget {
    try {
      return normalizeAppTarget(value);
    } catch {
      return 'sx';
    }
  }

  /** 赠送/附赠卡的权益快照取年卡现行版本；年卡下架时退回任一在售版本。 */
  private async annualTemplate(tx: Prisma.TransactionClient) {
    const annual = await tx.brandCardProduct.findUnique({ where: { code: 'FY_ANNUAL' } });
    let version =
      annual && annual.currentVersion
        ? await tx.brandCardVersion.findUnique({
            where: {
              productCode_version: { productCode: 'FY_ANNUAL', version: annual.currentVersion }
            }
          })
        : null;
    if (!version) {
      version = await tx.brandCardVersion.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { activatedAt: 'desc' }
      });
    }
    if (!version) {
      throw new ApiError(503, '当前没有在售的品牌卡版本，暂不能发放会员资格', {
        code: 'PRODUCT_NOT_FOUND'
      });
    }
    return version;
  }

  // ───────────────────────── 提货券 ─────────────────────────

  async lookupVoucher(code: string) {
    const voucher = await this.prisma.pickupVoucher.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { member: true }
    });
    if (!voucher) throw new ApiError(404, '提货码不存在', { code: 'VOUCHER_NOT_FOUND' });
    const card = await this.prisma.memberBrandCard.findUnique({ where: { id: voucher.cardId } });
    return {
      voucher: { ...voucherView(voucher), redeemedByName: voucher.redeemedByName, voidReason: voucher.voidReason },
      member: {
        id: voucher.member.id,
        memberNo: voucher.member.memberNo,
        name: voucher.member.name,
        phoneMasked: maskPhone(voucher.member.phone)
      },
      card: card ? cardBrief(card) : null
    };
  }

  /** 门店人工核销：任意门店一次有效，条件更新防止两台设备同时核销。 */
  async redeemVoucher(code: string, body: unknown, staff: StaffContext) {
    const store = text(obj(body).store, '核销门店', { max: 40 });
    const normalized = code.trim().toUpperCase();
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const voucher = await tx.pickupVoucher.findUnique({
        where: { code: normalized },
        include: { member: true }
      });
      if (!voucher) throw new ApiError(404, '提货码不存在', { code: 'VOUCHER_NOT_FOUND' });
      if (voucher.status === 'REDEEMED') {
        throw new ApiError(409, `该提货码已于 ${formatIso(voucher.redeemedAt!).slice(0, 16).replace('T', ' ')} 在 ${voucher.redeemedStore} 核销`, {
          code: 'VOUCHER_USED'
        });
      }
      if (voucher.status !== 'ISSUED') {
        throw new ApiError(409, `该提货码已作废${voucher.voidReason ? `（${voucher.voidReason}）` : ''}`, {
          code: 'VOUCHER_VOID'
        });
      }
      const card = await tx.memberBrandCard.findUnique({ where: { id: voucher.cardId } });
      if (!card || card.state === 'REFUNDED') {
        throw new ApiError(409, '对应会员卡已退款，提货码不可用', { code: 'VOUCHER_VOID' });
      }
      const done = await tx.pickupVoucher.updateMany({
        where: { id: voucher.id, status: 'ISSUED' },
        data: {
          status: 'REDEEMED',
          redeemedAt: now,
          redeemedBy: staff.id,
          redeemedByName: staff.name,
          redeemedStore: store
        }
      });
      if (done.count !== 1) {
        throw new ApiError(409, '该提货码刚刚已被核销', { code: 'VOUCHER_USED' });
      }
      await audit(tx, {
        actor: actorOf(staff),
        action: '核销提货券',
        target: voucher.member.memberNo,
        detail: `${voucher.code} · ${voucher.title} · ${store}`
      });
      const updated = await tx.pickupVoucher.findUniqueOrThrow({ where: { id: voucher.id } });
      return { voucher: voucherView(updated) };
    });
  }

  // ───────────────────────── 意见反馈与会员故事 ─────────────────────────

  async submitFeedback(body: unknown, ctx: BrandMemberContext) {
    const input = obj(body);
    const member = await memberByLocal(this.prisma, ctx, input.localUserId);
    const content = text(input.content, '反馈内容', { min: 5, max: 1000 });
    const now = new Date();
    if (!(await cardActiveAt(this.prisma, member.id, now))) {
      throw new ApiError(403, '意见反馈仅对品牌会员开放', { code: 'MEMBERS_ONLY' });
    }
    const today = await this.prisma.memberFeedback.count({
      where: { memberId: member.id, createdAt: { gte: shanghaiDayStart(now) } }
    });
    if (today >= FEEDBACK_DAILY_CAP) {
      throw new ApiError(429, '今天已经提交了好几条，我们会逐条看完，明天再来补充吧', {
        code: 'FEEDBACK_RATE_LIMIT'
      });
    }
    const row = await this.prisma.memberFeedback.create({
      data: {
        id: newId('FB'),
        memberId: member.id,
        business: ctx.business,
        content,
        allowQuote: input.allowQuote === true
      }
    });
    return { id: row.id, status: row.status, createdAt: formatIso(row.createdAt) };
  }

  async memberStories(query: unknown, ctx: BrandMemberContext) {
    const member = await memberByLocal(this.prisma, ctx, obj(query).localUserId);
    if (!(await cardActiveAt(this.prisma, member.id, new Date()))) {
      throw new ApiError(403, '会员故事仅对品牌会员开放', { code: 'MEMBERS_ONLY' });
    }
    const rows = await this.prisma.feedbackStory.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ sort: 'asc' }, { publishedAt: 'desc' }],
      take: 50
    });
    return {
      stories: rows.map((row) => ({
        id: row.id,
        title: row.title,
        quote: row.quote,
        quoteBy: row.quoteBy,
        story: row.story,
        business: toExternalBusiness(row.business as Business) || '',
        publishedAt: row.publishedAt ? formatDate(row.publishedAt) : null
      }))
    };
  }

  async listFeedback(query: unknown) {
    const status = optText(obj(query).status, 20);
    const rows = await this.prisma.memberFeedback.findMany({
      where: status ? { status } : {},
      include: { member: true },
      orderBy: { createdAt: 'desc' },
      take: 300
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        memberId: row.memberId,
        memberNo: row.member.memberNo,
        name: row.member.name,
        phone: row.member.phone,
        business: row.business,
        businessName: businessName(row.business as Business),
        content: row.content,
        allowQuote: row.allowQuote,
        status: row.status,
        staffNote: row.staffNote,
        handledByName: row.handledByName,
        createdAt: formatIso(row.createdAt)
      }))
    };
  }

  async updateFeedback(id: string, body: unknown, staff: StaffContext) {
    const input = obj(body);
    const status = optText(input.status, 20);
    if (status && !['NEW', 'READ', 'ARCHIVED'].includes(status)) {
      throw badRequest('状态只能是 NEW / READ / ARCHIVED');
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.memberFeedback.findUnique({ where: { id } });
      if (!row) throw notFound('反馈不存在');
      const updated = await tx.memberFeedback.update({
        where: { id },
        data: {
          ...(status ? { status } : {}),
          ...(typeof input.staffNote === 'string' ? { staffNote: optText(input.staffNote, 500) } : {}),
          handledBy: staff.id,
          handledByName: staff.name
        }
      });
      await audit(tx, {
        actor: actorOf(staff),
        action: '处理会员反馈',
        target: id,
        detail: `${row.status} → ${updated.status}`
      });
      return { id: updated.id, status: updated.status, staffNote: updated.staffNote };
    });
  }

  async listStories() {
    const rows = await this.prisma.feedbackStory.findMany({
      orderBy: [{ status: 'asc' }, { sort: 'asc' }, { createdAt: 'desc' }],
      take: 200
    });
    return { items: rows.map((row) => this.storyView(row)) };
  }

  async saveStory(id: string | null, body: unknown, staff: StaffContext) {
    const input = obj(body);
    const data = {
      title: text(input.title, '标题', { max: 40 }),
      quote: text(input.quote, '会员原话摘录', { max: 300 }),
      quoteBy: optText(input.quoteBy, 30),
      story: text(input.story, '我们做了什么', { max: 1500 }),
      business: optText(input.business, 10),
      sort: Number.isInteger(input.sort) ? (input.sort as number) : 0
    };
    const feedbackId = optText(input.feedbackId, 100) || null;
    return this.prisma.$transaction(async (tx) => {
      if (feedbackId) {
        const feedback = await tx.memberFeedback.findUnique({ where: { id: feedbackId } });
        if (!feedback) throw notFound('关联的反馈不存在');
        if (!feedback.allowQuote) {
          throw conflict('该会员未同意摘录原话，不能关联成故事', { code: 'QUOTE_NOT_ALLOWED' });
        }
      }
      let row;
      if (id) {
        const prior = await tx.feedbackStory.findUnique({ where: { id } });
        if (!prior) throw notFound('故事不存在');
        row = await tx.feedbackStory.update({ where: { id }, data: { ...data, feedbackId } });
      } else {
        row = await tx.feedbackStory.create({
          data: {
            id: newId('FS'),
            ...data,
            feedbackId,
            createdBy: staff.id,
            createdByName: staff.name
          }
        });
      }
      await audit(tx, {
        actor: actorOf(staff),
        action: id ? '编辑会员故事' : '新建会员故事',
        target: row.id,
        detail: row.title
      });
      return this.storyView(row);
    });
  }

  async setStoryStatus(id: string, status: 'PUBLISHED' | 'ARCHIVED', staff: StaffContext) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.feedbackStory.findUnique({ where: { id } });
      if (!row) throw notFound('故事不存在');
      const updated = await tx.feedbackStory.update({
        where: { id },
        data: {
          status,
          ...(status === 'PUBLISHED' ? { publishedAt: row.publishedAt ?? new Date() } : {})
        }
      });
      await audit(tx, {
        actor: actorOf(staff),
        action: status === 'PUBLISHED' ? '发布会员故事' : '下线会员故事',
        target: id,
        detail: row.title
      });
      return this.storyView(updated);
    });
  }

  private storyView(row: Prisma.FeedbackStoryGetPayload<Record<string, never>>) {
    return {
      id: row.id,
      feedbackId: row.feedbackId,
      business: row.business,
      title: row.title,
      quote: row.quote,
      quoteBy: row.quoteBy,
      story: row.story,
      status: row.status,
      sort: row.sort,
      publishedAt: row.publishedAt ? formatIso(row.publishedAt) : null,
      createdByName: row.createdByName
    };
  }

  // ───────────────────────── 会员公告 ─────────────────────────

  async listNotices() {
    const rows = await this.prisma.memberNotice.findMany({
      orderBy: [{ status: 'asc' }, { pinned: 'desc' }, { createdAt: 'desc' }],
      take: 200
    });
    return { items: rows.map((row) => this.noticeView(row)) };
  }

  async saveNotice(id: string | null, body: unknown, staff: StaffContext) {
    const input = obj(body);
    const business = optText(input.business, 20) || 'all';
    if (!['all', 'teahour', 'presence', 'retreat'].includes(business)) {
      throw badRequest('公告范围只能是 all / teahour / presence / retreat');
    }
    const coverUrl = optText(input.coverUrl, 300);
    if (coverUrl && !/^https:\/\//i.test(coverUrl)) {
      throw badRequest('封面图需要填写 HTTPS 图片地址');
    }
    const expireDay = optText(input.expireAt, 40).slice(0, 10);
    const expireAt = expireDay ? new Date(`${expireDay}T23:59:59+08:00`) : null;
    if (
      expireDay &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(expireDay) ||
        Number.isNaN(expireAt!.getTime()) ||
        formatDate(expireAt!) !== expireDay)
    ) {
      throw badRequest('有效期格式应为 YYYY-MM-DD');
    }
    const data = {
      title: text(input.title, '公告标题', { max: 40 }),
      body: text(input.body, '公告内容', { max: 300 }),
      business,
      pinned: input.pinned === true,
      store: optText(input.store, 20),
      coverUrl,
      expireAt
    };
    return this.prisma.$transaction(async (tx) => {
      let row;
      if (id) {
        const prior = await tx.memberNotice.findUnique({ where: { id } });
        if (!prior) throw notFound('公告不存在');
        row = await tx.memberNotice.update({ where: { id }, data });
      } else {
        row = await tx.memberNotice.create({
          data: { id: newId('MN'), ...data, createdBy: staff.id, createdByName: staff.name }
        });
      }
      await audit(tx, {
        actor: actorOf(staff),
        action: id ? '编辑会员公告' : '新建会员公告',
        target: row.id,
        detail: row.title
      });
      return this.noticeView(row);
    });
  }

  async setNoticeStatus(id: string, status: 'PUBLISHED' | 'ARCHIVED', staff: StaffContext) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.memberNotice.findUnique({ where: { id } });
      if (!row) throw notFound('公告不存在');
      if (status === 'PUBLISHED' && row.expireAt && row.expireAt.getTime() < Date.now()) {
        throw badRequest('公告有效期已过，请先修改有效期再发布');
      }
      const updated = await tx.memberNotice.update({
        where: { id },
        data: {
          status,
          ...(status === 'PUBLISHED' ? { publishedAt: row.publishedAt ?? new Date() } : {})
        }
      });
      await audit(tx, {
        actor: actorOf(staff),
        action: status === 'PUBLISHED' ? '发布会员公告' : '下线会员公告',
        target: id,
        detail: row.title
      });
      return this.noticeView(updated);
    });
  }

  private noticeView(row: {
    id: string;
    title: string;
    body: string;
    business: string;
    status: string;
    pinned: boolean;
    store: string;
    coverUrl: string;
    expireAt: Date | null;
    publishedAt: Date | null;
    createdByName: string;
  }) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      business: row.business,
      status: row.status,
      pinned: row.pinned,
      store: row.store,
      coverUrl: row.coverUrl,
      expireAt: row.expireAt ? formatIso(row.expireAt) : null,
      publishedAt: row.publishedAt ? formatIso(row.publishedAt) : null,
      createdByName: row.createdByName
    };
  }

  // ───────────────────────── 在场畅练卡附赠 ─────────────────────────

  private requirePresence(ctx: BrandMemberContext) {
    if (ctx.business !== 'zc') {
      throw new ApiError(403, '该接口仅供在场调用', { code: 'BUSINESS_MISMATCH' });
    }
  }

  /** 畅练卡有效期内附赠同等有效期的品牌会员；畅练卡续期时以同一 passRef 重新上报。 */
  async bundlePass(body: unknown, ctx: BrandMemberContext) {
    this.requirePresence(ctx);
    const input = obj(body);
    const member = await memberByLocal(this.prisma, ctx, input.localUserId);
    const passRef = orderRefOf(input.passRef);
    const validFrom = dayOf(input.validFrom, 'validFrom');
    const validUntil = dayOf(input.validUntil, 'validUntil');
    if (validUntil < validFrom) throw badRequest('validUntil 不能早于 validFrom');
    const days = Math.round((validUntil.getTime() - validFrom.getTime()) / DAY_MS) + 1;
    if (days > 800) throw badRequest('畅练卡有效期过长');
    const orderRef = `zc-pass:${passRef}`;
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.memberBrandCard.findUnique({
        where: { soldBy_orderRef: { soldBy: 'zc', orderRef } }
      });
      if (prior && prior.memberId !== member.id) {
        throw conflict('该畅练卡已绑定其他会员', { code: 'IDEMPOTENCY_CONFLICT' });
      }
      const state = validFrom > shanghaiDayStart(now) ? 'PENDING' : 'ACTIVE';
      if (
        prior &&
        prior.state !== 'REFUNDED' &&
        prior.validFrom.getTime() === validFrom.getTime() &&
        prior.validUntil.getTime() === validUntil.getTime()
      ) {
        return { card: cardBrief(prior), replayed: true };
      }
      const template = await this.annualTemplate(tx);
      const data = {
        validFrom,
        validUntil,
        validDays: days,
        state,
        refundType: null,
        refundCents: null,
        refundedAt: null,
        refundReason: null
      };
      const card = prior
        ? await tx.memberBrandCard.update({ where: { id: prior.id }, data })
        : await tx.memberBrandCard.create({
            data: {
              id: newId('MBC'),
              memberId: member.id,
              productCode: 'FY_BUNDLE',
              version: template.version,
              productName: '在场畅练卡 · 免费赠送品牌大会员',
              priceCents: 0,
              benefitsJson: template.benefitsJson,
              pointsSpendJson: template.pointsSpendJson,
              perksJson: template.perksJson,
              gameEnabled: template.gameEnabled,
              soldBy: 'zc',
              soldByName: businessName('zc'),
              orderRef,
              paidCents: 0,
              paidAt: now,
              source: 'BUNDLE',
              ...data
            }
          });
      await audit(tx, {
        actor: extActor(ctx),
        action: prior ? '更新畅练卡附赠会员' : '畅练卡免费赠送品牌大会员',
        target: member.memberNo,
        detail: `${passRef} · ${formatDate(validFrom)} → ${formatDate(validUntil)}`
      });
      await emitCardEvent(tx, 'brand_card.issued', card, member.memberNo, { soldBy: 'presence' });
      return { card: cardBrief(card), replayed: false };
    });
  }

  async revokeBundle(body: unknown, ctx: BrandMemberContext) {
    this.requirePresence(ctx);
    const input = obj(body);
    const member = await memberByLocal(this.prisma, ctx, input.localUserId);
    const passRef = orderRefOf(input.passRef);
    const reason = optText(input.reason, 200) || '畅练卡退卡';
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.memberBrandCard.findUnique({
        where: { soldBy_orderRef: { soldBy: 'zc', orderRef: `zc-pass:${passRef}` } }
      });
      if (!card || card.memberId !== member.id) {
        throw new ApiError(404, '未找到该畅练卡附赠的会员资格', { code: 'CARD_NOT_FOUND' });
      }
      if (card.state === 'REFUNDED') return { card: cardBrief(card), replayed: true };
      const updated = await tx.memberBrandCard.update({
        where: { id: card.id },
        data: {
          state: 'REFUNDED',
          refundType: 'BUNDLE_REVOKED',
          refundCents: 0,
          refundedAt: new Date(),
          refundReason: reason
        }
      });
      await audit(tx, {
        actor: extActor(ctx),
        action: '撤销畅练卡附赠会员',
        target: member.memberNo,
        detail: `${passRef} · ${reason}`
      });
      await emitCardEvent(tx, 'brand_card.refunded', updated, member.memberNo, {
        refundType: 'BUNDLE_REVOKED',
        refundCents: 0,
        soldBy: 'presence'
      });
      return { card: cardBrief(updated), replayed: false };
    });
  }

  // ───────────────────────── 在场邀请好友 ─────────────────────────

  private async inviteQuota(memberId: string, now: Date) {
    const card = await cardActiveAt(this.prisma, memberId, now);
    const quota = card ? perksOf(card.perksJson).presence.invitesPerMonth : 0;
    const monthKey = monthKeyOf(now);
    const used = await this.prisma.memberInvite.count({
      where: { inviterId: memberId, monthKey, status: { not: 'VOID' } }
    });
    return { card, quota, used, remaining: Math.max(0, quota - used), monthKey };
  }

  async listInvites(query: unknown, ctx: BrandMemberContext) {
    this.requirePresence(ctx);
    const member = await memberByLocal(this.prisma, ctx, obj(query).localUserId);
    const now = new Date();
    const { quota, used, remaining, monthKey } = await this.inviteQuota(member.id, now);
    const rows = await this.prisma.memberInvite.findMany({
      where: { inviterId: member.id },
      orderBy: { createdAt: 'desc' },
      take: 30
    });
    return {
      monthKey,
      quota,
      used,
      remaining,
      invites: rows.map((row) => ({
        code: row.code,
        status: row.status,
        claimed: row.status === 'CLAIMED',
        createdAt: formatIso(row.createdAt),
        claimedAt: row.claimedAt ? formatIso(row.claimedAt) : null
      }))
    };
  }

  async createInvite(body: unknown, ctx: BrandMemberContext) {
    this.requirePresence(ctx);
    const member = await memberByLocal(this.prisma, ctx, obj(body).localUserId);
    const now = new Date();
    const { card, quota, used, monthKey } = await this.inviteQuota(member.id, now);
    if (!card) throw new ApiError(403, '邀请好友是品牌会员专属权益', { code: 'MEMBERS_ONLY' });
    if (used >= quota) {
      throw new ApiError(409, `本月 ${quota} 个邀请名额已用完，下月 1 日恢复`, {
        code: 'INVITE_QUOTA_EXCEEDED'
      });
    }
    let code = randomCode(10);
    for (let i = 0; i < 5 && (await this.prisma.memberInvite.findUnique({ where: { code } })); i += 1) {
      code = randomCode(10);
    }
    const row = await this.prisma.memberInvite.create({
      data: { id: newId('INV'), code, inviterId: member.id, business: 'zc', monthKey }
    });
    return {
      code: row.code,
      monthKey,
      quota,
      used: used + 1,
      remaining: Math.max(0, quota - used - 1),
      expiresAt: formatIso(addDays(row.createdAt, INVITE_TTL_DAYS))
    };
  }

  /**
   * 好友领取邀请：CRM 记录邀请关系与归因，免费体验课券由在场按返回结果发放。
   * 每位被邀请人只能领一次，邀请人不能自领。
   */
  async claimInvite(body: unknown, ctx: BrandMemberContext) {
    this.requirePresence(ctx);
    const input = obj(body);
    const invitee = await memberByLocal(this.prisma, ctx, input.localUserId);
    const code = optText(input.code, 16).toUpperCase();
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.memberInvite.findUnique({ where: { code } });
      if (!invite || invite.status === 'VOID') {
        throw new ApiError(404, '邀请不存在或已失效', { code: 'INVITE_INVALID' });
      }
      if (invite.status === 'CLAIMED') {
        if (invite.inviteeId === invitee.id) {
          return { claimed: true, replayed: true, voucher: this.inviteVoucher() };
        }
        throw new ApiError(409, '这份邀请已经被领取', { code: 'INVITE_USED' });
      }
      if (invite.inviterId === invitee.id) {
        throw new ApiError(409, '不能领取自己发出的邀请', { code: 'INVITE_SELF' });
      }
      if (now.getTime() > addDays(invite.createdAt, INVITE_TTL_DAYS).getTime()) {
        throw new ApiError(409, '邀请已过期', { code: 'INVITE_EXPIRED' });
      }
      const before = await tx.memberInvite.findFirst({ where: { inviteeId: invitee.id } });
      if (before) {
        throw new ApiError(409, '你已经领取过好友邀请的体验课', { code: 'INVITE_ALREADY_CLAIMED' });
      }
      const done = await tx.memberInvite.updateMany({
        where: { id: invite.id, status: 'ISSUED' },
        data: { status: 'CLAIMED', inviteeId: invitee.id, claimedAt: now }
      });
      if (done.count !== 1) throw new ApiError(409, '这份邀请已经被领取', { code: 'INVITE_USED' });
      const inviter = await tx.member.findUniqueOrThrow({ where: { id: invite.inviterId } });
      await audit(tx, {
        actor: extActor(ctx),
        action: '领取好友邀请',
        target: invitee.memberNo,
        detail: `${code} · 邀请人 ${inviter.memberNo}`
      });
      return { claimed: true, replayed: false, voucher: this.inviteVoucher() };
    });
  }

  private inviteVoucher() {
    return { kind: 'PRESENCE_FREE_CLASS', title: '在场 · 免费体验课 1 节', issuer: 'presence' };
  }

  // ───────────────────────── 会员 360：净消费 ─────────────────────────

  async memberProgram(memberId: string, staff: StaffContext) {
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw notFound('会员不存在');
    const grouped = await this.prisma.memberOrder.groupBy({
      by: ['business'],
      where: { memberId },
      _sum: { paidCents: true, savedCents: true },
      _count: { _all: true }
    });
    const orders = await this.prisma.memberOrder.findMany({
      where: { memberId },
      orderBy: { occurredAt: 'desc' },
      take: 30
    });
    const vouchers = await this.prisma.pickupVoucher.findMany({
      where: { memberId },
      orderBy: { issuedAt: 'desc' }
    });
    const claims = await this.prisma.giftClaim.findMany({
      where: { memberId },
      include: { campaign: true },
      orderBy: { claimedAt: 'desc' }
    });
    const invites = await this.prisma.memberInvite.findMany({
      where: { OR: [{ inviterId: memberId }, { inviteeId: memberId }] },
      orderBy: { createdAt: 'desc' },
      take: 30
    });
    const cards = await this.prisma.memberBrandCard.findMany({
      where: { memberId },
      orderBy: { validUntil: 'desc' }
    });
    const quotes = [];
    for (const card of cards.filter((c) => ['PAID', 'MANUAL'].includes(c.source))) {
      quotes.push(await refundQuote(this.prisma, card));
    }
    const byBusiness = grouped.map((row) => ({
      business: row.business,
      businessName: businessName(row.business as Business),
      netPaidCents: row._sum.paidCents || 0,
      savedCents: row._sum.savedCents || 0,
      count: row._count._all
    }));
    return {
      totals: {
        netPaidCents: byBusiness.reduce((s, r) => s + r.netPaidCents, 0),
        savedCents: byBusiness.reduce((s, r) => s + r.savedCents, 0)
      },
      byBusiness,
      orders: orders.map((row) => ({
        business: row.business,
        businessName: businessName(row.business as Business),
        orderRef: row.orderRef,
        kind: row.kind,
        paidCents: row.paidCents,
        savedCents: row.savedCents,
        brandMember: Boolean(row.cardId),
        occurredAt: formatIso(row.occurredAt)
      })),
      vouchers: vouchers.map(voucherView),
      gifts: claims.map((claim) => ({
        code: claim.campaign.code,
        name: claim.campaign.name,
        channelTag: claim.campaign.channelTag,
        referrerName: claim.campaign.referrerName,
        days: claim.campaign.days,
        claimedAt: formatIso(claim.claimedAt)
      })),
      invites: invites.map((row) => ({
        code: row.code,
        role: row.inviterId === memberId ? 'INVITER' : 'INVITEE',
        status: row.status,
        createdAt: formatIso(row.createdAt)
      })),
      cards: cards.map((card) => ({
        ...cardBrief(card),
        paidCents: card.paidCents,
        refundType: card.refundType,
        refundCents: card.refundCents
      })),
      refundQuotes: quotes,
      canForceRefund: hasPerm(staff, 'crm:refund:force')
    };
  }
}
