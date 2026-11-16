import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { logAction } from '../common/logs';
import { PrismaService } from '../common/prisma.service';
import { ApiError, badRequest, notFound } from '../common/errors';
import { newId } from '../common/ids';
import type { StaffContext } from '../common/auth.types';
import { computeValidity } from './coupons.service';

/** 月度定向发放的执行状态机；failed 不是终态，保留断点可续跑。 */
export type MonthlyRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/** 每页处理的顾客数：2 万会员约 40 页，远小于定时任务超时，也把单次事务写放控制在几十行。 */
const PAGE_SIZE = 500;
/** 租约：进程崩溃后 claimedAt 超过 5 分钟即可被下一轮接管，不会永久卡在 running。 */
const LEASE_MS = 5 * 60 * 1000;
/** 同一条 run 最多的执行尝试次数；超过后交人工「继续执行」，避免坏数据反复重试。 */
const MAX_ATTEMPTS = 5;
/** 按实测写入速度估算的耗时基线（人/秒），用于运营看进度条。 */
const THROUGHPUT = 2000;

export const MONTHLY_KIND_LABEL = '月度定向发放';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 中国时区自然月 YYYY-MM；与 customer_coupons.rule_period 同值，参与唯一索引去重。 */
export function shanghaiMonth(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit'
  })
    .format(date)
    .slice(0, 7);
}

/** 中国时区「今天是几号」，用于判断当月执行日是否已到。 */
export function shanghaiDayOfMonth(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', day: '2-digit' }).format(date)
  );
}

type RuleRow = {
  id: string;
  couponId: string;
  kind: string;
  enabled: boolean;
  tier: string;
  config: string;
  coupon: {
    id: string;
    title: string;
    active: boolean;
    validFrom: Date;
    validTo: Date;
    validDays: number;
  };
};

/**
 * 月度定向发放：每月固定一天，给全量会员（或仅年卡会员）发一张券。
 *
 * 与生日/沉睡规则的区别：
 * - 人群是「全量会员」，不能一次读进内存；改为按顾客 id 游标分页，每页 500 人写入一次，
 *   断点存在 coupon_rule_runs.cursor_id，中途失败/重启都从断点续跑，不重复发。
 * - 一条规则一个自然月只有一条执行记录（rule_id + period 唯一），
 *   它同时是「本月是否已发」的判据：手动提前发过，当月调度器不会再发第二次。
 * - 券侧仍靠 customer_coupons 唯一索引（ruleId + customerId + rulePeriod）兜底，
 *   即使两处并发执行也不会出现同一人同月两张券。
 */
@Injectable()
export class CouponMonthlyService {
  private readonly logger = new Logger('CouponMonthly');
  /** 同进程内的串行锁：进度轮询与调度器同时触发时只推进一次。 */
  private readonly inFlight = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  /** 目标人群条件：手机号必填（发不出短信/无法登录的账户不发），tier=annual 时只发年卡会员。 */
  targetWhere(rule: { tier: string }): Prisma.CustomerWhereInput {
    return {
      phone: { not: null },
      ...(rule.tier === 'annual' ? { memberTier: 'annual' } : {})
    };
  }

  /** 券模板必须可用：停用或过期时整条规则直接失败，而不是发出一批废券。 */
  assertTemplateUsable(template: { active: boolean; validTo: Date }) {
    if (!template.active) {
      throw new ApiError(409, '关联的优惠券已停用，请恢复后再执行', { code: 'COUPON_INACTIVE' });
    }
    if (template.validTo.getTime() < Date.now()) {
      throw new ApiError(409, '关联的优惠券已过期，请换一张券', { code: 'COUPON_INACTIVE' });
    }
  }

  /** 月度规则只支持「全部会员 / 仅年卡会员」；普通会员单独定向没有业务含义。 */
  normalizeTier(tier: string | undefined): 'all' | 'annual' {
    const value = tier || 'all';
    if (value !== 'all' && value !== 'annual') {
      throw new ApiError(409, '月度规则的人群只能是「全部会员」或「Full愈大会员」', {
        code: 'RULE_CONFLICT'
      });
    }
    return value;
  }

