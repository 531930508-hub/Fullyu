import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  GAME_CHEST_STATIONS,
  GAME_STATIONS,
  diceProgress,
  diceRefundCarry,
  diceWithCarry,
  fromExternalBusiness,
  generateBoard,
  lapTier,
  pointExpireAt,
  toExternalBusiness,
  type BoardCell,
  type Business,
  type DiceRule
} from '@fullyu/crm-shared';
import type { Member, MemberGameState, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { audit } from '../common/audit';
import { ApiError, badRequest, conflict, notFound } from '../common/errors';
import { newId } from '../common/ids';
import type { StaffContext } from '../common/auth.types';
import type { BrandMemberContext } from '../brand-member/brand-member.guard';
import { RulesService } from './rules.service';

const TZ_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 86400000;
const LOCAL_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const REF = /^[A-Za-z0-9._:-]{1,80}$/;

const shanghaiDayStart = (at: Date): Date => {
  const local = new Date(at.getTime() + TZ_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_MS
  );
};

const shanghaiDate = (at: Date): string =>
  new Date(at.getTime() + TZ_MS).toISOString().slice(0, 10);

const shanghaiMonthKey = (at: Date): string =>
  new Date(at.getTime() + TZ_MS).toISOString().slice(0, 7);

const shanghaiMonthStart = (at: Date): Date => {
  const local = new Date(at.getTime() + TZ_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - TZ_MS);
};

const parseBoard = (raw: string): BoardCell[] => {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as BoardCell[]) : [];
  } catch {
    return [];
  }
};

