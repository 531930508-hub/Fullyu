import { Injectable } from '@nestjs/common';
import {
  BUSINESSES,
  DEFAULT_DICE_RULE,
  DEFAULT_POINTS_RULES,
  GAME_CHEST_STATIONS,
  businessName,
  isBusiness,
  type DiceLapTier,
  type DicePrizeRule,
  type DiceRule,
  type PointsRule
} from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { audit } from '../common/audit';
import { ApiError, badRequest, conflict, notFound } from '../common/errors';
import { newId } from '../common/ids';
import type { StaffContext } from '../common/auth.types';

const TZ_MS = 8 * 60 * 60 * 1000;
const RULE_KEYS = ['points', 'dice'] as const;
type RuleKey = (typeof RULE_KEYS)[number];

const dayStart = (at: Date): Date => {
  const local = new Date(at.getTime() + TZ_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_MS
  );
};

const intIn = (value: unknown, min: number, max: number, field: string): number => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw badRequest(`${field} 必须是 ${min}–${max} 的整数`);
  }
  return value as number;
};

function validatePoints(raw: unknown): PointsRule {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rounding = value.rounding;
  if (rounding !== 'floor' && rounding !== 'round') {
    throw badRequest('rounding 只能是 floor 或 round');
  }
  const multiplier = value.cardMultiplier;
  if (
    typeof multiplier !== 'number' ||
    !Number.isFinite(multiplier) ||
    multiplier < 1 ||
    multiplier > 3
  ) {
    throw badRequest('cardMultiplier 必须是 1–3 的数字');
  }
  return {
    centsPerPoint: intIn(value.centsPerPoint, 1, 1_000_000, 'centsPerPoint'),
    rounding,
    cardMultiplier: Math.round(multiplier * 100) / 100,
    newMember: intIn(value.newMember, 0, 500, 'newMember'),
    holdTtlMinutes: intIn(value.holdTtlMinutes, 1, 240, 'holdTtlMinutes'),
    earnCoolingDays: intIn(value.earnCoolingDays, 0, 30, 'earnCoolingDays')
  };
}

function validateDice(raw: unknown): DiceRule {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (value.guestPlay !== 'yes' && value.guestPlay !== 'no') {
    throw badRequest('guestPlay 只能是 yes 或 no');
  }
  const rawPrizes = Array.isArray(value.prizes) ? value.prizes : [];
  if (rawPrizes.length < 1 || rawPrizes.length > 20) {
    throw badRequest('prizes 需要 1–20 条');
  }
  const prizes: DicePrizeRule[] = rawPrizes.map((item, index) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name || name.length > 60) throw badRequest(`prizes[${index}].name 不合法`);
    if (!isBusiness(row.business)) throw badRequest(`prizes[${index}].business 不合法`);
    return {
      name,
      business: row.business,
      validityDays: intIn(row.validityDays, 1, 365, `prizes[${index}].validityDays`),
      weight: intIn(row.weight, 1, 100, `prizes[${index}].weight`),
      minLap: intIn(row.minLap ?? 0, 0, 100, `prizes[${index}].minLap`),
      minLifetimeDice: intIn(row.minLifetimeDice ?? 0, 0, 10_000, `prizes[${index}].minLifetimeDice`),
      faceCents: intIn(row.faceCents ?? 0, 0, 1_000_000, `prizes[${index}].faceCents`)
    };
  });
  const rawLaps = Array.isArray(value.laps) && value.laps.length ? value.laps : DEFAULT_DICE_RULE.laps;
  if (rawLaps.length > 20) throw badRequest('laps 最多 20 档');
  const laps: DiceLapTier[] = rawLaps.map((item, index) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const pointsMin = intIn(row.pointsMin, 0, 1000, `laps[${index}].pointsMin`);
    const pointsMax = intIn(row.pointsMax, 0, 1000, `laps[${index}].pointsMax`);
    if (pointsMax < pointsMin) throw badRequest(`laps[${index}] 积分上限不能小于下限`);
    return {
      fromLap: intIn(row.fromLap, 0, 1000, `laps[${index}].fromLap`),
      pointsMin,
      pointsMax,
      voucherSlots: intIn(row.voucherSlots, 0, GAME_CHEST_STATIONS.length, `laps[${index}].voucherSlots`)
    };
  });
  laps.sort((a, b) => a.fromLap - b.fromLap);
  if (laps[0].fromLap !== 0) throw badRequest('laps 必须包含从第 0 圈开始的档位');
  if (new Set(laps.map((tier) => tier.fromLap)).size !== laps.length) {
    throw badRequest('laps 的 fromLap 不能重复');
  }
  const boost = value.diversifyBoost ?? DEFAULT_DICE_RULE.diversifyBoost;
  if (typeof boost !== 'number' || !Number.isFinite(boost) || boost < 0 || boost > 5) {
    throw badRequest('diversifyBoost 必须是 0–5 的数字');
  }
  // 2026-11-09 起不设单笔与每月上限；旧版本里残留的 perOrderCap/monthCap 读取时忽略。
  return {
    centsPerDie: intIn(value.centsPerDie, 1, 1_000_000, 'centsPerDie'),
    checkinDaily: intIn(value.checkinDaily, 0, 3, 'checkinDaily'),
    chestBudgetCents: intIn(value.chestBudgetCents, 0, 10_000_000, 'chestBudgetCents'),
    guestPlay: value.guestPlay,
    prizes,
    laps,
    diversifyBoost: Math.round(boost * 100) / 100
  };
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw || 'null');
  } catch {
    return null;
  }
};

