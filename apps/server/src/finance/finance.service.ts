import { Injectable } from '@nestjs/common';
import type { FinanceEntry, Prisma } from '@prisma/client';
import { EXPENSE_CATEGORIES, type DateRange } from '@teahour/shared';
import { PrismaService } from '../common/prisma.service';
import { newId } from '../common/ids';
import { badRequest } from '../common/errors';
import { logAction } from '../common/logs';
import type { StaffContext } from '../common/auth.types';

export type FinanceEntryView = {
  id: string;
  at: number;
  type: string;
  storeId: string;
  orderId: string | null;
  orderNumber: string | null;
  amountCents: number;
  method: string;
  settlement: string;
  memo: string;
  costCents: number;
};

export type SaleMethod = { method: string; settlement: 'settled' | 'pending' };

export type ProfitRow = {
  storeId: string;
  store: string;
  revenueCents: number;
  cogsCents: number;
  remakeCostCents: number;
  remakeCount: number;
  ingredientCostCents: number;
  lossCents: number;
  lossCount: number;
  pendingLossCents: number;
  pendingLossCount: number;
  grossCents: number;
  grossMargin: number | null;
  opexCents: number;
  opexCount: number;
  opexByCategory: Array<{ id: string; name: string; amountCents: number }>;
  netCents: number;
  netMargin: number | null;
  entries: number;
};

