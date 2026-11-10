import { randomInt } from 'node:crypto';
import type { Prisma, MemberBrandCard, Member } from '@prisma/client';
import { businessName } from '@fullyu/crm-shared';
import { ApiError, badRequest } from '../common/errors';
import { newId } from '../common/ids';
import { maskPhone } from '../common/phone';
import type { PrismaService } from '../common/prisma.service';

export { maskPhone };
import type { BrandMemberContext } from '../brand-member/brand-member.guard';

export const TZ_MS = 8 * 60 * 60 * 1000;
export const DAY_MS = 86400000;
export const REFUND_WINDOW_MS = 7 * DAY_MS;
const LOCAL_ID = /^[A-Za-z0-9._:-]{1,64}$/;
/** 去掉 0/O/1/I/L 等易混字符，方便门店口头核对。 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type Db = PrismaService | Prisma.TransactionClient;

export type GiftRow = { title: string; desc: string; valueCents: number };
export type PresencePerks = { prioritySeat: boolean; tierPrice: boolean; invitesPerMonth: number };
export type CardPerks = { presence: PresencePerks };

export const randomCode = (length = 8): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return out;
};

export const shanghaiDayStart = (at: Date): Date => {
  const local = new Date(at.getTime() + TZ_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_MS
  );
};

export const addDays = (at: Date, days: number): Date => new Date(at.getTime() + days * DAY_MS);

export const formatDate = (at: Date): string =>
  new Date(at.getTime() + TZ_MS).toISOString().slice(0, 10);

export const formatIso = (at: Date): string => {
  const local = new Date(at.getTime() + TZ_MS);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}+08:00`
  );
};

export const monthKeyOf = (at: Date): string => {
  const local = new Date(at.getTime() + TZ_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const yuan = (cents: number): string => {
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const readJson = (raw: string | null | undefined): unknown => {
  try {
    return JSON.parse(raw || 'null');
  } catch {
    return null;
  }
};

export const giftsOf = (raw: string | null | undefined): GiftRow[] => {
  const parsed = readJson(raw);
  if (!Array.isArray(parsed)) return [];
  const rows: GiftRow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!title) continue;
    const value = Number(row.valueCents);
    rows.push({
      title: title.slice(0, 40),
      desc: typeof row.desc === 'string' ? row.desc.trim().slice(0, 120) : '',
      valueCents: Number.isInteger(value) && value >= 0 ? value : 0
    });
  }
  return rows.slice(0, 10);
};

export const perksOf = (raw: string | null | undefined): CardPerks => {
  const parsed = readJson(raw);
  const source = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const presence =
    source.presence && typeof source.presence === 'object'
      ? (source.presence as Record<string, unknown>)
      : {};
  const invites = Number(presence.invitesPerMonth);
  return {
    presence: {
      prioritySeat: presence.prioritySeat === true,
      tierPrice: presence.tierPrice === true,
      invitesPerMonth: Number.isInteger(invites) && invites >= 0 && invites <= 20 ? invites : 0
    }
  };
};

/** 后台维护卡版本时校验实物礼与业态权益，返回规范化 JSON。 */
export const validateGifts = (value: unknown): string => {
  if (value === undefined || value === null) return '[]';
  if (!Array.isArray(value)) throw badRequest('gifts 必须是数组');
  if (value.length > 10) throw badRequest('实物礼最多 10 项');
  const rows = value.map((item, index) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!title || title.length > 40) throw badRequest(`第 ${index + 1} 项礼品名称需 1–40 字`);
    const valueCents = Number(row.valueCents ?? 0);
    if (!Number.isInteger(valueCents) || valueCents < 0 || valueCents > 1_000_000) {
      throw badRequest(`第 ${index + 1} 项礼品价值需为 0–1000000 分`);
    }
    const desc = typeof row.desc === 'string' ? row.desc.trim() : '';
    if (desc.length > 120) throw badRequest(`第 ${index + 1} 项礼品说明过长`);
    return { title, desc, valueCents };
  });
  return JSON.stringify(rows);
};

export const validatePerks = (value: unknown): string => {
  if (value === undefined || value === null) return JSON.stringify(perksOf('{}'));
  if (typeof value !== 'object') throw badRequest('perks 必须是对象');
  const presence = ((value as Record<string, unknown>).presence || {}) as Record<string, unknown>;
  const invites = Number(presence.invitesPerMonth ?? 0);
  if (!Number.isInteger(invites) || invites < 0 || invites > 20) {
    throw badRequest('每月邀请名额需为 0–20 的整数');
  }
  return JSON.stringify({
    presence: {
      prioritySeat: presence.prioritySeat === true,
      tierPrice: presence.tierPrice === true,
      invitesPerMonth: invites
    }
  });
};

