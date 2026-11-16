import { Injectable, Logger } from '@nestjs/common';
import { logAction } from '../common/logs';
import { PrismaService } from '../common/prisma.service';
import { ApiError, badRequest, notFound } from '../common/errors';
import { newId } from '../common/ids';
import type { StaffContext } from '../common/auth.types';
import { CouponsService } from './coupons.service';
import { CouponMonthlyService, MONTHLY_KIND_LABEL } from './coupon-monthly.service';

export type CouponRuleKind = 'birthday' | 'welcome' | 'winback' | 'monthly';

export type CouponRuleConfig = {
  /** 生日：提前 N 天发（0=当天）。 */
  daysBefore?: number;
  /** 新客：注册后 N 天内发。 */
  withinDays?: number;
  /** 沉睡：连续 N 天没有已支付订单。 */
  inactiveDays?: number;
  /** 沉睡：历史至少 N 笔已支付订单，避免给一次性薅券的人发。 */
  minOrders?: number;
  /** 月度：每月几号执行（1~28，保证每个月都有这一天）。 */
  dayOfMonth?: number;
};

export type CouponRuleInput = {
  couponId: string;
  kind: CouponRuleKind;
  enabled?: boolean;
  tier?: 'all' | 'standard' | 'annual';
  config?: CouponRuleConfig;
  note?: string;
};

export type CouponRuleRunResult = {
  ruleId: string;
  kind: CouponRuleKind;
  couponTitle: string;
  targetCount: number;
  issued: number;
  skipped: number;
  period: string;
  replayed: boolean;
  batchId: string;
  error?: string;
};

const KIND_LABEL: Record<CouponRuleKind, string> = {
  birthday: '生日关怀',
  welcome: '新客欢迎',
  winback: '沉睡唤醒',
  monthly: MONTHLY_KIND_LABEL
};
const DAY_MS = 24 * 60 * 60 * 1000;

/** 人群口径：与前端展示一致，避免三处各写一遍中文字符串。 */
const TIER_LABEL: Record<string, string> = {
  all: '全部会员',
  standard: '普通会员',
  annual: 'Full愈大会员'
};

/**
 * 自动化发券规则：生日 / 新客 / 沉睡三类。
 *
 * - 每天由调度器扫一遍启用中的规则；也可在后台手动「立即执行」。
 * - 去重不靠内存：每张券落 ruleId + rulePeriod，唯一索引兜底，
 *   生日按年份、新客终生一次、沉睡按月，进程重启或重复点击都不会重复发。
 * - 目标人群全部走会员表与订单表现算，不维护人群快照，避免数据漂移。
 */
