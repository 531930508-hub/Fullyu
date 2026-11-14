/**
 * 劳务结算（月结）。
 *
 * 口径：劳务工资 = 门店劳务单价（分/分钟，默认 220）× 实际工时；工时按小时向下取整，
 * 零头不计——「宁可少算不可虚增」，与在店时段的闭合口径一致。
 *
 * 出单（generate）只产出草稿，可反复重算；确认（confirm）才冻结金额并投影成一笔人力费用：
 * - 还有未闭合时段 / 补签审批中 → 硬阻断，避免「先入账后补签」导致金额对不上；
 * - 已入账的单据不再参与重算，改错只能作废重出（本期先不做作废，见 E2）。
 */
import { Injectable } from '@nestjs/common';
import type { WorkSession } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { assertStoreAccess, type StaffContext } from '../common/auth.types';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { logAction } from '../common/logs';
import { newId } from '../common/ids';
import { formatMoney } from '@teahour/shared';
import {
  formatMinutes,
  minutesBetween,
  monthOf,
  monthRange,
  previousMonth,
  shanghaiDate,
  shanghaiTimeText
} from './attendance.time';

/** 单价上限：¥100/分钟（¥6000/小时），超过必然是填错了单位（元/时 vs 分/分）。 */
export const MAX_LABOR_RATE_CENTS = 10_000;

/** 单人单月调整额上限 ±¥10,000：超过请走线下审批，不在结算单里改。 */
export const MAX_ADJUSTMENT_CENTS = 1_000_000;

const UNCLOSED_STATUSES = ['open', 'pending_close', 'lapsed'] as const;

export type SettlementLine = {
  sessionId: string;
  businessDate: string;
  from: string;
  to: string;
  minutes: number;
};

export type LaborRateInput = { laborRatePerMinCents: number; note?: string };

export type ConfirmInput = {
  adjustmentCents?: number;
  adjustmentNote?: string;
  note?: string;
};

const isClosedWithOut = (row: WorkSession): boolean => row.status === 'closed' && row.clockOutAt != null;