/**
 * 规则版本：新版本必须晚于今天生效；读取时把到期版本自动切换为 CURRENT。
 * 历史版本只读，已发生的积分/骰子不追溯。
 */
@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    await this.syncDue();
    const rows = await this.prisma.ruleSetVersion.findMany({
      orderBy: [{ ruleKey: 'asc' }, { scope: 'asc' }, { version: 'desc' }]
    });
    const points: Record<string, unknown[]> = { sx: [], ql: [], zc: [] };
    const dice: Record<string, unknown[]> = { all: [] };
    for (const row of rows) {
      const view = this.view(row);
      if (row.ruleKey === 'points') {
        (points[row.scope] ||= []).push(view);
      } else if (row.ruleKey === 'dice') {
        (dice[row.scope] ||= []).push(view);
      }
    }
    return { points, dice };
  }

  async createVersion(
    key: string,
    body: Record<string, unknown>,
    staff: StaffContext
  ) {
    const ruleKey = this.ruleKey(key);
    const scope = this.scopeOf(ruleKey, body.scope);
    const effectiveFrom = this.parseEffective(body.effectiveFrom);
    if (dayStart(effectiveFrom) <= dayStart(new Date())) {
      throw new ApiError(400, '新版本生效日必须晚于今天', {
        code: 'EFFECTIVE_FROM_MUST_BE_FUTURE'
      });
    }
    const rules =
      ruleKey === 'points' ? validatePoints(body.rules) : validateDice(body.rules);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
    if (!reason) throw badRequest('请填写变更原因');

    await this.syncDue();
    const last = await this.prisma.ruleSetVersion.findFirst({
      where: { ruleKey, scope },
      orderBy: { version: 'desc' }
    });
    const version = (last?.version || 0) + 1;
    const scheduled = await this.prisma.ruleSetVersion.findFirst({
      where: { ruleKey, scope, status: 'SCHEDULED' }
    });
    if (scheduled) {
      throw conflict('已有待生效版本，请先撤销或等待生效', { code: 'SCHEDULED_EXISTS' });
    }
    const row = await this.prisma.ruleSetVersion.create({
      data: {
        id: newId('RV'),
        ruleKey,
        scope,
        version,
        status: 'SCHEDULED',
        effectiveFrom,
        rulesJson: JSON.stringify(rules),
        reason,
        createdBy: staff.id,
        createdByName: staff.name
      }
    });
    await audit(this.prisma, {
      actor: staff,
      action: '规则新版本',
      target: `${ruleKey}/${scope} v${version}`,
      detail: `${effectiveFrom.toISOString()} 生效 · ${reason}`
    });
    return this.view(row);
  }

  async cancelVersion(
    key: string,
    version: number,
    body: Record<string, unknown>,
    staff: StaffContext
  ) {
    const ruleKey = this.ruleKey(key);
    const scope = this.scopeOf(ruleKey, body.scope);
    const row = await this.prisma.ruleSetVersion.findUnique({
      where: { ruleKey_scope_version: { ruleKey, scope, version } }
    });
    if (!row) throw notFound('规则版本不存在');
    if (row.status !== 'SCHEDULED') {
      throw conflict('只有待生效版本可以撤销', { code: 'VERSION_NOT_SCHEDULED' });
    }
    const updated = await this.prisma.ruleSetVersion.update({
      where: { id: row.id },
      data: { status: 'CANCELED', canceledAt: new Date() }
    });
    await audit(this.prisma, {
      actor: staff,
      action: '规则撤销',
      target: `${ruleKey}/${scope} v${version}`,
      detail: row.reason
    });
    return this.view(updated);
  }

  async currentPoints(business: string): Promise<{ rule: PointsRule; version: number | null }> {
    await this.syncDue();
    const row = await this.prisma.ruleSetVersion.findFirst({
      where: { ruleKey: 'points', scope: business, status: 'CURRENT' },
      orderBy: { version: 'desc' }
    });
    if (!row) {
      const fallback = isBusiness(business) ? DEFAULT_POINTS_RULES[business] : DEFAULT_POINTS_RULES.sx;
      return { rule: fallback, version: null };
    }
    const parsed = validatePoints(parseJson(row.rulesJson));
    return { rule: parsed, version: row.version };
  }

  async currentDice(): Promise<{ rule: DiceRule; version: number | null }> {
    await this.syncDue();
    const row = await this.prisma.ruleSetVersion.findFirst({
      where: { ruleKey: 'dice', scope: 'all', status: 'CURRENT' },
      orderBy: { version: 'desc' }
    });
    if (!row) return { rule: DEFAULT_DICE_RULE, version: null };
    const parsed = validateDice(parseJson(row.rulesJson));
    return { rule: parsed, version: row.version };
  }

  /** 到期版本切换：先退休旧现行版本，再激活到期的待生效版本。 */
  async syncDue(now = new Date()): Promise<void> {
    const due = await this.prisma.ruleSetVersion.findMany({
      where: { status: 'SCHEDULED', effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: 'asc' }
    });
    for (const row of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.ruleSetVersion.updateMany({
          where: { ruleKey: row.ruleKey, scope: row.scope, status: 'CURRENT' },
          data: { status: 'RETIRED', retiredAt: now }
        });
        await tx.ruleSetVersion.updateMany({
          where: { id: row.id, status: 'SCHEDULED' },
          data: { status: 'CURRENT' }
        });
      });
    }
  }

  private view(row: {
    ruleKey: string;
    scope: string;
    version: number;
    status: string;
    effectiveFrom: Date;
    rulesJson: string;
    reason: string;
    createdBy: string;
    createdByName: string;
    createdAt: Date;
    canceledAt: Date | null;
  }) {
    return {
      key: row.ruleKey,
      scope: row.scope,
      scopeName: row.scope === 'all' ? '全业务通用' : businessName(row.scope),
      version: row.version,
      status: row.status,
      effectiveFrom: row.effectiveFrom.toISOString(),
      rules: parseJson(row.rulesJson),
      reason: row.reason,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      createdAt: row.createdAt.toISOString(),
      canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null
    };
  }

  private ruleKey(value: string): RuleKey {
    if (!(RULE_KEYS as readonly string[]).includes(value)) {
      throw badRequest('规则类型只能是 points 或 dice');
    }
    return value as RuleKey;
  }

  private scopeOf(key: RuleKey, value: unknown): string {
    if (key === 'dice') {
      if (value !== undefined && value !== 'all') throw badRequest('骰子规则只有 all 范围');
      return 'all';
    }
    if (!isBusiness(value)) throw badRequest('积分规则范围必须是 sx / ql / zc');
    return value;
  }

  private parseEffective(value: unknown): Date {
    const text = typeof value === 'string' ? value.trim() : '';
    const at = new Date(text);
    if (!text || Number.isNaN(at.getTime())) throw badRequest('effectiveFrom 不是有效时间');
    return at;
  }
}

export const RULE_SCOPES = BUSINESSES.map((item) => item.key);
