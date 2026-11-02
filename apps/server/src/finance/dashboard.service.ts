import { Injectable } from '@nestjs/common';
import { addDays, toDateString, type DateRange } from '@teahour/shared';
import { PrismaService } from '../common/prisma.service';

const SERIES = [
  { id: 'xing', name: '醒', nameEn: 'GOOD DAY' },
  { id: 'song', name: '松', nameEn: 'CHILL' },
  { id: 'qing', name: '庆', nameEn: 'CHEERS' },
  { id: 'mian', name: '眠', nameEn: 'GOOD NIGHT' },
  { id: 'retail', name: '零售', nameEn: 'RETAIL' }
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(options: { range: DateRange; storeIds: string[] }) {
    const { range, storeIds } = options;
    const from = new Date(range.from);
    const to = new Date(range.to);
    // SEC-04：空门店范围 = 什么都看不到（fail closed），直接返回零值报表。
    if (!storeIds.length) {
      return {
        range: { from: range.fromDate, to: range.toDate },
        revenueCents: 0,
        grossCents: 0,
        refundsCents: 0,
        financeEntries: 0,
        orderCount: 0,
        freshSalesCents: 0,
        retailSalesCents: 0,
        cups: 0,
        averageOrderCents: 0,
        bySeries: SERIES.map((series) => ({ ...series, qty: 0, amountCents: 0 })),
        byStore: [],
        daily: [],
        topProducts: []
      };
    }
    const storeFilter = { in: storeIds };

    const entries = await this.prisma.financeEntry.findMany({
      where: { at: { gte: from, lt: to }, ...(storeFilter ? { storeId: storeFilter } : {}) }
    });
    const gross = entries.filter((x) => x.type === 'SALE').reduce((n, x) => n + x.amountCents, 0);
    const refunds = entries.filter((x) => x.type === 'REFUND').reduce((n, x) => n + x.amountCents, 0);
    const net = entries.reduce((n, x) => n + x.amountCents, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        paymentStatus: 'paid',
        createdAt: { gte: from, lt: to },
        ...(storeFilter ? { storeId: storeFilter } : {})
      },
      include: { items: true }
    });
    const freshSales = orders
      .filter((x) => x.business === 'fresh')
      .reduce((n, x) => n + x.totalCents, 0);
    const retailSales = orders
      .filter((x) => x.business === 'retail')
      .reduce((n, x) => n + x.totalCents, 0);
    const cups = await this.prisma.orderUnit.count({
      where: {
        order: {
          paymentStatus: 'paid',
          createdAt: { gte: from, lt: to },
          ...(storeFilter ? { storeId: storeFilter } : {})
        }
      }
    });

    const items = orders.flatMap((order) => order.items);
    const bySeries = SERIES.map((series) => {
      const rows = items.filter((x) => x.series === series.id);
      return {
        ...series,
        qty: rows.reduce((n, x) => n + x.qty - x.refundedQty, 0),
        amountCents: rows.reduce((n, x) => n + x.totalCents, 0)
      };
    });

    const stores = await this.prisma.store.findMany();
    const names = new Map(stores.map((x) => [x.id, x.name]));
    const storeMap = new Map<
      string,
      { storeId: string; store: string; amountCents: number; grossCents: number; refundsCents: number; entries: number }
    >();
    for (const entry of entries) {
      const current = storeMap.get(entry.storeId) || {
        storeId: entry.storeId,
        store: entry.storeId === 'brand' ? '品牌零售' : names.get(entry.storeId) || entry.storeId,
        amountCents: 0,
        grossCents: 0,
        refundsCents: 0,
        entries: 0
      };
      current.amountCents += entry.amountCents;
      current.grossCents += entry.type === 'SALE' ? entry.amountCents : 0;
      current.refundsCents += entry.type === 'REFUND' ? entry.amountCents : 0;
      current.entries += 1;
      storeMap.set(entry.storeId, current);
    }
    const byStore = Array.from(storeMap.values()).map((row) => ({
      ...row,
      refundsCents: -row.refundsCents
    }));

    const dailyMap = new Map<string, { day: string; gross: number; net: number; entries: number }>();
    for (const entry of entries) {
      const day = toDateString(entry.at);
      const current = dailyMap.get(day) || { day, gross: 0, net: 0, entries: 0 };
      current.gross += entry.type === 'SALE' ? entry.amountCents : 0;
      current.net += entry.amountCents;
      current.entries += 1;
      dailyMap.set(day, current);
    }
    // 按所选区间补零：即使某天没有流水也保留一根空柱，用户能直接看出区间确实生效。
    const daily: Array<{ day: string; gross: number; net: number; entries: number }> = [];
    for (let day = range.fromDate; day <= range.toDate; day = addDays(day, 1)) {
      daily.push(dailyMap.get(day) || { day, gross: 0, net: 0, entries: 0 });
    }

    const productMap = new Map<string, { name: string; series: string; qty: number; amount: number }>();
    for (const item of items) {
      const current = productMap.get(item.productId) || {
        name: item.name,
        series: item.series,
        qty: 0,
        amount: 0
      };
      current.qty += item.qty - item.refundedQty;
      current.amount += item.totalCents;
      productMap.set(item.productId, current);
    }
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return {
      range: { from: range.fromDate, to: range.toDate },
      revenueCents: net,
      grossCents: gross,
      refundsCents: -refunds,
      financeEntries: entries.length,
      orderCount: orders.length,
      freshSalesCents: freshSales,
      retailSalesCents: retailSales,
      cups,
      averageOrderCents: orders.length ? Math.round(net / orders.length) : 0,
      bySeries,
      byStore,
      daily,
      topProducts
    };
  }
}