export const requireLocalId = (value: unknown): string => {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) throw badRequest('缺少 localUserId');
  if (!LOCAL_ID.test(id)) throw badRequest('localUserId 只能包含字母、数字与 . _ : -');
  return id;
};

export async function memberByLocal(
  db: Db,
  ctx: BrandMemberContext,
  localUserId: unknown
): Promise<Member> {
  const id = requireLocalId(localUserId);
  const identity = await db.memberIdentity.findUnique({
    where: { business_localUserId: { business: ctx.business, localUserId: id } },
    include: { member: true }
  });
  if (!identity || identity.member.status !== 'ACTIVE') {
    throw new ApiError(404, '该用户尚未同步到 CRM 或不是有效会员', { code: 'MEMBER_NOT_FOUND' });
  }
  return identity.member;
}

/** 某一时刻生效的品牌卡（含已开始的 PENDING）；退款/锁定卡不算。 */
export async function cardActiveAt(db: Db, memberId: string, at: Date) {
  return db.memberBrandCard.findFirst({
    where: {
      memberId,
      state: { in: ['ACTIVE', 'PENDING'] },
      validFrom: { lte: at },
      validUntil: { gte: shanghaiDayStart(at) }
    },
    orderBy: { validUntil: 'desc' }
  });
}

/** 新卡接在会员最后一张有效卡之后；无有效卡则从当天开始。 */
export async function nextStart(db: Db, memberId: string, from: Date): Promise<Date> {
  const day = shanghaiDayStart(from);
  const latest = await db.memberBrandCard.findFirst({
    where: {
      memberId,
      state: { in: ['ACTIVE', 'PENDING', 'REFUND_LOCKED'] },
      validUntil: { gte: day }
    },
    orderBy: { validUntil: 'desc' }
  });
  return latest ? addDays(shanghaiDayStart(latest.validUntil), 1) : day;
}

/** 该卡期内会员权益带来的累计节省（订单节省减去退款冲回）。 */
export async function savedForCard(db: Db, cardId: string): Promise<number> {
  const sum = await db.memberOrder.aggregate({
    where: { cardId },
    _sum: { savedCents: true }
  });
  return Math.max(0, sum._sum.savedCents || 0);
}

export async function redeemedGiftCents(db: Db, cardId: string): Promise<number> {
  const sum = await db.pickupVoucher.aggregate({
    where: { cardId, status: 'REDEEMED' },
    _sum: { valueCents: true }
  });
  return sum._sum.valueCents || 0;
}

export type RefundQuote = {
  cardId: string;
  source: string;
  window: 'WITHIN_7D' | 'AFTER_7D';
  refundType: 'WITHIN_7D' | 'AFTER_7D';
  paidCents: number;
  savedCents: number;
  redeemedGiftCents: number;
  refundableCents: number;
  allowed: boolean;
  reasonCode: string | null;
  message: string;
  windowEndsAt: string;
};

/**
 * 退款规则（2026-11-08 会议）：
 * - 支付后 7 天内无理由退，退实付（已领取的实物礼按价值扣除）；
 * - 超过 7 天按「实付 − 已享会员优惠 − 已领实物礼」退，≤0 不能退并给出挽留文案；
 * - 赠送卡、附赠卡没有付款，不走退款；协商退款只在 CRM 后台单独处理。
 * - CRM 手工发卡若记录了线下实收（MANUAL），同样按上述规则计算；资金由财务线下退回。
 */