export function saleMethod(order: { channel: string; paymentMethod?: string | null }): SaleMethod {
  if (order.channel === 'meituan') return { method: '美团结算', settlement: 'pending' };
  if (order.channel === 'taobao') return { method: '淘宝结算', settlement: 'pending' };
  if (order.channel === 'assisted') return { method: order.paymentMethod || '门店收款', settlement: 'settled' };
  return { method: '微信支付', settlement: 'settled' };
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async addEntry(
    entry: {
      orderId?: string | null;
      storeId: string;
      type: 'SALE' | 'REFUND';
      amountCents: number;
      method: string;
      settlement: 'settled' | 'pending';
      memo?: string;
      costCents?: number;
      dedupeKey: string;
      at?: number;
    },
    db: Prisma.TransactionClient = this.prisma
  ): Promise<void> {
    await db.financeEntry.upsert({
      where: { dedupeKey: entry.dedupeKey },
      create: {
        id: newId('F'),
        orderId: entry.orderId || null,
        storeId: entry.storeId,
        type: entry.type,
        amountCents: entry.amountCents,
        method: entry.method,
        settlement: entry.settlement,
        memo: entry.memo || '',
        costCents: entry.costCents || 0,
        dedupeKey: entry.dedupeKey,
        at: new Date(entry.at ?? Date.now())
      },
      update: {}
    });
  }

  async list(options: {
    range: DateRange;
    storeIds: string[];
    type?: string;
    q?: string;
  }): Promise<FinanceEntryView[]> {
    // SEC-04：空门店范围 = 什么都看不到（fail closed），绝不能退化成全库查询。
    if (!options.storeIds.length) return [];
    const rows = await this.prisma.financeEntry.findMany({
      where: {
        at: { gte: new Date(options.range.from), lt: new Date(options.range.to) },
        storeId: { in: options.storeIds },
        ...(options.type && options.type !== 'all' ? { type: options.type } : {})
      },
      include: { order: true },
      orderBy: [{ at: 'desc' }, { id: 'desc' }]
    });
    const stores = await this.prisma.store.findMany();
    const names = new Map(stores.map((s) => [s.id, s.name]));
    const q = (options.q || '').trim().toLowerCase();
    return rows
      .map((row) => this.toView(row, row.order?.number ?? null, names.get(row.storeId) ?? null))
      .filter((row) =>
        !q ? true : `${row.orderNumber || ''}${row.memo}${row.storeName ?? ''}`.toLowerCase().includes(q)
      );
  }

  private toView(row: FinanceEntry, orderNumber: string | null, storeName: string | null) {
    return {
      id: row.id,
      orderId: row.orderId,
      orderNumber,
      storeId: row.storeId,
      storeName: row.storeId === 'brand' ? '品牌零售' : storeName || row.storeId,
      type: row.type,
      amountCents: row.amountCents,
      method: row.method,
      settlement: row.settlement,
      memo: row.memo,
      costCents: row.costCents,
      at: row.at.getTime()
    };
  }

  summary(entries: FinanceEntryView[]) {
    const sum = (list: FinanceEntryView[]) => list.reduce((n, x) => n + x.amountCents, 0);
    const sales = entries.filter((x) => x.type === 'SALE');
    const refunds = entries.filter((x) => x.type === 'REFUND');
    const settled = entries.filter((x) => x.settlement === 'settled');
    const pending = entries.filter((x) => x.settlement === 'pending');
    return {
      entries: entries.length,
      grossSalesCents: sum(sales),
      refundsCents: -sum(refunds),
      netCents: sum(entries),
      settledCents: sum(settled),
      pendingCents: sum(pending),
      cashCents: sum(entries.filter((x) => x.method.includes('现金'))),
      wechatCents: sum(entries.filter((x) => x.method.includes('微信'))),
      saleCount: sales.length,
      refundCount: refunds.length
    };
  }

  async profitReport(options: { range: DateRange; storeIds: string[]; includeBrand?: boolean }) {
    const storeRows = await this.prisma.store.findMany();
    const storeNames = new Map(storeRows.map((s) => [s.id, s.name]));
    const scope = [...new Set(options.storeIds)];
    if (options.includeBrand) scope.push('brand');
    const rows: ProfitRow[] = [];
    for (const storeId of scope) {
      const entries = await this.prisma.financeEntry.findMany({
        where: {
          storeId,
          at: { gte: new Date(options.range.from), lt: new Date(options.range.to) }
        }
      });
      const revenue = entries.reduce((n, x) => n + x.amountCents, 0);
      const cogs = entries.reduce((n, x) => n + x.costCents, 0);
      const remakes = await this.prisma.order.findMany({
        where: {
          business: 'fresh',
          parentOrderId: { not: null },
          storeId,
          createdAt: { gte: new Date(options.range.from), lt: new Date(options.range.to) }
        },
        include: { items: true }
      });
      const remakeCost = remakes.reduce((n, order) => n + order.items.reduce((m, item) => m + item.costCents, 0), 0);
      const losses = await this.prisma.loss.findMany({
        where: { storeId, status: { in: ['approved', 'pending'] } }
      });
      const inRange = (value: Date) => value.getTime() >= options.range.from && value.getTime() < options.range.to;
      const approved = losses.filter(
        (loss) => loss.status === 'approved' && inRange(loss.decidedAt ?? loss.at)
      );
      const pending = losses.filter((loss) => loss.status === 'pending' && inRange(loss.at));
      const expenseRows = await this.prisma.expense.findMany({
        where: {
          storeId,
          voidedAt: null,
          at: { gte: options.range.fromDate, lte: options.range.toDate }
        }
      });
      const opex = expenseRows.reduce((n, x) => n + x.amountCents, 0);
      const opexByCategory = EXPENSE_CATEGORIES.map((category) => ({
        id: category.id,
        name: category.name,
        amountCents: expenseRows.filter((x) => x.category === category.id).reduce((n, x) => n + x.amountCents, 0)
      }));
      const loss = approved.reduce((n, x) => n + x.amountCents, 0);
      const ingredientCost = cogs + remakeCost;
      const gross = revenue - ingredientCost - loss;
      const net = gross - opex;
      rows.push({
        storeId,
        store: storeId === 'brand' ? '品牌零售' : storeNames.get(storeId) || storeId,
        revenueCents: revenue,
        cogsCents: cogs,
        remakeCostCents: remakeCost,
        remakeCount: remakes.length,
        ingredientCostCents: ingredientCost,
        lossCents: loss,
        lossCount: approved.length,
        pendingLossCents: pending.reduce((n, x) => n + x.amountCents, 0),
        pendingLossCount: pending.length,
        grossCents: gross,
        grossMargin: revenue > 0 ? (gross / revenue) * 100 : null,
        opexCents: opex,
        opexCount: expenseRows.length,
        opexByCategory,
        netCents: net,
        netMargin: revenue > 0 ? (net / revenue) * 100 : null,
        entries: entries.length
      });
    }
    const totalRevenue = rows.reduce((n, x) => n + x.revenueCents, 0);
    const totals = {
      revenueCents: totalRevenue,
      cogsCents: rows.reduce((n, x) => n + x.cogsCents, 0),
      remakeCostCents: rows.reduce((n, x) => n + x.remakeCostCents, 0),
      ingredientCostCents: rows.reduce((n, x) => n + x.ingredientCostCents, 0),
      lossCents: rows.reduce((n, x) => n + x.lossCents, 0),
      pendingLossCents: rows.reduce((n, x) => n + x.pendingLossCents, 0),
      grossCents: rows.reduce((n, x) => n + x.grossCents, 0),
      opexCents: rows.reduce((n, x) => n + x.opexCents, 0),
      netCents: rows.reduce((n, x) => n + x.netCents, 0),
      opexCount: rows.reduce((n, x) => n + x.opexCount, 0),
      netMargin:
        totalRevenue > 0
          ? (rows.reduce((n, x) => n + x.netCents, 0) / totalRevenue) * 100
          : null
    };
    const opexByCategory = EXPENSE_CATEGORIES.map((category) => ({
      id: category.id,
      name: category.name,
      amountCents: rows.reduce(
        (n, row) => n + (row.opexByCategory.find((x) => x.id === category.id)?.amountCents || 0),
        0
      )
    }));
    return { rows, totals: { ...totals, opexByCategory } };
  }

  async refundFlow(): Promise<{ enabled: boolean; thresholdCents: number; approvers: string[] }> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'refundFlow' } });
    return row
      ? (JSON.parse(row.valueJson) as { enabled: boolean; thresholdCents: number; approvers: string[] })
      : { enabled: true, thresholdCents: 5000, approvers: [] };
  }

  /** 退款审批规则：是否启用、超过多少金额需要总部审批。改动立即影响后续退款申请。 */
  async saveRefundFlow(
    staff: StaffContext,
    input: { enabled?: boolean; thresholdCents?: number }
  ): Promise<{ enabled: boolean; thresholdCents: number; approvers: string[] }> {
    const current = await this.refundFlow();
    const enabled = input.enabled == null ? current.enabled : Boolean(input.enabled);
    const threshold =
      input.thresholdCents == null ? current.thresholdCents : Math.round(Number(input.thresholdCents));
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10_000_000) {
      throw badRequest('审批门槛应为 0–100000 元之间的整数分');
    }
    const next = { enabled, thresholdCents: threshold, approvers: current.approvers };
    await this.prisma.setting.upsert({
      where: { key: 'refundFlow' },
      create: { key: 'refundFlow', valueJson: JSON.stringify(next) },
      update: { valueJson: JSON.stringify(next) }
    });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '更新退款审批规则',
      detail: enabled ? `启用，门槛 ${(threshold / 100).toFixed(2)} 元` : '停用',
      type: 'approval'
    });
    return next;
  }
}
