import type { Database as DatabaseType } from 'better-sqlite3';
import { newId } from '../lib/ids.js';
import { EXPENSE_CATEGORIES } from '../lib/csv.js';
import type { DateRange } from '../lib/dates.js';

export type FinanceEntry = {
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

export function addFinanceEntry(
  db: DatabaseType,
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
  }
): void {
  db.prepare(
    `INSERT INTO finance_entries (id, order_id, store_id, type, amount_cents, method, settlement, memo, cost_cents, dedupe_key, at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(dedupe_key) DO NOTHING`
  ).run(
    newId('F'),
    entry.orderId || null,
    entry.storeId,
    entry.type,
    entry.amountCents,
    entry.method,
    entry.settlement,
    entry.memo || '',
    entry.costCents || 0,
    entry.dedupeKey,
    entry.at || Date.now()
  );
}

export function listFinance(
  db: DatabaseType,
  options: { range: DateRange; storeIds: string[]; type?: string; q?: string }
) {
  const clauses = ['f.at >= ?', 'f.at < ?'];
  const params: unknown[] = [options.range.from, options.range.to];
  if (options.storeIds.length) {
    clauses.push(`f.store_id IN (${options.storeIds.map(() => '?').join(',')})`);
    params.push(...options.storeIds);
  }
  if (options.type && options.type !== 'all') {
    clauses.push('f.type = ?');
    params.push(options.type);
  }
  const rows = db
    .prepare(
      `SELECT f.*, o.number AS order_number, s.name AS store_name
       FROM finance_entries f
       LEFT JOIN orders o ON o.id = f.order_id
       LEFT JOIN stores s ON s.id = f.store_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY f.at DESC, f.id DESC`
    )
    .all(...params) as Array<{
    id: string;
    order_id: string | null;
    order_number: string | null;
    store_id: string;
    store_name: string | null;
    type: string;
    amount_cents: number;
    method: string;
    settlement: string;
    memo: string;
    cost_cents: number;
    at: number;
  }>;
  const q = (options.q || '').trim().toLowerCase();
  const entries = rows
    .map((row) => ({
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      storeId: row.store_id,
      storeName: row.store_id === 'brand' ? '品牌零售' : row.store_name || row.store_id,
      type: row.type,
      amountCents: row.amount_cents,
      method: row.method,
      settlement: row.settlement,
      memo: row.memo,
      costCents: row.cost_cents,
      at: row.at
    }))
    .filter((row) =>
      !q
        ? true
        : `${row.orderNumber || ''}${row.memo}${row.storeName}`.toLowerCase().includes(q)
    );
  return entries;
}

export function financeSummary(entries: FinanceEntry[]) {
  const sum = (list: FinanceEntry[]) => list.reduce((n, x) => n + x.amountCents, 0);
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

export type ProfitScope = string[];

function expensesFor(db: DatabaseType, storeId: string, range: DateRange) {
  return db
    .prepare(
      `SELECT category, amount_cents FROM expenses
       WHERE store_id = ? AND voided_at IS NULL AND at >= ? AND at <= ?`
    )
    .all(storeId, range.fromDate, range.toDate) as Array<{ category: string; amount_cents: number }>;
}

export function profitReport(db: DatabaseType, options: { range: DateRange; storeIds: ProfitScope; includeBrand?: boolean }) {
  const storeNames = new Map(
    (db.prepare('SELECT id, name FROM stores').all() as Array<{ id: string; name: string }>).map((s) => [s.id, s.name])
  );
  const scope = [...new Set(options.storeIds)];
  if (options.includeBrand) scope.push('brand');
  const rows = scope.map((storeId) => {
    const entries = db
      .prepare(
        'SELECT amount_cents, cost_cents FROM finance_entries WHERE store_id = ? AND at >= ? AND at < ?'
      )
      .all(storeId, options.range.from, options.range.to) as Array<{ amount_cents: number; cost_cents: number }>;
    const revenue = entries.reduce((n, x) => n + x.amount_cents, 0);
    const cogs = entries.reduce((n, x) => n + x.cost_cents, 0);
    const remakes = db
      .prepare(
        `SELECT COALESCE(SUM(oi.cost_cents), 0) AS cost, COUNT(DISTINCT o.id) AS count
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.business = 'fresh' AND o.parent_order_id IS NOT NULL
           AND o.store_id = ? AND o.created_at >= ? AND o.created_at < ?`
      )
      .get(storeId, options.range.from, options.range.to) as { cost: number; count: number };
    const approved = db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents),0) AS amount, COUNT(*) AS count
         FROM losses WHERE store_id = ? AND status = 'approved'
           AND COALESCE(decided_at, at) >= ? AND COALESCE(decided_at, at) < ?`
      )
      .get(storeId, options.range.from, options.range.to) as { amount: number; count: number };
    const pending = db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents),0) AS amount, COUNT(*) AS count
         FROM losses WHERE store_id = ? AND status = 'pending' AND at >= ? AND at < ?`
      )
      .get(storeId, options.range.from, options.range.to) as { amount: number; count: number };
    const opexRows = expensesFor(db, storeId, options.range);
    const opex = opexRows.reduce((n, x) => n + x.amount_cents, 0);
    const opexByCategory = EXPENSE_CATEGORIES.map((category) => ({
      id: category.id,
      name: category.name,
      amountCents: opexRows.filter((x) => x.category === category.id).reduce((n, x) => n + x.amount_cents, 0)
    }));
    const ingredientCost = cogs + remakes.cost;
    const loss = approved.amount;
    const gross = revenue - ingredientCost - loss;
    const net = gross - opex;
    return {
      storeId,
      store: storeId === 'brand' ? '品牌零售' : storeNames.get(storeId) || storeId,
      revenueCents: revenue,
      cogsCents: cogs,
      remakeCostCents: remakes.cost,
      remakeCount: remakes.count,
      ingredientCostCents: ingredientCost,
      lossCents: loss,
      lossCount: approved.count,
      pendingLossCents: pending.amount,
      pendingLossCount: pending.count,
      grossCents: gross,
      grossMargin: revenue > 0 ? (gross / revenue) * 100 : null,
      opexCents: opex,
      opexCount: opexRows.length,
      opexByCategory,
      netCents: net,
      netMargin: revenue > 0 ? (net / revenue) * 100 : null,
      entries: entries.length
    };
  });
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
    netMargin: totalRevenue > 0 ? (rows.reduce((n, x) => n + x.netCents, 0) / totalRevenue) * 100 : null
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

export function saleMethod(order: {
  channel: string;
  paymentMethod?: string | null;
}): { method: string; settlement: 'settled' | 'pending' } {
  if (order.channel === 'meituan') return { method: '美团结算', settlement: 'pending' };
  if (order.channel === 'taobao') return { method: '淘宝结算', settlement: 'pending' };
  if (order.channel === 'assisted') return { method: order.paymentMethod || '模拟收款', settlement: 'settled' };
  return { method: '微信支付', settlement: 'settled' };
}