  normalizeDayOfMonth(raw: unknown): number {
    const day = Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : NaN;
    if (!(day >= 1 && day <= 28)) {
      throw new ApiError(400, '执行日需在 1~28 之间（避开 29~31 号，保证每个月都有这一天）', {
        code: 'INVALID_DAY'
      });
    }
    return day;
  }

  /** 同一张券模板只允许一条启用中的月度规则，避免同月给同一人叠发两张一样的券。 */
  async assertNoDuplicateRule(couponId: string, excludeRuleId?: string) {
    const existing = await this.prisma.couponRule.findFirst({
      where: {
        couponId,
        kind: 'monthly',
        enabled: true,
        ...(excludeRuleId ? { id: { not: excludeRuleId } } : {})
      },
      select: { id: true }
    });
    if (existing) {
      throw new ApiError(409, '这张券已经有一条启用中的月度规则，请先停用原规则', {
        code: 'RULE_CONFLICT'
      });
    }
  }

  /** 本月执行记录（列表页「本月状态」、判断是否已发都用它）。 */
  async currentRunOf(ruleIds: string[], now = new Date()) {
    const period = shanghaiMonth(now);
    const rows = ruleIds.length
      ? await this.prisma.couponRuleRun.findMany({
          where: { ruleId: { in: ruleIds }, period },
          orderBy: { createdAt: 'desc' }
        })
      : [];
    return new Map(rows.map((row) => [row.ruleId, mapRun(row)]));
  }

  /** 规则的历史执行记录条数：有记录后只能停用不能删除（保留断点与审计）。 */
  async runCountOf(ruleIds: string[]) {
    const rows = ruleIds.length
      ? await this.prisma.couponRuleRun.groupBy({
          by: ['ruleId'],
          where: { ruleId: { in: ruleIds } },
          _count: { _all: true }
        })
      : [];
    return new Map(rows.map((row) => [row.ruleId, row._count._all]));
  }

  async listRuns(query: { ruleId?: string; limit?: number } = {}) {
    const take = Math.min(50, Math.max(1, Math.floor(query.limit || 20)));
    const rows = await this.prisma.couponRuleRun.findMany({
      where: query.ruleId ? { ruleId: query.ruleId } : {},
      orderBy: { createdAt: 'desc' },
      take
    });
    return { runs: rows.map((row) => mapRun(row)) };
  }

  async getRun(id: string) {
    const row = await this.prisma.couponRuleRun.findUnique({ where: { id } });
    if (!row) throw notFound('执行记录不存在');
    return { run: mapRun(row) };
  }

