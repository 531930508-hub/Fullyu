import type { Database as DatabaseType } from 'better-sqlite3';
import type { DateRange } from '../lib/dates.js';

const SERIES = [
  { id: 'xing', name: '醒', nameEn: 'GOOD DAY' },
  { id: 'song', name: '松', nameEn: 'CHILL' },
  { id: 'qing', name: '庆', nameEn: 'CHEERS' },
  { id: 'mian', name: '眠', nameEn: 'GOOD NIGHT' },
  { id: 'retail', name: '零售', nameEn: 'RETAIL' }
];

const storeFilter = (storeIds: string[]) =>
  storeIds.length ? `IN (${storeIds.map(() => '?').join(',')})` : null;

export function overview(db: DatabaseType, options: { range: DateRange; storeIds: string[] }) {
  const { range, storeIds } = options;
  const inClause = storeFilter(storeIds);
  const financeWhere = inClause ? `AND store_id ${inClause}` : '';
  const orderWhere = inClause ? `AND o.store_id ${inClause}` : '';

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'SALE' THEN amount_cents ELSE 0 END), 0) AS gross,
         COALESCE(SUM(CASE WHEN type = 'REFUND' THEN amount_cents ELSE 0 END), 0) AS refunds,
         COALESCE(SUM(amount_cents), 0) AS net,
         COUNT(*) AS entries
       FROM finance_entries WHERE at >= ? AND at < ? ${financeWhere}`
    )
    .get(range.from, range.to, ...storeIds) as { gross: number; refunds: number; net: number; entries: number };

  const orderStats = db
    .prepare(
      `SELECT COUNT(*) AS orders,
         COALESCE(SUM(CASE WHEN o.business = 'fresh' THEN o.total_cents ELSE 0 END), 0) AS fresh_sales,
         COALESCE(SUM(CASE WHEN o.business = 'retail' THEN o.total_cents ELSE 0 END), 0) AS retail_sales
       FROM orders o WHERE o.payment_status = 'paid' AND o.created_at >= ? AND o.created_at < ? ${orderWhere}`
    )
    .get(range.from, range.to, ...storeIds) as { orders: number; fresh_sales: number; retail_sales: number };

  const cups = db
    .prepare(
      `SELECT COUNT(*) AS n FROM order_units u JOIN orders o ON o.id = u.order_id
       WHERE o.payment_status = 'paid' AND o.created_at >= ? AND o.created_at < ? ${inClause ? `AND o.store_id ${inClause}` : ''}`
    )
    .get(range.from, range.to, ...storeIds) as { n: number };

  const seriesRows = db
    .prepare(
      `SELECT oi.series, COALESCE(SUM(oi.qty - oi.refunded_qty),0) AS qty, COALESCE(SUM(oi.total_cents),0) AS amount
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.payment_status = 'paid' AND o.created_at >= ? AND o.created_at < ? ${orderWhere}
       GROUP BY oi.series`
    )
    .all(range.from, range.to, ...storeIds) as Array<{ series: string; qty: number; amount: number }>;

  const bySeries = SERIES.map((series) => {
    const rows = seriesRows.filter((x) => x.series === series.id);
    return {
      ...series,
      qty: rows.reduce((n, x) => n + x.qty, 0),
      amountCents: rows.reduce((n, x) => n + x.amount, 0)
    };
  });

  const storeRows = db
    .prepare(
      `SELECT f.store_id, COALESCE(SUM(f.amount_cents),0) AS amount, COUNT(*) AS entries,
         COALESCE(SUM(CASE WHEN f.type = 'SALE' THEN f.amount_cents ELSE 0 END),0) AS gross,
         COALESCE(SUM(CASE WHEN f.type = 'REFUND' THEN f.amount_cents ELSE 0 END),0) AS refunds
       FROM finance_entries f WHERE f.at >= ? AND f.at < ? ${inClause ? `AND f.store_id ${inClause}` : ''}
       GROUP BY f.store_id`
    )
    .all(range.from, range.to, ...storeIds) as Array<{
    store_id: string;
    amount: number;
    entries: number;
    gross: number;
    refunds: number;
  }>;
  const names = new Map(
    (db.prepare('SELECT id, name FROM stores').all() as Array<{ id: string; name: string }>).map((x) => [x.id, x.name])
  );
  const byStore = storeRows.map((row) => ({
    storeId: row.store_id,
    store: row.store_id === 'brand' ? '品牌零售' : names.get(row.store_id) || row.store_id,
    amountCents: row.amount,
    grossCents: row.gross,
    refundsCents: -row.refunds,
    entries: row.entries
  }));

  const daily = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch', 'localtime') AS day,
         COALESCE(SUM(CASE WHEN type = 'SALE' THEN amount_cents ELSE 0 END),0) AS gross,
         COALESCE(SUM(amount_cents),0) AS net,
         COUNT(*) AS entries
       FROM finance_entries WHERE at >= ? AND at < ? ${financeWhere}
       GROUP BY day ORDER BY day`
    )
    .all(range.from, range.to, ...storeIds) as Array<{ day: string; gross: number; net: number; entries: number }>;

  const topProducts = db
    .prepare(
      `SELECT oi.name, oi.series, COALESCE(SUM(oi.qty - oi.refunded_qty),0) AS qty,
         COALESCE(SUM(oi.total_cents),0) AS amount
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.payment_status = 'paid' AND o.created_at >= ? AND o.created_at < ? ${orderWhere}
       GROUP BY oi.product_id ORDER BY amount DESC LIMIT 10`
    )
    .all(range.from, range.to, ...storeIds) as Array<{ name: string; series: string; qty: number; amount: number }>;

  return {
    range: { from: range.fromDate, to: range.toDate },
    revenueCents: totals.net,
    grossCents: totals.gross,
    refundsCents: -totals.refunds,
    financeEntries: totals.entries,
    orderCount: orderStats.orders,
    freshSalesCents: orderStats.fresh_sales,
    retailSalesCents: orderStats.retail_sales,
    cups: cups.n,
    averageOrderCents: orderStats.orders ? Math.round(totals.net / orderStats.orders) : 0,
    bySeries,
    byStore,
    daily,
    topProducts
  };
}