/** 'YYYY-MM' 校验：格式不对直接 400，不做静默纠正。 */
const parseMonth = (value: string | undefined, fallback: string): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) throw badRequest('结算周期格式应为 YYYY-MM');
  return raw;
};

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 门店劳务单价 ----------

  /** 可见门店 + 当前单价。单价是敏感字段，只有 attendance:settle 能读（见 controller）。 */
  async rates(staff: StaffContext) {
    const stores = await this.scopeStores(staff, null);
    return {
      maxRatePerMinCents: MAX_LABOR_RATE_CENTS,
      rows: stores.map((store) => ({
        storeId: store.id,
        name: store.name,
        city: store.city,
        laborRatePerMinCents: store.laborRatePerMinCents,
        hourlyCents: store.laborRatePerMinCents * 60
      }))
    };
  }

  /** 单价的「更新」就是唯一入口：单价挂在门店上，没有新增/删除语义。 */
  async saveRate(staff: StaffContext, storeId: string, input: LaborRateInput) {
    const id = String(storeId || '').trim();
    if (!id) throw badRequest('请选择门店');
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw notFound('门店不存在');
    assertStoreAccess(staff, id);

    const raw = input.laborRatePerMinCents;
    if (typeof raw !== 'number' || !Number.isInteger(raw)) throw badRequest('劳务单价应为整数（分/分钟）');
    if (raw < 0) throw badRequest('劳务单价不能为负数');
    if (raw > MAX_LABOR_RATE_CENTS) {
      throw badRequest(`劳务单价不能超过 ${formatMoney(MAX_LABOR_RATE_CENTS)}/分钟，请确认单位是「分/分钟」`);
    }

    const updated = await this.prisma.store.update({
      where: { id },
      data: { laborRatePerMinCents: raw }
    });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '更新门店劳务单价',
      detail: `${updated.name}：${formatMoney(store.laborRatePerMinCents)}/分钟 → ${formatMoney(raw)}/分钟${
        input.note ? `｜${String(input.note).slice(0, 80)}` : ''
      }`,
      type: 'attendance',
      storeId: id
    });
    return {
      storeId: updated.id,
      name: updated.name,
      city: updated.city,
      laborRatePerMinCents: updated.laborRatePerMinCents,
      hourlyCents: updated.laborRatePerMinCents * 60
    };
  }

  // ---------- 结算单 ----------

  /** 出单 / 重算：草稿会被刷新，已入账的不动，行不存在才新建。 */
  async generate(staff: StaffContext, input: { month?: string; storeId?: string }) {
    const month = parseMonth(input.month, previousMonth());
    const { start, end } = monthRange(month);
    if (month > monthOf(shanghaiDate())) throw badRequest('结算周期不能晚于当月');
    const stores = await this.scopeStores(staff, input.storeId ?? null);
    if (!stores.length) throw badRequest('没有可结算的门店');
    const storeNameOf = new Map(stores.map((store) => [store.id, store.name]));
    const rateOf = new Map(stores.map((store) => [store.id, store.laborRatePerMinCents]));

    const sessions = await this.prisma.workSession.findMany({
      where: {
        storeId: { in: stores.map((store) => store.id) },
        businessDate: { gte: start, lte: end },
        status: { not: 'voided' }
      },
      orderBy: { clockInAt: 'asc' }
    });

    const groups = new Map<string, WorkSession[]>();
    for (const row of sessions) {
      const key = `${row.storeId}|${row.userId}`;
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const [key, rows] of groups) {
      const [storeId, userId] = key.split('|');
      const closed = rows.filter(isClosedWithOut);
      const minutes = closed.reduce((sum, row) => sum + minutesBetween(row.clockInAt, row.clockOutAt!), 0);
      const unclosedCount = rows.filter((row) =>
        (UNCLOSED_STATUSES as readonly string[]).includes(row.status)
      ).length;
      if (!minutes && !unclosedCount) continue;

      // 按小时向下取整：不足 1 小时的零头不计，单价按分钟计，故整点分钟 × 单价。
      const billableMinutes = Math.floor(minutes / 60) * 60;
      const ratePerMinCents = rateOf.get(storeId) ?? 0;
      const baseAmountCents = billableMinutes * ratePerMinCents;
      const pendingApprovals = rows.filter((row) => row.pendingApprovalId != null).length;
      const lines: SettlementLine[] = closed.map((row) => ({
        sessionId: row.id,
        businessDate: row.businessDate,
        from: shanghaiTimeText(row.clockInAt),
        to: shanghaiTimeText(row.clockOutAt!),
        minutes: minutesBetween(row.clockInAt, row.clockOutAt!)
      }));

      const existing = await this.prisma.workSettlement.findUnique({
        where: { storeId_userId_periodStart_periodEnd: { storeId, userId, periodStart: start, periodEnd: end } }
      });
      if (existing && existing.status !== 'draft') {
        skipped += 1;
        continue;
      }

      const snapshot = {
        minutes,
        ratePerMinCents,
        baseAmountCents,
        unclosedCount,
        pendingApprovals,
        linesJson: JSON.stringify(lines)
      };
      if (existing) {
        // 重算只动基础部分：人工调整是店长/财务的手工判断，不能被覆盖。
        await this.prisma.workSettlement.update({
          where: { id: existing.id },
          data: { ...snapshot, amountCents: baseAmountCents + existing.adjustmentCents }
        });
        updated += 1;
      } else {
        await this.prisma.workSettlement.create({
          data: {
            id: newId('WS'),
            storeId,
            userId,
            periodStart: start,
            periodEnd: end,
            ...snapshot,
            adjustmentCents: 0,
            adjustmentNote: '',
            amountCents: baseAmountCents,
            status: 'draft'
          }
        });
        created += 1;
      }
    }

    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '生成劳务结算单',
      detail: `${month}｜新建 ${created} 张，重算 ${updated} 张，跳过已入账 ${skipped} 张｜${
        input.storeId ? storeNameOf.get(input.storeId) || input.storeId : '全部可见门店'
      }`,
      type: 'attendance',
      storeId: input.storeId ?? null
    });

    // 列表本身带 month/periodStart/periodEnd，所以先铺列表再放本次出单的计数，
    // 避免同一个键写两遍（覆盖顺序错了会让调用方拿到错误的月份）。
    const listed = await this.list(staff, { month, storeId: input.storeId });
    return { ...listed, created, updated, skipped };
  }

  async list(staff: StaffContext, input: { month?: string; storeId?: string }) {
    const month = parseMonth(input.month, previousMonth());
    const { start, end, label } = monthRange(month);
    const stores = await this.scopeStores(staff, input.storeId ?? null);
    if (!stores.length) throw badRequest('没有可查看的门店');
    const storeNameOf = new Map(stores.map((store) => [store.id, store.name]));

    const rows = await this.prisma.workSettlement.findMany({
      where: {
        storeId: { in: stores.map((store) => store.id) },
        periodStart: start,
        periodEnd: end,
        status: { not: 'voided' }
      },
      orderBy: [{ storeId: 'asc' }, { amountCents: 'desc' }]
    });
    const userIds = [...new Set(rows.map((row) => row.userId))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(users.map((user) => [user.id, user.name]));

    const mapped = rows.map((row) => {
      const billableMinutes = Math.floor(row.minutes / 60) * 60;
      return {
        id: row.id,
        storeId: row.storeId,
        storeName: storeNameOf.get(row.storeId) || row.storeId,
        userId: row.userId,
        userName: nameOf.get(row.userId) || row.userId,
        month,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        minutes: row.minutes,
        billableMinutes,
        hours: billableMinutes / 60,
        ratePerMinCents: row.ratePerMinCents,
        hourlyCents: row.ratePerMinCents * 60,
        baseAmountCents: row.baseAmountCents,
        adjustmentCents: row.adjustmentCents,
        adjustmentNote: row.adjustmentNote,
        amountCents: row.amountCents,
        status: row.status,
        unclosedCount: row.unclosedCount,
        pendingApprovals: row.pendingApprovals,
        lines: JSON.parse(row.linesJson) as SettlementLine[],
        postedExpenseId: row.postedExpenseId,
        confirmedBy: row.confirmedBy,
        confirmedAt: row.confirmedAt ? row.confirmedAt.getTime() : null,
        confirmedNote: row.confirmedNote
      };
    });

    const drafts = mapped.filter((row) => row.status === 'draft');
    return {
      month: label,
      periodStart: start,
      periodEnd: end,
      rows: mapped,
      summary: {
        count: mapped.length,
        draftCount: drafts.length,
        postedCount: mapped.length - drafts.length,
        minutes: mapped.reduce((sum, row) => sum + row.minutes, 0),
        baseAmountCents: mapped.reduce((sum, row) => sum + row.baseAmountCents, 0),
        amountCents: mapped.reduce((sum, row) => sum + row.amountCents, 0),
        // 未闭合的时段只挡「确认」，不挡出单：先出单看清差多少，再补签。
        unclosedCount: drafts.reduce((sum, row) => sum + row.unclosedCount, 0)
      }
    };
  }

  /**
   * 确认入账：允许一次性调整（调整额单独字段，备注必填），金额 = 基础 + 调整，同事务写人力费用。
   * 一切都在草稿上做，入账后金额不可再变——改错只能作废重出。
   */
  async confirm(staff: StaffContext, id: string, input: ConfirmInput) {
    const row = await this.prisma.workSettlement.findUnique({ where: { id } });
    if (!row) throw notFound('结算单不存在');
    assertStoreAccess(staff, row.storeId);
    if (row.status === 'posted') throw conflict('结算单已入账，如需更改请作废后重新出单');
    if (row.status !== 'draft') throw conflict('结算单已作废，请重新生成');

    const month = monthOf(row.periodStart);
    if (row.periodEnd >= shanghaiDate()) throw badRequest(`${month} 结算周期尚未结束，结束后才能确认入账`);

    const adjustmentCents = input.adjustmentCents ?? 0;
    if (!Number.isInteger(adjustmentCents)) throw badRequest('调整额应为整数（分）');
    if (Math.abs(adjustmentCents) > MAX_ADJUSTMENT_CENTS) {
      throw badRequest(`调整额不能超过 ±${formatMoney(MAX_ADJUSTMENT_CENTS)}，超出请走线下审批`);
    }
    const adjustmentNote = String(input.adjustmentNote ?? '').trim();
    if (adjustmentCents !== 0 && !adjustmentNote) throw badRequest('填写了调整金额必须写调整备注');
    if (adjustmentNote.length > 200) throw badRequest('调整备注不能超过 200 个字');
    const note = String(input.note ?? '').trim().slice(0, 200);
    const amountCents = row.baseAmountCents + adjustmentCents;
    if (amountCents < 0) throw badRequest('调整后金额不能为负');

    // 出单之后仍可能出现新的未闭合段/补签申请，入账前按当前数据再算一次，硬阻断不掉链子。
    const blockers = await this.blockersOf(row.storeId, row.userId, row.periodStart, row.periodEnd);
    if (blockers.unclosedCount > 0) {
      throw conflict(
        `还有 ${blockers.unclosedCount} 段未闭合（含待补签），请先补离店或补正后再确认，本张结算单暂不能入账`
      );
    }
    if (blockers.pendingApprovals > 0) {
      throw conflict(`还有 ${blockers.pendingApprovals} 条补签申请在审批中，审批完成后再确认入账`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: row.userId }, select: { name: true } });
    const store = await this.prisma.store.findUnique({ where: { id: row.storeId }, select: { name: true } });
    const now = new Date();

    const posted = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.workSettlement.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== 'draft') throw conflict('结算单已被其他人处理，请刷新后重试');

      // 金额为 0（如不足 1 小时且无调整）不落费用行：报表里 0 元人力行只会制造噪音。
      const expense =
        amountCents > 0
          ? await tx.expense.create({
              data: {
                id: newId('EX'),
                storeId: row.storeId,
                category: 'labor',
                amountCents,
                at: row.periodEnd,
                memo: `劳务结算 · ${user?.name || row.userId}（${formatMinutes(fresh.minutes)}，${
                  fresh.ratePerMinCents
                } 分/分钟）`,
                source: 'settlement',
                sourceKey: `settlement:${row.id}`,
                batchId: null,
                createdBy: staff.id,
                createdAt: now
              }
            })
          : null;

      const updated = await tx.workSettlement.update({
        where: { id },
        data: {
          status: 'posted',
          adjustmentCents,
          adjustmentNote,
          amountCents,
          unclosedCount: blockers.unclosedCount,
          pendingApprovals: blockers.pendingApprovals,
          postedExpenseId: expense?.id ?? null,
          confirmedBy: staff.id,
          confirmedAt: now,
          confirmedNote: note
        }
      });
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '确认劳务结算',
        detail: `${store?.name || row.storeId} · ${user?.name || row.userId} · ${month}：基础 ${formatMoney(
          fresh.baseAmountCents
        )}${adjustmentCents ? `，调整 ${formatMoney(adjustmentCents)}（${adjustmentNote}）` : ''}，入账 ${formatMoney(
          amountCents
        )}`,
        type: 'attendance',
        storeId: row.storeId
      });
      return updated;
    });

    return {
      settlement: (await this.list(staff, { month })).rows.find((item) => item.id === posted.id) ?? null,
      expenseId: posted.postedExpenseId
    };
  }

  // ---------- 内部 ----------

  /** 结算周期内的阻断项：未闭合段数 + 审批中的补签数（按当前数据实时算）。 */
  private async blockersOf(storeId: string, userId: string, start: string, end: string) {
    const rows = await this.prisma.workSession.findMany({
      where: { storeId, userId, businessDate: { gte: start, lte: end }, status: { not: 'voided' } },
      select: { status: true, pendingApprovalId: true }
    });
    return {
      unclosedCount: rows.filter((row) => (UNCLOSED_STATUSES as readonly string[]).includes(row.status)).length,
      pendingApprovals: rows.filter((row) => row.pendingApprovalId != null).length
    };
  }

  private async scopeStores(staff: StaffContext, storeId: string | null) {
    const all = await this.prisma.store.findMany({ orderBy: [{ city: 'asc' }, { id: 'asc' }] });
    if (storeId) {
      const hit = all.find((store) => store.id === storeId);
      if (!hit) throw notFound('门店不存在');
      if (!staff.allStores && !staff.storeIds.includes(storeId)) throw forbidden('当前账号没有该门店的数据权限');
      return [hit];
    }
    return staff.allStores ? all : all.filter((store) => staff.storeIds.includes(store.id));
  }
}