@Injectable()
export class CouponRulesService {
  private readonly logger = new Logger('CouponRules');

  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: CouponsService,
    private readonly monthly: CouponMonthlyService
  ) {}

  async listRules() {
    const rows = await this.prisma.couponRule.findMany({
      include: { coupon: { select: { title: true, active: true, validTo: true, amountCents: true } } },
      orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }]
    });
    const ids = rows.map((row) => row.id);
    const counts = ids.length
      ? await this.prisma.customerCoupon.groupBy({
          by: ['ruleId'],
          where: { ruleId: { in: ids } },
          _count: { _all: true }
        })
      : [];
    const issuedOf = new Map(counts.map((row) => [row.ruleId, row._count._all]));
    // 月度规则要带「本月状态」：前端进度条、按钮置灰、失败续跑都靠它。
    const monthlyIds = rows.filter((row) => row.kind === 'monthly').map((row) => row.id);
    const [currentRuns, runCounts] = monthlyIds.length
      ? await Promise.all([this.monthly.currentRunOf(monthlyIds), this.monthly.runCountOf(monthlyIds)])
      : [new Map(), new Map()];
    return {
      rules: rows.map((row) => ({
        id: row.id,
        couponId: row.couponId,
        couponTitle: row.coupon.title,
        couponActive: row.coupon.active,
        couponValidTo: row.coupon.validTo.getTime(),
        amountCents: row.coupon.amountCents,
        kind: row.kind as CouponRuleKind,
        kindLabel: KIND_LABEL[row.kind as CouponRuleKind] || row.kind,
        enabled: row.enabled,
        tier: row.tier,
        config: normalizeConfig(row.kind as CouponRuleKind, parseConfig(row.config)),
        note: row.note,
        lastRunAt: row.lastRunAt ? row.lastRunAt.getTime() : null,
        lastRunIssued: row.lastRunIssued,
        lastRunSkipped: row.lastRunSkipped,
        totalIssued: issuedOf.get(row.id) || 0,
        tierLabel: TIER_LABEL[row.tier] || row.tier,
        // 月度规则：本月执行记录（含进度）与历史记录数；其他规则恒为 null / 0。
        currentRun: currentRuns.get(row.id) || null,
        runCount: runCounts.get(row.id) || 0,
        createdAt: row.createdAt.getTime()
      }))
    };
  }

  async createRule(input: CouponRuleInput, actor: StaffContext) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id: input.couponId } });
    if (!coupon) throw badRequest('优惠券不存在');
    const kind = assertKind(input.kind);
    const config = normalizeConfig(kind, input.config || {});
    const enabled = input.enabled ?? true;
    // 月度规则多发一张就是真金白银：券必须可用、同券只能一条启用规则、人群与执行日先校验。
    const tier = kind === 'monthly' ? this.monthly.normalizeTier(input.tier) : input.tier || 'all';
    if (kind === 'monthly' && enabled) {
      this.monthly.assertTemplateUsable(coupon);
      await this.monthly.assertNoDuplicateRule(coupon.id);
    }
    const row = await this.prisma.couponRule.create({
      data: {
        id: newId('CR'),
        couponId: coupon.id,
        kind,
        enabled,
        tier,
        config: JSON.stringify(config),
        note: String(input.note || '').slice(0, 200),
        createdBy: actor.id,
        createdAt: new Date()
      }
    });
    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: '创建自动发券规则',
      detail: `${KIND_LABEL[kind]} · ${coupon.title} · ${describeConfig(kind, config)}`,
      type: 'coupon'
    });
    return { rule: { id: row.id, kind, config } };
  }

  async updateRule(
    id: string,
    input: { enabled?: boolean; tier?: 'all' | 'standard' | 'annual'; config?: CouponRuleConfig; note?: string },
    actor: StaffContext
  ) {
    const row = await this.prisma.couponRule.findUnique({
      where: { id },
      include: { coupon: { select: { title: true } } }
    });
    if (!row) throw notFound('规则不存在');
    const kind = row.kind as CouponRuleKind;
    const config =
      input.config === undefined ? undefined : normalizeConfig(kind, { ...parseConfig(row.config), ...input.config });
    let tier = input.tier;
    if (kind === 'monthly') {
      if (tier !== undefined) tier = this.monthly.normalizeTier(tier);
      const willEnable = input.enabled === true || (input.enabled === undefined && row.enabled);
      if (willEnable && input.enabled === true && !row.enabled) {
        // 重新启用的规则若券已停用/过期，会静默跑空，这里提前拦住。
        const coupon = await this.prisma.coupon.findUniqueOrThrow({ where: { id: row.couponId } });
        this.monthly.assertTemplateUsable(coupon);
        await this.monthly.assertNoDuplicateRule(row.couponId, row.id);
      }
    }
    const updated = await this.prisma.couponRule.update({
      where: { id },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(tier !== undefined ? { tier } : {}),
        ...(config ? { config: JSON.stringify(config) } : {}),
        ...(input.note !== undefined ? { note: String(input.note).slice(0, 200) } : {})
      }
    });
    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: input.enabled === undefined ? '更新自动发券规则' : input.enabled ? '启用自动发券规则' : '停用自动发券规则',
      detail: `${KIND_LABEL[kind]} · ${row.coupon.title}`,
      type: 'coupon'
    });
    return { rule: { id: updated.id, enabled: updated.enabled, tier: updated.tier, config: parseConfig(updated.config) } };
  }

  async deleteRule(id: string, actor: StaffContext) {
    const row = await this.prisma.couponRule.findUnique({
      where: { id },
      include: { coupon: { select: { title: true } }, _count: { select: { issued: true } } }
    });
    if (!row) throw notFound('规则不存在');
    if (row.kind === 'monthly') {
      // 月度规则留着本月的执行记录与断点，删了就无法判断「本月是否已发」，只能停用。
      const runs = await this.prisma.couponRuleRun.count({ where: { ruleId: id } });
      if (runs > 0) {
        throw badRequest('这条月度规则已有执行记录，只能停用，不能删除');
      }
    }
    // 已发出去的券保留归因，规则本身直接删除（rule_id 置空由外键 SetNull 处理）。
    await this.prisma.couponRule.delete({ where: { id } });
    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: '删除自动发券规则',
      detail: `${KIND_LABEL[row.kind as CouponRuleKind]} · ${row.coupon.title} · 历史发放 ${row._count.issued} 张`,
      type: 'coupon'
    });
    return { id, deleted: true };
  }

  /** 发前预览：命中人数与本次将实际发出的张数（扣除本周期已发与手持同款券）。 */
  async previewRule(id: string) {
    const rule = await this.prisma.couponRule.findUnique({
      where: { id },
      include: { coupon: { select: { id: true, title: true } } }
    });
    if (!rule) throw notFound('规则不存在');
    const kind = rule.kind as CouponRuleKind;
    // 月度是全量会员，不能像其他规则那样一次性捞进内存，走独立的 count 预览。
    if (kind === 'monthly') return this.monthly.preview(rule);
    const computed = await this.computeTargets(rule, new Date());
    const ids = computed.targets.map((row) => row.customerId);
    if (!ids.length) {
      return { count: 0, willIssue: 0, held: 0, alreadyThisPeriod: 0, period: computed.period };
    }
    const periods = Array.from(new Set(computed.targets.map((row) => computed.periodOf(row.customerId))));
    const [already, held] = await Promise.all([
      this.prisma.customerCoupon.findMany({
        where: { ruleId: rule.id, customerId: { in: ids }, rulePeriod: { in: periods } },
        select: { customerId: true }
      }),
      this.prisma.customerCoupon.findMany({
        where: {
          couponId: rule.couponId,
          customerId: { in: ids },
          status: { in: ['available', 'reserved'] }
        },
        select: { customerId: true }
      })
    ]);
    const blocked = new Set([...already.map((row) => row.customerId), ...held.map((row) => row.customerId)]);
    const willIssue = ids.filter((customerId) => !blocked.has(customerId)).length;
    return {
      count: ids.length,
      willIssue,
      held: held.length,
      alreadyThisPeriod: already.length,
      period: computed.period,
      kindLabel: KIND_LABEL[kind]
    };
  }

  async runRule(id: string, actor: StaffContext): Promise<CouponRuleRunResult | { run: unknown }> {
    const rule = await this.prisma.couponRule.findUnique({
      where: { id },
      include: { coupon: { select: { id: true, title: true } } }
    });
    if (!rule) throw notFound('规则不存在');
    if (rule.kind === 'monthly') {
      // 月度返回的是「已排队的执行记录」，前端轮询进度；同月已发过会被 ALREADY_DONE 拦住。
      return this.monthly.startRun(rule.id, actor, 'manual');
    }
    // 后台手动执行是「强制重跑」，不受当日已执行过的影响（券侧仍按天幂等）。
    return this.execute(rule, actor, true);
  }

  /** 每日扫描：逐个执行启用规则，单条失败不影响其他规则。 */
  async runAll(actor: StaffContext): Promise<{ results: CouponRuleRunResult[] }> {
    const rules = await this.prisma.couponRule.findMany({
      // 月度规则不走每日扫描：它按自己的执行日、全量会员分批跑，混进来会变成给全量发券。
      where: { enabled: true, kind: { not: 'monthly' } },
      include: { coupon: { select: { id: true, title: true } } },
      orderBy: { kind: 'asc' }
    });
    const results: CouponRuleRunResult[] = [];
    for (const rule of rules) {
      results.push(await this.execute(rule, actor, false));
    }
    return { results };
  }

  private async execute(
    rule: {
      id: string;
      couponId: string;
      kind: string;
      tier: string;
      config: string;
      lastRunAt: Date | null;
      coupon: { id: string; title: string };
    },
    actor: StaffContext,
    force: boolean
  ): Promise<CouponRuleRunResult> {
    const kind = rule.kind as CouponRuleKind;
    const base: CouponRuleRunResult = {
      ruleId: rule.id,
      kind,
      couponTitle: rule.coupon.title,
      targetCount: 0,
      issued: 0,
      skipped: 0,
      period: '',
      replayed: false,
      batchId: ''
    };
    try {
      const now = new Date();
      // 定时扫描每十分钟一轮：今天已跑过的规则直接跳过，避免反复命中幂等分支。
      if (!force && rule.lastRunAt && shanghaiDate(rule.lastRunAt) === shanghaiDate(now)) {
        return { ...base, replayed: true };
      }
      const computed = await this.computeTargets(rule, now);
      base.targetCount = computed.targets.length;
      base.period = computed.period;
      if (!computed.targets.length) {
        await this.markRun(rule.id, 0, 0);
        return base;
      }
      const result = await this.coupons.issueAutomated({
        templateId: rule.couponId,
        ruleId: rule.id,
        ruleKind: kind,
        periodOf: computed.periodOf,
        targets: computed.targets,
        // 每天一条批次即可幂等：同一天重复点击/重启重跑都只会发出一次。
        requestKey: `rule:${rule.id}:${computed.dayKey}`,
        note: `${KIND_LABEL[kind]}自动发放 · ${computed.period}`
      });
      base.issued = result.issuedCount;
      base.skipped = result.skippedCount;
      base.batchId = result.batchId;
      base.replayed = result.replayed;
      await this.markRun(rule.id, result.issuedCount, result.skippedCount);
      if (result.issuedCount > 0) {
        await logAction(this.prisma, {
          actorId: actor.id,
          actorName: actor.name,
          action: '自动发券执行完成',
          detail: `${KIND_LABEL[kind]} · ${rule.coupon.title} · 成功 ${result.issuedCount} 张，跳过 ${result.skippedCount} 人`,
          type: 'coupon'
        });
      }
      return base;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`规则 ${rule.id} 执行失败：${message}`);
      base.error = message;
      await this.markRun(rule.id, 0, 0);
      return base;
    }
  }

  private async markRun(ruleId: string, issued: number, skipped: number) {
    await this.prisma.couponRule.update({
      where: { id: ruleId },
      data: { lastRunAt: new Date(), lastRunIssued: issued, lastRunSkipped: skipped }
    });
  }

  /**
   * 规则 → 目标人群 + 周期标记。
   * 周期标记既用于展示，也用于唯一索引去重（ruleId + customerId + rulePeriod）。
   */
  private async computeTargets(
    rule: { id: string; kind: string; tier: string; config: string },
    now: Date
  ): Promise<{
    targets: Array<{ customerId: string; phone: string }>;
    periodOf: (customerId: string) => string;
    period: string;
    dayKey: string;
  }> {
    const kind = rule.kind as CouponRuleKind;
    if (kind === 'monthly') throw badRequest('月度规则请走分批发放，不支持整表计算人群');
    const config = normalizeConfig(kind, parseConfig(rule.config));
    const tierWhere =
      rule.tier === 'standard' || rule.tier === 'annual' ? { memberTier: rule.tier } : {};
    const today = shanghaiDate(now);
    const dayKey = today;
    if (kind === 'birthday') {
      const daysBefore = config.daysBefore ?? 0;
      const targetDate = addDays(today, daysBefore);
      const monthDay = targetDate.slice(5);
      const year = targetDate.slice(0, 4);
      const leap = isLeapYear(Number(year));
      const customers = await this.prisma.customer.findMany({
        where: { phone: { not: null }, birthday: { not: null }, ...tierWhere },
        select: { id: true, phone: true, birthday: true }
      });
      const targets = customers
        .filter((row) => {
          if (!row.birthday) return false;
          const birthdayMonthDay = shanghaiDate(row.birthday).slice(5);
          // 2/29 生日在平年顺延到 3/1，与三端生日提醒口径一致。
          const occurrence = birthdayMonthDay === '02-29' && !leap ? '03-01' : birthdayMonthDay;
          return occurrence === monthDay;
        })
        .map((row) => ({ customerId: row.id, phone: row.phone || '' }));
      return { targets, periodOf: () => year, period: year, dayKey };
    }
    if (kind === 'welcome') {
      const withinDays = config.withinDays ?? 7;
      const from = new Date(now.getTime() - withinDays * DAY_MS);
      const customers = await this.prisma.customer.findMany({
        where: { phone: { not: null }, createdAt: { gte: from }, ...tierWhere },
        select: { id: true, phone: true }
      });
      return {
        targets: customers.map((row) => ({ customerId: row.id, phone: row.phone || '' })),
        periodOf: () => 'once',
        period: 'once',
        dayKey
      };
    }
    // winback：按订单表现算每位会员最近一次已支付时间与累计单数。
    const inactiveDays = config.inactiveDays ?? 60;
    const minOrders = config.minOrders ?? 1;
    const cutoff = new Date(now.getTime() - inactiveDays * DAY_MS);
    const grouped = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { paidAt: { not: null }, customerId: { not: null } },
      _max: { paidAt: true },
      _count: { _all: true }
    });
    const candidates = grouped.filter(
      (row) =>
        row.customerId &&
        row._max.paidAt &&
        row._max.paidAt.getTime() <= cutoff.getTime() &&
        row._count._all >= minOrders
    );
    const ids = candidates.map((row) => row.customerId as string);
    const customers = ids.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: ids }, phone: { not: null }, ...tierWhere },
          select: { id: true, phone: true }
        })
      : [];
    const month = today.slice(0, 7);
    return {
      targets: customers.map((row) => ({ customerId: row.id, phone: row.phone || '' })),
      periodOf: () => month,
      period: month,
      dayKey
    };
  }
}