const formatIso = (at: Date): string => {
  const local = new Date(at.getTime() + TZ_MS);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}+08:00`
  );
};

const parseBody = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

const requireText = (value: unknown, field: string, max = 100): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw badRequest(`缺少 ${field}`);
  if (text.length > max) throw badRequest(`${field} 过长`);
  return text;
};

export type EarnInput = {
  business?: string;
  localUserId?: string;
  kind?: string;
  orderRef?: string;
  paidCents?: number;
  occurredAt?: string;
};

export type RollInput = { business?: string; localUserId?: string };
export type RefundInput = {
  business?: string;
  localUserId?: string;
  orderRef?: string;
  /** 本次新增退款金额（分）；不传按整单退款。外部部分退款时传本次增量。 */
  refundCents?: number;
  /** 本次退款事件号；同一事件重试传相同值，避免重复扣骰。 */
  refundRef?: string;
};

/**
 * 骰子账本：
 * - 订单按「业务 + 订单号」幂等，签到按「会员 + 日期」幂等；
 * - 实付每满 centsPerDie 得 1 颗，不设单笔/每月上限；
 * - 退款按金额回收骰子，允许余额为负，后续消费先补回负数；
 * - 掷骰为条件扣减，礼物站生成待领礼物，到店人工确认一次。
 */
@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService
  ) {}

  protected nextDie(): number {
    return randomInt(1, 7);
  }

  /** 棋盘布局随机源，返回 [0,1)；测试可覆盖。 */
  protected rng(): number {
    return randomInt(0, 2 ** 30) / 2 ** 30;
  }

  async earn(body: EarnInput, ctx: BrandMemberContext) {
    const input = parseBody(body);
    const business = this.businessOf(input.business, ctx);
    const member = await this.findMember(input.localUserId, ctx);
    const kind = input.kind === 'checkin' ? 'EARN_CHECKIN' : input.kind === 'order' ? 'EARN_ORDER' : '';
    if (!kind) throw badRequest('kind 只能是 order 或 checkin');
    const now = new Date();
    await this.requireActiveCard(member.id, now);

    if (kind === 'EARN_ORDER') {
      const ref = requireText(input.orderRef, 'orderRef', 80);
      if (!REF.test(ref)) throw badRequest('orderRef 只能包含字母、数字与 . _ : -');
      const value = input.paidCents;
      if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > 10_000_000) {
        throw badRequest('paidCents 必须是 1–10000000 的整数（分）');
      }
      return this.earnOrderForMember(member.id, business, ref, value as number, now);
    }
    return this.earnCheckin(member.id, business, now);
  }

  /**
   * 订单得骰（实付已扣除全部优惠）：与上次不足 1 颗的结转金额合并后取整。
   * 不设单笔、每月上限；余额可能为负，新得的骰子先补回负数。
   */
  async earnOrderForMember(
    memberId: string,
    business: Business,
    ref: string,
    paidCents: number,
    now = new Date()
  ) {
    const { rule, version } = await this.rules.currentDice();
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.diceLedger.findUnique({
        where: {
          memberId_business_kind_ref: { memberId, business, kind: 'EARN_ORDER', ref }
        }
      });
      const state = await this.stateOf(tx, memberId, now);
      if (prior) {
        return {
          dice: prior.delta,
          balance: state.diceBalance,
          monthlyEarned: state.monthlyEarned,
          carryCents: state.spendCarryCents,
          capped: false,
          replayed: true,
          progress: diceProgress(rule, state.spendCarryCents, {}, state.diceBalance)
        };
      }
      const calc = diceWithCarry(rule, state.spendCarryCents, paidCents);
      const dice = calc.dice;
      const carryCents = calc.carryCents;
      const balance = state.diceBalance + dice;
      const updated = await tx.memberGameState.updateMany({
        where: { memberId, stateVersion: state.stateVersion },
        data: {
          diceBalance: { increment: dice },
          monthlyEarned: { increment: dice },
          spendCarryCents: carryCents,
          stateVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        throw conflict('骰子状态已被其他操作更新，请重试', { code: 'STATE_CONFLICT' });
      }
      await tx.diceLedger.create({
        data: {
          id: newId('DL'),
          memberId,
          business,
          kind: 'EARN_ORDER',
          ref,
          delta: dice,
          balanceAfter: balance,
          ruleVersion: version,
          paidCents,
          rawDice: calc.raw,
          note: `订单实付 ${paidCents} 分，累计结转后剩 ${carryCents} 分`
        }
      });
      return {
        dice,
        balance,
        monthlyEarned: state.monthlyEarned + dice,
        carryCents,
        capped: false,
        replayed: false,
        progress: diceProgress(rule, carryCents, {}, balance)
      };
    });
  }

  private async earnCheckin(memberId: string, business: Business, now: Date) {
    const { rule, version } = await this.rules.currentDice();
    const ref = shanghaiDate(now);
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.diceLedger.findUnique({
        where: {
          memberId_business_kind_ref: { memberId, business, kind: 'EARN_CHECKIN', ref }
        }
      });
      const state = await this.stateOf(tx, memberId, now);
      if (prior) {
        return {
          dice: prior.delta,
          balance: state.diceBalance,
          monthlyEarned: state.monthlyEarned,
          carryCents: state.spendCarryCents,
          capped: false,
          replayed: true,
          progress: diceProgress(rule, state.spendCarryCents, {}, state.diceBalance)
        };
      }
      const dice = rule.checkinDaily;
      const balance = state.diceBalance + dice;
      const updated = await tx.memberGameState.updateMany({
        where: { memberId, stateVersion: state.stateVersion },
        data: {
          diceBalance: { increment: dice },
          monthlyEarned: { increment: dice },
          stateVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        throw conflict('骰子状态已被其他操作更新，请重试', { code: 'STATE_CONFLICT' });
      }
      await tx.diceLedger.create({
        data: {
          id: newId('DL'),
          memberId,
          business,
          kind: 'EARN_CHECKIN',
          ref,
          delta: dice,
          balanceAfter: balance,
          ruleVersion: version,
          note: '每日签到'
        }
      });
      return {
        dice,
        balance,
        monthlyEarned: state.monthlyEarned + dice,
        carryCents: state.spendCarryCents,
        capped: false,
        replayed: false,
        progress: diceProgress(rule, state.spendCarryCents, {}, balance)
      };
    });
  }

  async refund(body: RefundInput, ctx: BrandMemberContext) {
    const input = parseBody(body);
    const business = this.businessOf(input.business, ctx);
    const member = await this.findMember(input.localUserId, ctx);
    const ref = requireText(input.orderRef, 'orderRef', 80);
    if (!REF.test(ref)) throw badRequest('orderRef 只能包含字母、数字与 . _ : -');
    let amount: number | undefined;
    if (input.refundCents !== undefined) {
      const value = input.refundCents;
      if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > 10_000_000) {
        throw badRequest('refundCents 必须是 1–10000000 的整数（分）');
      }
      amount = value as number;
    }
    const refundRef = input.refundRef === undefined ? undefined : requireText(input.refundRef, 'refundRef', 80);
    if (refundRef && !REF.test(refundRef)) {
      throw badRequest('refundRef 只能包含字母、数字与 . _ : -');
    }
    const result = await this.refundOrderForMember(
      member.id,
      business,
      ref,
      amount,
      refundRef
    );
    if (!result) throw notFound('该订单没有可收回的骰子', { code: 'DICE_EARN_NOT_FOUND' });
    return result;
  }

  /**
   * 订单退款收回骰子：退款金额直接从累计进度扣，每满一颗扣 1 颗；
   * 允许余额为负，负数会在后续消费中先补回，再得到新的可用骰子。
   * refundCents 为本次新增退款；不传按该单剩余可退金额处理。
   * 返回 null 表示该订单从未得骰（非品牌卡消费）。
   */
  async refundOrderForMember(
    memberId: string,
    business: Business,
    orderRef: string,
    refundCents?: number,
    ledgerRef?: string
  ) {
    const now = new Date();
    const { rule } = await this.rules.currentDice();
    return this.prisma.$transaction(async (tx) => {
      const state = await this.stateOf(tx, memberId, now);
      const earned = await tx.diceLedger.findUnique({
        where: {
          memberId_business_kind_ref: { memberId, business, kind: 'EARN_ORDER', ref: orderRef }
        }
      });
      if (!earned) return null;
      const prefix = `${orderRef}:refund:`;
      const refunded = await tx.diceLedger.aggregate({
        where: {
          memberId,
          business,
          kind: 'REFUND',
          OR: [{ ref: orderRef }, { ref: { startsWith: prefix } }]
        },
        _sum: { paidCents: true }
      });
      const already = Math.max(0, -(refunded._sum.paidCents || 0));
      const remaining = Math.max(0, earned.paidCents - already);
      const ref =
        ledgerRef ||
        (refundCents === undefined
          ? `${prefix}full`
          : `${prefix}${already + refundCents}`);
      const prior = await tx.diceLedger.findUnique({
        where: { memberId_business_kind_ref: { memberId, business, kind: 'REFUND', ref } }
      });
      if (prior) {
        return {
          reclaimed: 0,
          diceDelta: 0,
          balance: state.diceBalance,
          carryCents: state.spendCarryCents,
          replayed: true,
          progress: diceProgress(rule, state.spendCarryCents, {}, state.diceBalance)
        };
      }
      const amount = refundCents ?? remaining;
      if (!Number.isInteger(amount) || amount <= 0) {
        throw badRequest('本次退款金额必须大于 0');
      }
      if (amount > remaining) {
        throw badRequest('退款金额不能超过该单剩余可退金额');
      }
      const back = diceRefundCarry(rule, state.spendCarryCents, amount);
      const diceDelta = back.diceDelta;
      const balance = state.diceBalance + diceDelta;
      const updated = await tx.memberGameState.updateMany({
        where: { memberId, stateVersion: state.stateVersion },
        data: {
          diceBalance: { increment: diceDelta },
          spendCarryCents: back.carryCents,
          stateVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        throw conflict('骰子状态已被其他操作更新，请重试', { code: 'STATE_CONFLICT' });
      }
      await tx.diceLedger.create({
        data: {
          id: newId('DL'),
          memberId,
          business,
          kind: 'REFUND',
          ref,
          delta: diceDelta,
          balanceAfter: balance,
          paidCents: -amount,
          rawDice: diceDelta,
          note: `退款 ${amount} 分，按每颗 ${rule.centsPerDie} 分回收；累计已退 ${already + amount} 分`
        }
      });
      return {
        reclaimed: -diceDelta,
        diceDelta,
        balance,
        carryCents: back.carryCents,
        replayed: false,
        progress: diceProgress(rule, back.carryCents, {}, balance)
      };
    });
  }

  async roll(body: RollInput, ctx: BrandMemberContext, idempotencyKey?: string | null) {
    const input = parseBody(body);
    const business = this.businessOf(input.business, ctx);
    const member = await this.findMember(input.localUserId, ctx);
    return this.rollForMember(member.id, business, ctx.keyId, idempotencyKey);
  }

  /** 已确认会员身份的掷骰；供游戏票据换取的短期会话复用。 */
  async rollForMember(
    memberId: string,
    business: Business,
    keyId: string,
    idempotencyKey?: string | null
  ) {
    const now = new Date();
    await this.requireActiveCard(memberId, now);
    const idem = (idempotencyKey || '').trim() || null;

    if (idem) {
      const prior = await this.prisma.gameRoll.findUnique({ where: { idemKey: idem } });
      if (prior) {
        if (prior.memberId !== memberId) {
          throw conflict('幂等键已用于其他会员', { code: 'IDEMPOTENCY_CONFLICT' });
        }
        return this.replayRoll(prior, memberId, now);
      }
    }

    const { rule } = await this.rules.currentDice();
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const state = await this.stateOf(tx, memberId, now);
        if (state.diceBalance < 1) {
          throw new ApiError(403, '骰子不足，消费后即可获得游戏机会', { code: 'NO_DICE' });
        }
        const die = this.nextDie();
        const total = state.station + die;
        const toStation = total % GAME_STATIONS.length;
        const toLap = state.lap + Math.floor(total / GAME_STATIONS.length);
        const balance = state.diceBalance - 1;
        // 落点奖励取「到达圈」的棋盘：换圈即生成新一圈布局。
        const board =
          state.boardLap === toLap && state.boardJson
            ? parseBoard(state.boardJson)
            : await this.buildBoard(tx, memberId, rule, toLap, now);
        const claimed = await tx.memberGameState.updateMany({
          where: { memberId, diceBalance: { gte: 1 }, stateVersion: state.stateVersion },
          data: {
            diceBalance: { decrement: 1 },
            station: toStation,
            lap: toLap,
            boardJson: JSON.stringify(board),
            boardLap: toLap,
            stateVersion: { increment: 1 }
          }
        });
        if (claimed.count !== 1) {
          throw new ApiError(403, '骰子不足或状态已变化，请重试', { code: 'NO_DICE' });
        }
        const cell = board.find((item) => item.station === toStation);
        const voucher =
          cell && cell.kind === 'voucher' ? rule.prizes[cell.prizeIndex] || null : null;
        const points = voucher
          ? 0
          : cell && cell.kind === 'points'
            ? cell.points
            : lapTier(rule, toLap).pointsMin;
        const rollId = newId('GR');
        const rollRow = await tx.gameRoll.create({
          data: {
            id: rollId,
            memberId,
            business,
            keyId,
            idemKey: idem,
            dice: die,
            fromStation: state.station,
            toStation,
            fromLap: state.lap,
            toLap,
            points
          }
        });
        await tx.diceLedger.create({
          data: {
            id: newId('DL'),
            memberId,
            business,
            kind: 'ROLL',
            ref: rollId,
            delta: -1,
            balanceAfter: balance,
            note: `掷出 ${die} 点`
          }
        });
        let prize: {
          id: string;
          name: string;
          station: number;
          status: string;
          expiresAt: string;
        } | null = null;
        if (voucher) {
          const expiresAt = new Date(now.getTime() + voucher.validityDays * DAY_MS);
          const prizeId = newId('PZ');
          const row = await tx.gamePrize.create({
            data: {
              id: prizeId,
              memberId,
              rollId,
              station: toStation,
              name: voucher.name,
              business: voucher.business,
              faceCents: voucher.faceCents,
              status: 'PENDING',
              wonAt: now,
              expiresAt
            }
          });
          await tx.gameRoll.update({ where: { id: rollId }, data: { prizeId } });
          rollRow.prizeId = prizeId;
          prize = {
            id: row.id,
            name: row.name,
            station: row.station,
            status: row.status,
            expiresAt: formatIso(row.expiresAt)
          };
        } else if (points > 0) {
          await this.creditGamePoints(tx, memberId, points, rollId, toLap, toStation, now);
        }
        return { rollRow, prize, points, balance, board, pending: await this.pendingCount(memberId, now, tx) };
      });
      return {
        ...this.rollView(result.rollRow, result.pending),
        balance: result.balance,
        points: result.points,
        prize: result.prize,
        board: { lap: result.rollRow.toLap, cells: result.board }
      };
    } catch (error) {
      if (idem && (error as { code?: string }).code === 'P2002') {
        const prior = await this.prisma.gameRoll.findUnique({ where: { idemKey: idem } });
        if (prior) return this.replayRoll(prior, memberId, now);
      }
      throw error;
    }
  }

  private async replayRoll(
    prior: Parameters<GameService['rollView']>[0] & { points: number },
    memberId: string,
    now: Date
  ) {
    const state = await this.ensureState(memberId, now);
    return {
      ...this.rollView(prior, await this.pendingCount(memberId, now)),
      balance: state.diceBalance,
      points: prior.points,
      prize: null,
      replayed: true
    };
  }

  /** 积分格：发放一批品牌积分（发放方记为 hq），流水幂等键绑定掷骰记录。 */
  private async creditGamePoints(
    tx: Prisma.TransactionClient,
    memberId: string,
    points: number,
    rollId: string,
    lap: number,
    station: number,
    now: Date
  ) {
    await tx.pointBatch.create({
      data: {
        id: newId('PB'),
        memberId,
        issuerBusiness: 'hq',
        sourceRef: `game:${rollId}`,
        amount: points,
        remaining: points,
        status: 'ACTIVE',
        earnedAt: now,
        expireAt: pointExpireAt(now)
      }
    });
    const sum = await tx.pointBatch.aggregate({
      where: { memberId, status: 'ACTIVE', expireAt: { gt: now } },
      _sum: { remaining: true }
    });
    await tx.pointLedger.create({
      data: {
        id: newId('PL'),
        memberId,
        type: 'GAME',
        delta: points,
        balanceAfter: sum._sum.remaining || 0,
        business: 'hq',
        ref: rollId,
        idemKey: `game:${rollId}`,
        note: `愈行之旅第 ${lap + 1} 圈 · ${GAME_STATIONS[station] || ''}`
      }
    });
  }

  /**
   * 生成一圈棋盘。个性化：按会员各业态实付占比提高少去业态的体验券权重；
   * 门槛：轻疗等高价值券需累计得骰数达标；本月体验券面值已达预算时本圈只放积分。
   */
  private async buildBoard(
    tx: Prisma.TransactionClient,
    memberId: string,
    rule: DiceRule,
    lap: number,
    now: Date
  ): Promise<BoardCell[]> {
    const lifetime = await tx.diceLedger.aggregate({
      where: { memberId, kind: { in: ['EARN_ORDER', 'EARN_CHECKIN', 'REFUND', 'ADJUST'] } },
      _sum: { delta: true }
    });
    const lifetimeDice = Math.max(0, lifetime._sum.delta || 0);
    const share = await this.businessShare(tx, memberId);
    const monthStart = shanghaiMonthStart(now);
    const spent = await tx.gamePrize.aggregate({
      where: { wonAt: { gte: monthStart } },
      _sum: { faceCents: true }
    });
    const overBudget =
      rule.chestBudgetCents > 0 && (spent._sum.faceCents || 0) >= rule.chestBudgetCents;
    const effective = overBudget
      ? { ...rule, laps: rule.laps.map((tier) => ({ ...tier, voucherSlots: 0 })) }
      : rule;
    return generateBoard(effective, lap, lifetimeDice, share, () => this.rng());
  }

  /** 会员各业态实付占比：优先用消费账本，没有时用得骰流水里的实付。 */
  private async businessShare(
    tx: Prisma.TransactionClient,
    memberId: string
  ): Promise<Partial<Record<Business, number>>> {
    const orders = await tx.memberOrder.groupBy({
      by: ['business'],
      where: { memberId },
      _sum: { paidCents: true }
    });
    let rows = orders.map((row) => ({ business: row.business, paid: row._sum.paidCents || 0 }));
    if (!rows.some((row) => row.paid > 0)) {
      const ledger = await tx.diceLedger.groupBy({
        by: ['business'],
        where: { memberId, kind: { in: ['EARN_ORDER', 'REFUND'] } },
        _sum: { paidCents: true }
      });
      rows = ledger.map((row) => ({ business: row.business, paid: row._sum.paidCents || 0 }));
    }
    const total = rows.reduce((sum, row) => sum + Math.max(0, row.paid), 0);
    const share: Partial<Record<Business, number>> = {};
    if (total <= 0) return share;
    for (const row of rows) {
      if (row.business === 'sx' || row.business === 'ql' || row.business === 'zc') {
        share[row.business] = Math.max(0, row.paid) / total;
      }
    }
    return share;
  }

  /** 进度条：距下一颗骰子还差多少，以及按差额给出的跨业态建议。 */
  async progressForMember(memberId: string, now = new Date()) {
    const { rule } = await this.rules.currentDice();
    const state = await this.prisma.memberGameState.findUnique({ where: { memberId } });
    const last = await this.prisma.memberOrder.groupBy({
      by: ['business'],
      where: { memberId, kind: 'ORDER' },
      _max: { occurredAt: true }
    });
    const daysSince: Partial<Record<Business, number | null>> = {};
    for (const row of last) {
      if (row._max.occurredAt && (row.business === 'sx' || row.business === 'ql' || row.business === 'zc')) {
        daysSince[row.business] = Math.floor((now.getTime() - row._max.occurredAt.getTime()) / DAY_MS);
      }
    }
    for (const key of ['sx', 'ql', 'zc'] as const) if (!(key in daysSince)) daysSince[key] = null;
    return diceProgress(rule, state?.spendCarryCents ?? 0, daysSince, state?.diceBalance ?? 0);
  }

  async session(query: { business?: string; localUserId?: string }, ctx: BrandMemberContext) {
    const input = parseBody(query);
    const business = this.businessOf(input.business, ctx);
    const member = await this.findMember(input.localUserId, ctx);
    return this.sessionForMember(member.id, business);
  }

  /** 已确认会员身份的会话读取；供游戏票据换取的短期会话复用。 */
  async sessionForMember(memberId: string, business: Business) {
    const now = new Date();
    await this.requireActiveCard(memberId, now);
    const member = await this.prisma.member.findUniqueOrThrow({ where: { id: memberId } });
    const { rule } = await this.rules.currentDice();
    const state = await this.ensureBoardState(memberId, rule, now);
    await this.expirePrizes(memberId, now);
    const ledger = await this.prisma.diceLedger.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      take: 30
    });
    const prizes = await this.prisma.gamePrize.findMany({
      where: { memberId },
      orderBy: { wonAt: 'desc' },
      take: 50
    });
    return {
      member: { memberNo: member.memberNo, name: member.name },
      business: toExternalBusiness(business),
      board: {
        stations: GAME_STATIONS,
        chestStations: GAME_CHEST_STATIONS,
        lapLength: GAME_STATIONS.length,
        lap: state.boardLap,
        cells: parseBoard(state.boardJson)
      },
      rule: {
        centsPerDie: rule.centsPerDie,
        checkinDaily: rule.checkinDaily,
        guestPlay: rule.guestPlay
      },
      progress: await this.progressForMember(memberId, now),
      dice: {
        balance: state.diceBalance,
        station: state.station,
        lap: state.lap,
        monthlyEarned: state.monthlyEarned,
        monthKey: state.monthKey
      },
      ledger: ledger.map((row) => ({
        id: row.id,
        at: formatIso(row.createdAt),
        kind: row.kind,
        business: toExternalBusiness(row.business) || row.business,
        ref: row.ref,
        delta: row.delta,
        balance: row.balanceAfter
      })),
      prizes: prizes.map((row) => this.prizeView(row)),
      updatedAt: formatIso(now)
    };
  }

  async listPrizes(status?: string) {
    await this.expirePrizesAll();
    const where =
      status && ['PENDING', 'COLLECTED', 'EXPIRED'].includes(status) ? { status } : {};
    const rows = await this.prisma.gamePrize.findMany({
      where,
      orderBy: [{ status: 'asc' }, { wonAt: 'desc' }],
      take: 200
    });
    const members = await this.prisma.member.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.memberId))] } }
    });
    const byId = new Map(members.map((member) => [member.id, member]));
    return {
      prizes: rows.map((row) => ({
        ...this.prizeView(row),
        memberNo: byId.get(row.memberId)?.memberNo || '',
        memberName: byId.get(row.memberId)?.name || ''
      }))
    };
  }

  async collectPrize(id: string, note: string, staff: StaffContext) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const prize = await tx.gamePrize.findUnique({ where: { id } });
      if (!prize) throw notFound('礼物不存在');
      if (prize.status === 'COLLECTED') {
        throw new ApiError(409, '该礼物已确认交付', { code: 'PRIZE_ALREADY_COLLECTED' });
      }
      if (prize.status === 'EXPIRED' || prize.expiresAt.getTime() <= now.getTime()) {
        if (prize.status !== 'EXPIRED') {
          await tx.gamePrize.update({ where: { id }, data: { status: 'EXPIRED' } });
        }
        throw new ApiError(409, '该礼物已过期，不能领取', { code: 'PRIZE_EXPIRED' });
      }
      const changed = await tx.gamePrize.updateMany({
        where: { id, status: 'PENDING', expiresAt: { gt: now } },
        data: {
          status: 'COLLECTED',
          collectedAt: now,
          collectedBy: staff.id,
          collectedByName: staff.name,
          note
        }
      });
      if (changed.count !== 1) {
        throw new ApiError(409, '礼物状态已变化，请刷新后重试', {
          code: 'PRIZE_ALREADY_COLLECTED'
        });
      }
      const member = await tx.member.findUnique({ where: { id: prize.memberId } });
      await audit(tx, {
        actor: staff,
        action: '礼物人工交付',
        target: member?.memberNo || prize.memberId,
        detail: `${prize.name} · ${prize.id}${note ? ` · ${note}` : ''}`
      });
      const updated = await tx.gamePrize.findUniqueOrThrow({ where: { id } });
      return this.prizeView(updated);
    });
  }

  async pendingCount(
    memberId: string,
    now = new Date(),
    db: Pick<Prisma.TransactionClient, 'gamePrize'> = this.prisma
  ) {
    return db.gamePrize.count({
      where: { memberId, status: 'PENDING', expiresAt: { gt: now } }
    });
  }

  async summaryForMember(memberId: string) {
    const now = new Date();
    await this.expirePrizes(memberId, now);
    const state = await this.prisma.memberGameState.findUnique({ where: { memberId } });
    return {
      balance: state?.diceBalance ?? 0,
      station: state?.station ?? 0,
      lap: state?.lap ?? 0,
      monthlyEarned: state?.monthlyEarned ?? 0,
      pendingPrizes: await this.pendingCount(memberId, now),
      progress: await this.progressForMember(memberId, now)
    };
  }

  private async requireActiveCard(memberId: string, now: Date) {
    const card = await this.prisma.memberBrandCard.findFirst({
      where: {
        memberId,
        state: { in: ['ACTIVE', 'PENDING'] },
        validFrom: { lte: now },
        validUntil: { gte: shanghaiDayStart(now) }
      },
      orderBy: { validUntil: 'desc' }
    });
    if (!card || !card.gameEnabled) {
      throw new ApiError(403, '开通有效品牌卡后才能进入愈行之旅', {
        code: 'GAME_UNAVAILABLE'
      });
    }
    return card;
  }

  /** 会话读取时补齐当前圈棋盘，保证会员进入即能看到每站奖励。 */
  private async ensureBoardState(memberId: string, rule: DiceRule, now: Date) {
    const state = await this.ensureState(memberId, now);
    if (state.boardLap === state.lap && state.boardJson) return state;
    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.memberGameState.findUniqueOrThrow({ where: { memberId } });
      if (fresh.boardLap === fresh.lap && fresh.boardJson) return fresh;
      const board = await this.buildBoard(tx, memberId, rule, fresh.lap, now);
      const changed = await tx.memberGameState.updateMany({
        where: { memberId, stateVersion: fresh.stateVersion },
        data: {
          boardJson: JSON.stringify(board),
          boardLap: fresh.lap,
          stateVersion: { increment: 1 }
        }
      });
      if (changed.count !== 1) return tx.memberGameState.findUniqueOrThrow({ where: { memberId } });
      return { ...fresh, boardJson: JSON.stringify(board), boardLap: fresh.lap };
    });
  }

  private async ensureState(memberId: string, now: Date) {
    const state = await this.prisma.memberGameState.findUnique({ where: { memberId } });
    if (state) return state;
    return this.prisma.memberGameState.create({
      data: { memberId, monthKey: shanghaiMonthKey(now) }
    });
  }

  private async stateOf(
    tx: Prisma.TransactionClient,
    memberId: string,
    now: Date
  ): Promise<MemberGameState> {
    const monthKey = shanghaiMonthKey(now);
    let state = await tx.memberGameState.findUnique({ where: { memberId } });
    if (!state) {
      state = await tx.memberGameState.create({ data: { memberId, monthKey } });
    }
    if (state.monthKey !== monthKey) {
      state = await tx.memberGameState.update({
        where: { memberId },
        data: { monthKey, monthlyEarned: 0, stateVersion: { increment: 1 } }
      });
    }
    return state;
  }

  private rollView(
    row: {
      id: string;
      dice: number;
      fromStation: number;
      toStation: number;
      fromLap: number;
      toLap: number;
      prizeId: string | null;
      createdAt: Date;
    },
    pending: number
  ) {
    return {
      rollId: row.id,
      dice: row.dice,
      fromStation: row.fromStation,
      station: row.toStation,
      fromLap: row.fromLap,
      lap: row.toLap,
      stationName: GAME_STATIONS[row.toStation] || '',
      prizeId: row.prizeId,
      prizesPending: pending,
      at: formatIso(row.createdAt)
    };
  }

  private prizeView(row: {
    id: string;
    station: number;
    name: string;
    business: string;
    status: string;
    wonAt: Date;
    expiresAt: Date;
    collectedAt: Date | null;
    collectedByName: string | null;
    note: string;
  }) {
    return {
      id: row.id,
      station: row.station,
      stationName: GAME_STATIONS[row.station] || '',
      name: row.name,
      business: toExternalBusiness(row.business) || row.business,
      status: row.status,
      wonAt: formatIso(row.wonAt),
      expiresAt: formatIso(row.expiresAt),
      collectedAt: row.collectedAt ? formatIso(row.collectedAt) : null,
      collectedByName: row.collectedByName,
      note: row.note
    };
  }

  private async expirePrizes(memberId: string, now: Date) {
    await this.prisma.gamePrize.updateMany({
      where: { memberId, status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' }
    });
  }

  private async expirePrizesAll() {
    await this.prisma.gamePrize.updateMany({
      where: { status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' }
    });
  }

  private businessOf(value: unknown, ctx: BrandMemberContext): Business {
    const fallback = toExternalBusiness(ctx.business) || '';
    const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    const business = fromExternalBusiness(raw);
    if (!business) throw badRequest('business 只能是 teahour / retreat / presence');
    if (business !== ctx.business) {
      throw new ApiError(403, '该密钥不能访问其他业务的数据', { code: 'BUSINESS_MISMATCH' });
    }
    return business;
  }

  private async findMember(localUserId: unknown, ctx: BrandMemberContext): Promise<Member> {
    const id = requireText(localUserId, 'localUserId', 64);
    if (!LOCAL_ID.test(id)) throw badRequest('localUserId 只能包含字母、数字与 . _ : -');
    const identity = await this.prisma.memberIdentity.findUnique({
      where: { business_localUserId: { business: ctx.business, localUserId: id } },
      include: { member: true }
    });
    if (!identity || identity.member.status !== 'ACTIVE') {
      throw new ApiError(404, '该用户尚未同步到 CRM 或不是有效会员', {
        code: 'MEMBER_NOT_FOUND'
      });
    }
    return identity.member;
  }
}