export async function refundQuote(db: Db, card: MemberBrandCard, now = new Date()): Promise<RefundQuote> {
  const windowEnds = new Date(card.paidAt.getTime() + REFUND_WINDOW_MS);
  const within = now.getTime() < windowEnds.getTime();
  const savedCents = await savedForCard(db, card.id);
  const gifts = await redeemedGiftCents(db, card.id);
  const window = within ? 'WITHIN_7D' : 'AFTER_7D';
  const base: Omit<RefundQuote, 'refundableCents' | 'allowed' | 'reasonCode' | 'message'> = {
    cardId: card.id,
    source: card.source,
    window,
    refundType: window,
    paidCents: card.paidCents,
    savedCents,
    redeemedGiftCents: gifts,
    windowEndsAt: formatIso(windowEnds)
  };
  if (!['PAID', 'MANUAL'].includes(card.source) || card.paidCents <= 0) {
    return {
      ...base,
      refundableCents: 0,
      allowed: false,
      reasonCode: 'CARD_NOT_REFUNDABLE',
      message: '赠送或附赠的会员资格无需退款'
    };
  }
  if (card.state === 'REFUNDED') {
    return {
      ...base,
      refundableCents: 0,
      allowed: false,
      reasonCode: 'ALREADY_REFUNDED',
      message: '该会员卡已退款'
    };
  }
  if (card.state === 'REFUND_LOCKED') {
    return {
      ...base,
      refundableCents: 0,
      allowed: false,
      reasonCode: 'CARD_NOT_REFUNDABLE',
      message: '该会员卡当前不能撤销，请联系工作人员核对'
    };
  }
  const refundable = within
    ? card.paidCents - gifts
    : card.paidCents - savedCents - gifts;
  if (refundable <= 0) {
    return {
      ...base,
      refundableCents: 0,
      allowed: false,
      reasonCode: 'REFUND_NOT_ALLOWED',
      message: `享受的优惠已超出，不能退款。这段时间你已经通过会员省下 ¥${yuan(savedCents + gifts)}，留着它，下次放松时继续用。`
    };
  }
  return {
    ...base,
    refundableCents: refundable,
    allowed: true,
    reasonCode: null,
    message: within
      ? gifts > 0
        ? `7 天内无理由退款，已领取的实物礼按 ¥${yuan(gifts)} 扣除，可退 ¥${yuan(refundable)}`
        : `7 天内无理由全额退款，可退 ¥${yuan(refundable)}`
      : `已超过 7 天，按实付扣除已享优惠 ¥${yuan(savedCents + gifts)} 后可退 ¥${yuan(refundable)}`
  };
}

/** 有实收的卡（付费开通 / CRM 手工发卡）按版本实物礼发放提货券；赠送卡/附赠卡不发。 */
export async function issuePickupVouchers(
  tx: Prisma.TransactionClient,
  card: MemberBrandCard,
  giftsJson: string | null | undefined
) {
  if (!['PAID', 'MANUAL'].includes(card.source) || card.paidCents <= 0) return [];
  const gifts = giftsOf(giftsJson);
  const created = [];
  for (const gift of gifts) {
    let code = randomCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await tx.pickupVoucher.findUnique({ where: { code } });
      if (!clash) break;
      code = randomCode();
    }
    created.push(
      await tx.pickupVoucher.create({
        data: {
          id: newId('PV'),
          code,
          memberId: card.memberId,
          cardId: card.id,
          title: gift.title,
          desc: gift.desc,
          valueCents: gift.valueCents
        }
      })
    );
  }
  return created;
}

export const voucherView = (voucher: {
  code: string;
  title: string;
  desc: string;
  valueCents: number;
  status: string;
  issuedAt: Date;
  redeemedAt: Date | null;
  redeemedStore: string;
}) => ({
  code: voucher.code,
  title: voucher.title,
  desc: voucher.desc,
  valueCents: voucher.valueCents,
  status: voucher.status,
  issuedAt: formatIso(voucher.issuedAt),
  redeemedAt: voucher.redeemedAt ? formatIso(voucher.redeemedAt) : null,
  redeemedStore: voucher.redeemedStore || null
});

/** 卡期变化按会员已绑定的业务写 outbox；未配置 webhook 的业务保持待投递。 */
export async function emitCardEvent(
  tx: Prisma.TransactionClient,
  topic: string,
  card: MemberBrandCard,
  memberNo: string,
  extra: Record<string, unknown> = {}
) {
  const payload = JSON.stringify({
    topic,
    cardId: card.id,
    memberNo,
    productCode: card.productCode,
    productName: card.productName,
    source: card.source,
    state: card.state,
    validFrom: formatDate(card.validFrom),
    validUntil: formatDate(card.validUntil),
    paidCents: card.paidCents,
    ...extra
  });
  const now = new Date();
  const identities = await tx.memberIdentity.findMany({ where: { memberId: card.memberId } });
  for (const identity of identities) {
    await tx.outboxEvent.create({
      data: {
        id: newId('OB'),
        topic,
        business: identity.business,
        memberId: card.memberId,
        payloadJson: payload,
        nextAttemptAt: now
      }
    });
  }
}

export const extActor = (ctx: BrandMemberContext) => ({
  id: `ext:${ctx.business}:${ctx.keyId}`,
  name: `${businessName(ctx.business)} 外部接口`
});