function assertKind(kind: string): CouponRuleKind {
  if (kind === 'birthday' || kind === 'welcome' || kind === 'winback' || kind === 'monthly') return kind;
  throw badRequest('规则类型不支持');
}

/** 配置校验 + 补齐默认值；非法值直接拒绝，避免规则静默跑空。 */
function normalizeConfig(kind: CouponRuleKind, raw: CouponRuleConfig): CouponRuleConfig {
  const int = (value: unknown, fallback: number) =>
    Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
  if (kind === 'birthday') {
    const daysBefore = int(raw.daysBefore, 0);
    if (daysBefore < 0 || daysBefore > 30) throw badRequest('生日提前天数需在 0~30 之间');
    return { daysBefore };
  }
  if (kind === 'welcome') {
    const withinDays = int(raw.withinDays, 7);
    if (withinDays < 1 || withinDays > 30) throw badRequest('新客欢迎窗口需在 1~30 天之间');
    return { withinDays };
  }
  if (kind === 'monthly') {
    // 只允许 1~28：29~31 号有些月份没有，会让「每月一次」的承诺落空。
    const dayOfMonth = int(raw.dayOfMonth, 1);
    if (dayOfMonth < 1 || dayOfMonth > 28) {
      throw new ApiError(400, '执行日需在 1~28 之间（避开 29~31 号）', { code: 'INVALID_DAY' });
    }
    return { dayOfMonth };
  }
  const inactiveDays = int(raw.inactiveDays, 60);
  const minOrders = int(raw.minOrders, 1);
  if (inactiveDays < 7 || inactiveDays > 365) throw badRequest('沉睡天数需在 7~365 之间');
  if (minOrders < 0 || minOrders > 100) throw badRequest('最少消费次数需在 0~100 之间');
  return { inactiveDays, minOrders };
}

function parseConfig(raw: string): CouponRuleConfig {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as CouponRuleConfig) : {};
  } catch {
    return {};
  }
}

function describeConfig(kind: CouponRuleKind, config: CouponRuleConfig): string {
  if (kind === 'monthly') return `每月 ${config.dayOfMonth ?? 1} 号`;
  if (kind === 'birthday') {
    return config.daysBefore ? `生日前 ${config.daysBefore} 天` : '生日当天';
  }
  if (kind === 'welcome') return `注册后 ${config.withinDays} 天内`;
  return `${config.inactiveDays} 天未消费、累计 ${config.minOrders} 单以上`;
}

/** 中国时区自然日（YYYY-MM-DD）；券的有效期与规则都按自然日解释。 */
function shanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00+08:00`);
  return shanghaiDate(new Date(base.getTime() + days * DAY_MS));
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}