  /** 发前预览：命中人数、无手机号人数、本周期已发人数、预计耗时。 */
  async preview(rule: { id: string; tier: string }) {
    const now = new Date();
    const period = shanghaiMonth(now);
    const where = this.targetWhere(rule);
    const [targetCount, noPhone, already] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.count({ where: { phone: null, ...(rule.tier === 'annual' ? { memberTier: 'annual' } : {}) } }),
      this.prisma.customerCoupon.count({ where: { ruleId: rule.id, rulePeriod: period } })
    ]);
    return {
      kindLabel: MONTHLY_KIND_LABEL,
      period,
      count: targetCount,
      targetCount,
      noPhone,
      alreadyThisPeriod: already,
      willIssue: Math.max(targetCount - already, 0),
      held: 0,
      estimatedSeconds: Math.max(1, Math.ceil(targetCount / THROUGHPUT))
    };
  }

  /**
   * 启动（或续跑）本月执行。返回 run 时只代表已排队，真正的写入在后台按页推进，
   * 前端通过 GET /admin/coupons/runs/:id 轮询进度。
   */
  async startRun(ruleId: string, actor: StaffContext, trigger: 'manual' | 'auto') {
    const rule = await this.requireRule(ruleId);
    this.assertTemplateUsable(rule.coupon);
    // 自动执行关着的规则仍可手动发；同券若另有开着自动执行的规则，这里拦住同月叠发。
    if (!rule.enabled) await this.assertNoDuplicateRule(rule.couponId, rule.id);
    const now = new Date();
    const period = shanghaiMonth(now);
    const existing = await this.prisma.couponRuleRun.findUnique({
      where: { ruleId_period: { ruleId: rule.id, period } }
    });
    if (existing?.status === 'succeeded') {
      throw new ApiError(409, `${period} 已经发放完成，同一个月不会重复发`, { code: 'ALREADY_DONE' });
    }
    if (existing && this.leaseFresh(existing) && ['pending', 'running'].includes(existing.status)) {
      throw new ApiError(409, '上一次执行还在进行中，请稍候查看进度', { code: 'RUNNING' });
    }
    return this.begin(rule, actor, trigger, period, now, existing);
  }

  /** 失败后续跑：保留断点与已发计数，从 cursor 之后继续写。 */
  async continueRun(id: string, actor: StaffContext) {
    const row = await this.prisma.couponRuleRun.findUnique({ where: { id } });
    if (!row) throw notFound('执行记录不存在');
    if (row.status === 'succeeded') {
      throw new ApiError(409, '这次执行已经完成，无需继续', { code: 'ALREADY_DONE' });
    }
    if (this.leaseFresh(row) && row.status === 'running') {
      throw new ApiError(409, '上一次执行还在进行中，请稍候查看进度', { code: 'RUNNING' });
    }
    const rule = await this.requireRule(row.ruleId);
    const period = shanghaiMonth(new Date());
    // 跨月才允许「继续」：上个月没跑完的不能在本月偷偷把券发出去（券的有效期按发放时刻算）。
    if (row.period !== period) {
      throw new ApiError(409, `这次执行属于 ${row.period}，已过执行月，请重新发起本月发放`, {
        code: 'EXPIRED_RUN'
      });
    }
    return this.begin(rule, actor, 'manual', period, new Date(), row);
  }

  /** 调度器每轮：接管中断的 run，再把到日的月度规则跑起来。单条失败不影响其他规则。 */
  async tick(actor: StaffContext) {
    await this.resumeInterrupted();
    await this.autoRunDue(actor);
  }

  private async begin(
    rule: RuleRow,
    actor: StaffContext,
    trigger: 'manual' | 'auto',
    period: string,
    now: Date,
    existing: {
      id: string;
      status: string;
      cursorId: string | null;
      issued: number;
      skipped: number;
      batchId: string | null;
      targetCount: number;
    } | null
  ) {
    const targetCount = await this.prisma.customer.count({ where: this.targetWhere(rule) });
    let runId: string;
    if (existing) {
      // 从未写过任何一页的失败（cursor 为空）可以从头再来；写过的必须保留断点与计数。
      const restart = !existing.cursorId && existing.issued === 0;
      await this.prisma.couponRuleRun.update({
        where: { id: existing.id },
        data: {
          status: 'pending',
          trigger,
          targetCount,
          operatorId: actor.id,
          operatorName: actor.name,
          claimedAt: null,
          finishedAt: null,
          lastError: '',
          // 人工点「执行/继续」视为重新授权，重试次数重新计；自动重试仍按原次数累计
          ...(trigger === 'manual' ? { attempts: 0 } : {}),
          ...(restart ? { issued: 0, skipped: 0, batchId: null } : {})
        }
      });
      runId = existing.id;
    } else {
      const created = await this.prisma.couponRuleRun.create({
        data: {
          id: newId('CRR'),
          ruleId: rule.id,
          couponId: rule.couponId,
          period,
          trigger,
          status: 'pending',
          targetCount,
          operatorId: actor.id,
          operatorName: actor.name,
          createdAt: now
        }
      });
      runId = created.id;
    }
    void this.process(runId);
    const row = await this.prisma.couponRuleRun.findUniqueOrThrow({ where: { id: runId } });
    return { run: mapRun(row) };
  }

  /**
   * 后台推进：claim 租约 → 按页写入 → 收尾。
   * 返回 'done' 或 'retry'，由 process 决定是否立即再试一轮。
   */
  private async process(runId: string): Promise<void> {
    if (this.inFlight.has(runId)) return;
    this.inFlight.add(runId);
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const outcome = await this.advance(runId);
          if (outcome !== 'retry') return;
        } catch (error) {
          // advance 自身抛错（多为数据库瞬时不可用）：不再本轮重试，交给调度器接管。
          this.logger.warn(
            `月度执行 ${runId} 推进异常：${error instanceof Error ? error.message : String(error)}`
          );
          return;
        }
        await sleep(500 * 2 ** attempt);
      }
      // 连续失败交给调度器下一轮接管（attempts 已记在 run 上）。
    } finally {
      this.inFlight.delete(runId);
    }
  }

  private async advance(runId: string): Promise<'done' | 'retry'> {
    const run = await this.prisma.couponRuleRun.findUnique({ where: { id: runId } });
    if (!run || run.status === 'succeeded') return 'done';
    const now = new Date();
    const claimed = await this.prisma.couponRuleRun.updateMany({
      where: {
        id: runId,
        OR: [
          { status: 'pending' },
          { status: 'failed' },
          { status: 'running', claimedAt: { lt: new Date(now.getTime() - LEASE_MS) } },
          { status: 'running', claimedAt: null }
        ]
      },
      data: {
        status: 'running',
        claimedAt: now,
        startedAt: run.startedAt ?? now,
        attempts: { increment: 1 },
        lastError: ''
      }
    });
    // 没抢到租约：说明另一个进程正在写，直接让出。
    if (!claimed.count) return 'done';

    const rule = await this.prisma.couponRule.findUnique({
      where: { id: run.ruleId },
      include: {
        coupon: {
          select: { id: true, title: true, active: true, validFrom: true, validTo: true, validDays: true }
        }
      }
    });
    if (!rule) {
      // 规则被删除（外键 Cascade 已带走记录），这里只兜底。
      return 'done';
    }
    try {
      this.assertTemplateUsable(rule.coupon);
      const batchId = await this.ensureBatch(run, rule, now);
      let cursor = run.cursorId;
      let issued = run.issued;
      let skipped = run.skipped;
      const validity = computeValidity(rule.coupon, now);
      for (;;) {
        const page = await this.prisma.customer.findMany({
          where: { ...this.targetWhere(rule), ...(cursor ? { id: { gt: cursor } } : {}) },
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          select: {
            id: true,
            phone: true,
            memberTier: true,
            createdAt: true,
            _count: { select: { orders: { where: { paidAt: { not: null } } } } }
          }
        });
        if (!page.length) break;
        const ids = page.map((row) => row.id);
        // 本周期已发过的会员直接跳过（手动重跑/断点重放都靠这一步幂等）。
        const already = await this.prisma.customerCoupon.findMany({
          where: { ruleId: rule.id, rulePeriod: run.period, customerId: { in: ids } },
          select: { customerId: true }
        });
        const covered = new Set(already.map((row) => row.customerId));
        const fresh = page.filter((row) => !covered.has(row.id));
        let written = 0;
        if (fresh.length) {
          const result = await this.prisma.customerCoupon.createMany({
            data: fresh.map((row) => ({
              id: newId('CC'),
              couponId: rule.couponId,
              customerId: row.id,
              batchId,
              status: 'available',
              issuedAt: now,
              validFrom: validity.validFrom,
              validTo: validity.validTo,
              memberTier: row.memberTier || '',
              memberSince: row.createdAt,
              orderCount: row._count.orders,
              ruleId: rule.id,
              rulePeriod: run.period
            })),
            // 唯一索引兜底：并发下重复行被忽略，不会因一人失败整页回滚。
            skipDuplicates: true
          });
          written = result.count;
        }
        cursor = page[page.length - 1]?.id || cursor;
        issued += written;
        skipped += page.length - written;
        // 每页落一次断点：崩溃后最多重放这一页，重放也被唯一索引挡住。
        await this.prisma.couponRuleRun.update({
          where: { id: runId },
          data: { cursorId: cursor, issued, skipped, targetCount: Math.max(run.targetCount, issued + skipped) }
        });
        if (page.length < PAGE_SIZE) break;
      }
      await this.finish(runId, rule, batchId, issued, skipped);
      return 'done';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof ApiError ? error.code : undefined;
      this.logger.warn(`月度规则 ${run.ruleId} 执行失败：${message}`);
      const attempts = run.attempts + 1;
      const retriable = code !== 'COUPON_INACTIVE';
      await this.prisma.couponRuleRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          claimedAt: null,
          // 模板停用/过期属于人工问题，重试没有意义，直接记为不可重试。
          attempts: retriable ? attempts : MAX_ATTEMPTS,
          lastError: message.slice(0, 500)
        }
      });
      // 发了一半就失败：批次保持原样，下次续跑接着往同一个批次里写。
      return retriable && attempts < MAX_ATTEMPTS ? 'retry' : 'done';
    }
  }

  private async finish(
    runId: string,
    rule: RuleRow,
    batchId: string,
    issued: number,
    skipped: number
  ) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.couponRuleRun.update({
        where: { id: runId },
        data: {
          status: 'succeeded',
          cursorId: null,
          claimedAt: null,
          finishedAt: now,
          issued,
          skipped,
          targetCount: Math.max(issued + skipped, 0),
          lastError: ''
        }
      }),
      this.prisma.couponRule.update({
        where: { id: rule.id },
        data: { lastRunAt: now, lastRunIssued: issued, lastRunSkipped: skipped }
      }),
      ...(batchId
        ? [
            this.prisma.couponBatch.update({
              where: { id: batchId },
              data: { requested: issued + skipped, issued, skipped }
            })
          ]
        : [])
    ]);
    await logAction(this.prisma, {
      actorId: null,
      actorName: '系统',
      action: '月度发券执行完成',
      detail: `${MONTHLY_KIND_LABEL} · ${rule.coupon.title} · 成功 ${issued} 张，跳过 ${skipped} 人`,
      type: 'coupon'
    });
  }

  /** 一次执行只建一个批次：按规则 + 月份做幂等键，续跑复用同一批次。 */
  private async ensureBatch(
    run: { id: string; period: string; batchId: string | null; operatorId: string | null; operatorName: string },
    rule: RuleRow,
    now: Date
  ): Promise<string> {
    if (run.batchId) return run.batchId;
    const requestKey = `monthly:${rule.id}:${run.period}`;
    const exists = await this.prisma.couponBatch.findUnique({ where: { requestKey } });
    if (exists) {
      await this.prisma.couponRuleRun.update({ where: { id: run.id }, data: { batchId: exists.id } });
      return exists.id;
    }
    try {
      const batch = await this.prisma.couponBatch.create({
        data: {
          id: newId('CB'),
          couponId: rule.couponId,
          source: 'auto',
          requested: 0,
          issued: 0,
          skipped: 0,
          filter: JSON.stringify({
            kind: 'monthly',
            ruleId: rule.id,
            period: run.period,
            tier: rule.tier
          }),
          requestKey,
          note: `${MONTHLY_KIND_LABEL} · ${run.period}`,
          operatorId: run.operatorId,
          operatorName: run.operatorName,
          createdAt: now
        }
      });
      await this.prisma.couponRuleRun.update({ where: { id: run.id }, data: { batchId: batch.id } });
      return batch.id;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const batch = await this.prisma.couponBatch.findUniqueOrThrow({ where: { requestKey } });
        await this.prisma.couponRuleRun.update({ where: { id: run.id }, data: { batchId: batch.id } });
        return batch.id;
      }
      throw error;
    }
  }

  /** 中断接管：租约过期的 running、排队中的 pending、还能重试的 failed，都从断点续跑。 */
  private async resumeInterrupted() {
    const now = Date.now();
    const rows = await this.prisma.couponRuleRun.findMany({
      where: {
        OR: [
          { status: 'pending' },
          { status: 'running', claimedAt: { lt: new Date(now - LEASE_MS) } },
          { status: 'running', claimedAt: null },
          { status: 'failed', attempts: { lt: MAX_ATTEMPTS } }
        ]
      },
      select: { id: true, period: true },
      take: 20
    });
    const period = shanghaiMonth(new Date());
    for (const row of rows) {
      if (row.period !== period) continue;
      void this.process(row.id);
    }
    if (rows.length) {
      this.logger.log(`接管 ${rows.length} 条未完成的月度发放记录`);
    }
  }

  /** 到日自动执行：每月 1~28 日之间，到了执行日的规则当月发一次。 */
  private async autoRunDue(actor: StaffContext) {
    const now = new Date();
    const day = shanghaiDayOfMonth(now);
    const period = shanghaiMonth(now);
    const rules = await this.prisma.couponRule.findMany({
      where: { kind: 'monthly', enabled: true },
      include: { coupon: { select: { id: true, title: true } } }
    });
    for (const rule of rules) {
      const config = parseDayConfig(rule.config);
      if (day < config.dayOfMonth) continue;
      const existing = await this.prisma.couponRuleRun.findUnique({
        where: { ruleId_period: { ruleId: rule.id, period } },
        select: { status: true, claimedAt: true, attempts: true }
      });
      if (existing?.status === 'succeeded') continue;
      if (existing && ['pending', 'running'].includes(existing.status) && this.leaseFresh(existing)) continue;
      // 自动重试次数用完就不再自动拉起，留给人工排查后点「继续执行」。
      if (existing?.status === 'failed' && existing.attempts >= MAX_ATTEMPTS) continue;
      try {
        const { run } = await this.startRun(rule.id, actor, 'auto');
        this.logger.log(`月度规则 ${run.ruleId} 已自动启动（${period}）`);
      } catch (error) {
        const code = error instanceof ApiError ? error.code : '';
        if (code === 'ALREADY_DONE' || code === 'RUNNING') continue;
        this.logger.warn(
          `月度规则 ${rule.id} 自动执行未启动：${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private leaseFresh(row: { status: string; claimedAt: Date | null }) {
    return Boolean(row.claimedAt && Date.now() - row.claimedAt.getTime() < LEASE_MS);
  }

  private async requireRule(id: string): Promise<RuleRow> {
    const rule = await this.prisma.couponRule.findUnique({
      where: { id },
      include: {
        coupon: {
          select: { id: true, title: true, active: true, validFrom: true, validTo: true, validDays: true }
        }
      }
    });
    if (!rule) throw notFound('规则不存在');
    if (rule.kind !== 'monthly') throw badRequest('这条规则不是月度定向发放');
    return rule;
  }
}

/** 月度规则的 config 只有执行日：1~28，保证每个月都有这一天。 */
export function parseDayConfig(raw: string): { dayOfMonth: number } {
  if (!raw) return { dayOfMonth: 1 };
  try {
    const parsed = JSON.parse(raw) as { dayOfMonth?: unknown };
    const day = Math.round(Number(parsed?.dayOfMonth));
    return { dayOfMonth: day >= 1 && day <= 28 ? day : 1 };
  } catch {
    return { dayOfMonth: 1 };
  }
}

function mapRun(row: {
  id: string;
  ruleId: string;
  couponId: string;
  period: string;
  trigger: string;
  status: string;
  targetCount: number;
  issued: number;
  skipped: number;
  cursorId: string | null;
  batchId: string | null;
  attempts: number;
  lastError: string;
  operatorName: string;
  claimedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}) {
  const done = row.issued + row.skipped;
  const total = Math.max(row.targetCount, done);
  return {
    id: row.id,
    ruleId: row.ruleId,
    couponId: row.couponId,
    period: row.period,
    trigger: row.trigger,
    status: row.status as MonthlyRunStatus,
    targetCount: row.targetCount,
    issued: row.issued,
    skipped: row.skipped,
    processed: done,
    // 进度按「已处理人数 / 目标人数」算，目标人数在启动时固定，新增会员在下一轮才计入。
    progress: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
    batchId: row.batchId,
    attempts: row.attempts,
    lastError: row.lastError,
    operatorName: row.operatorName,
    claimedAt: row.claimedAt ? row.claimedAt.getTime() : null,
    startedAt: row.startedAt ? row.startedAt.getTime() : null,
    finishedAt: row.finishedAt ? row.finishedAt.getTime() : null,
    createdAt: row.createdAt.getTime()
  };
}

export type MonthlyRunView = ReturnType<typeof mapRun>;
