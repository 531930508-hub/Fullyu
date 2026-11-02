import type { Database as DatabaseType } from 'better-sqlite3';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { assertStoreAccess, hasPerm, type StaffUser } from '../lib/auth.js';
import { addFinanceEntry, saleMethod } from './finance.js';
import { enqueuePrintJob, processPrintJob } from './printing.js';
import { cupLabel, newId, nextSequence, dayStamp, uniquePickupCode } from '../lib/ids.js';
import { hardware } from '../hardware/index.js';
import { logAction } from '../db/index.js';
import {
  mapOrder,
  type OrderItemRow,
  type OrderRow,
  type ProductRow,
  type UnitRow
} from './mappers.js';

export type OrderLineInput = {
  productId: string;
  qty: number;
  temp?: string | null;
  ice?: string | null;
};

export type CreateOrderInput = {
  storeId?: string;
  business: 'fresh' | 'retail';
  channel: 'mini' | 'assisted' | 'meituan' | 'taobao';
  type: 'dine' | 'takeaway' | 'delivery' | 'retail';
  seat?: string | null;
  items: OrderLineInput[];
  note?: string;
  customerId?: string | null;
  ownerKind?: 'customer' | 'guest';
  memberDiscountPerCupCents?: number;
  paymentMethod?: 'wechat' | 'alipay' | 'cash';
  actor?: StaffUser;
  externalRef?: string;
};

function storeName(db: DatabaseType, id: string): string {
  if (id === 'brand') return '品牌零售';
  const row = db.prepare('SELECT name FROM stores WHERE id = ?').get(id) as { name: string } | undefined;
  return row?.name || id;
}

export function getOrderRow(db: DatabaseType, id: string): OrderRow {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
  if (!row) throw notFound('订单不存在');
  return row;
}

export function getOrder(db: DatabaseType, id: string) {
  const row = getOrderRow(db, id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid').all(id) as OrderItemRow[];
  const units = db
    .prepare('SELECT * FROM order_units WHERE order_id = ? ORDER BY label')
    .all(id) as UnitRow[];
  return mapOrder(row, items, units, storeName(db, row.store_id));
}

function assertStaffStore(user: StaffUser | undefined, storeId: string): void {
  if (!user) throw forbidden('需要员工身份');
  assertStoreAccess(user, storeId);
}

function nextFreshNumber(db: DatabaseType, storeId: string, remake: boolean): string {
  const prefix = remake ? 'R' : storeId.startsWith('sh') ? 'A' : 'B';
  for (let i = 0; i < 20; i += 1) {
    const value = nextSequence(db, `order:${prefix}`);
    const number = `${prefix}${String(value).padStart(3, '0')}`;
    const exists = db.prepare('SELECT 1 FROM orders WHERE number = ?').get(number);
    if (!exists) return number;
  }
  throw conflict('订单号生成冲突，请重试');
}

function nextRetailNumber(db: DatabaseType, now: number): string {
  const stamp = dayStamp(now);
  for (let i = 0; i < 100; i += 1) {
    const value = nextSequence(db, `retail:${stamp}`);
    const number = `TH-R-${stamp}-${String(value).padStart(4, '0')}`;
    const exists = db.prepare('SELECT 1 FROM orders WHERE number = ?').get(number);
    if (!exists) return number;
  }
  throw conflict('零售订单号生成冲突，请重试');
}

type PreparedLine = {
  product: ProductRow;
  qty: number;
  module: 'fresh' | 'retail';
  unitPriceCents: number;
  totalCents: number;
  costCents: number;
  temp: string | null;
  ice: string | null;
};

function prepareLines(
  db: DatabaseType,
  input: CreateOrderInput,
  storeId: string
): { lines: PreparedLine[]; grossCents: number; totalCents: number; discountCents: number; costCents: number } {
  if (!Array.isArray(input.items) || !input.items.length) throw badRequest('订单没有商品');
  if (input.items.length > 30) throw badRequest('单次最多 30 个商品行');
  const seen = new Map<string, OrderLineInput>();
  for (const line of input.items) {
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw badRequest('商品数量须为 1–20 的整数');
    const existing = seen.get(line.productId);
    if (existing) {
      existing.qty += qty;
      if (existing.qty > 20) throw badRequest('同一商品单次最多 20 件');
    } else {
      seen.set(line.productId, { ...line, qty });
    }
  }
  const lines: PreparedLine[] = [];
  let grossCents = 0;
  let discountCents = 0;
  let costCents = 0;
  for (const line of seen.values()) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(line.productId) as ProductRow | undefined;
    if (!product) throw badRequest(`商品不存在：${line.productId}`);
    if (product.status !== 'published') throw badRequest(`${product.name} 已下架`);
    if (input.business === 'fresh' && product.kind !== 'tea') {
      throw badRequest('鲜酿订单只能包含现制茶饮；零售商品请单独下单');
    }
    if (input.business === 'retail' && product.kind === 'tea') {
      throw badRequest('现制茶饮请使用鲜酿下单');
    }
    const stock = db
      .prepare('SELECT grams, sold_out FROM stock WHERE store_id = ? AND product_id = ?')
      .get(storeId, product.id) as { grams: number; sold_out: number } | undefined;
    if (input.business === 'fresh') {
      if (!stock || stock.sold_out) throw conflict(`${product.name} 在本店已售罄`);
      if (stock.grams < product.dose_g * line.qty) throw conflict(`${product.name} 本店库存不足`);
    }
    const discount =
      input.business === 'fresh' &&
      input.channel === 'mini' &&
      product.member_eligible &&
      input.memberDiscountPerCupCents
        ? Math.min(Math.max(0, Math.round(input.memberDiscountPerCupCents)), product.price_cents)
        : 0;
    const unitPriceCents = product.price_cents - discount;
    const amount = unitPriceCents * line.qty;
    grossCents += product.price_cents * line.qty;
    discountCents += discount * line.qty;
    costCents += product.cost_cents * line.qty;
    lines.push({
      product,
      qty: line.qty,
      module: product.kind === 'tea' ? 'fresh' : 'retail',
      unitPriceCents,
      totalCents: amount,
      costCents: product.cost_cents * line.qty,
      temp: line.temp || (product.kind === 'tea' ? '热' : null),
      ice: line.ice || (product.kind === 'tea' ? '标准冰' : null)
    });
  }
  return { lines, grossCents, totalCents: grossCents - discountCents, discountCents, costCents };
}

function reserveStock(db: DatabaseType, storeId: string, lines: PreparedLine[]): void {
  for (const line of lines) {
    if (line.product.kind !== 'tea') continue;
    const res = db
      .prepare('UPDATE stock SET grams = grams - ? WHERE store_id = ? AND product_id = ? AND grams >= ?')
      .run(line.product.dose_g * line.qty, storeId, line.product.id, line.product.dose_g * line.qty);
    if (!res.changes) throw conflict(`${line.product.name} 本店库存不足`);
  }
}

function releaseStock(db: DatabaseType, storeId: string, lines: PreparedLine[]): void {
  for (const line of lines) {
    if (line.product.kind !== 'tea') continue;
    db.prepare('UPDATE stock SET grams = grams + ? WHERE store_id = ? AND product_id = ?').run(
      line.product.dose_g * line.qty,
      storeId,
      line.product.id
    );
  }
}

function createUnpaidOrder(
  db: DatabaseType,
  input: CreateOrderInput,
  storeId: string,
  prepared: ReturnType<typeof prepareLines>
): string {
  const now = Date.now();
  const id = newId('SO');
  const number = input.business === 'retail' ? nextRetailNumber(db, now) : nextFreshNumber(db, storeId, false);
  const external = input.channel === 'meituan' || input.channel === 'taobao';
  const insert = db.transaction(() => {
    if (input.business === 'fresh') reserveStock(db, storeId, prepared.lines);
    db.prepare(
      `INSERT INTO orders (id, number, business, store_id, channel, type, seat, status, payment_status, total_cents, refunded_cents,
        pickup_code, pickup_store_id, print_status, parent_order_id, note, customer_id, owner_kind, created_by, payment_ref, payment_method,
        prepared_at, created_at, paid_at, delivered_at, refund_pending)
       VALUES (?,?,?,?,?,?,?, 'unpaid','unpaid',?,0,NULL,NULL,'pending',NULL,?,?,?,?,NULL,?,NULL,?,NULL,NULL,0)`
    ).run(
      id,
      number,
      input.business,
      input.business === 'retail' ? 'brand' : storeId,
      input.channel,
      input.business === 'retail' ? 'retail' : input.type,
      input.type === 'dine' ? input.seat || '' : null,
      prepared.totalCents,
      String(input.note || '').slice(0, 200),
      input.customerId || null,
      input.ownerKind || 'customer',
      input.actor?.id || null,
      input.paymentMethod || (external ? null : 'wechat'),
      now
    );
    const insertItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, name, name_en, kind, series, qty, refunded_qty, unit_price_cents, total_cents, cost_cents, temp, ice)
       VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?)`
    );
    for (const line of prepared.lines) {
      const itemId = newId('OI');
      insertItem.run(
        itemId,
        id,
        line.product.id,
        line.product.name,
        line.product.name_en,
        line.product.kind,
        line.product.series,
        line.qty,
        line.unitPriceCents,
        line.totalCents,
        line.costCents,
        line.temp,
        line.ice
      );
    }
    logAction(db, {
      actorId: input.actor?.id || null,
      actorName: input.actor?.name || (input.ownerKind === 'customer' ? '顾客' : '系统'),
      action: external ? '接收平台订单' : '提交订单',
      detail: `${number} · ${storeName(db, input.business === 'retail' ? 'brand' : storeId)}`,
      type: 'order',
      storeId: input.business === 'retail' ? 'brand' : storeId,
      orderId: id
    });
  });
  insert();
  return id;
}

function assignPickupCode(db: DatabaseType): string {
  const taken = new Set(
    (
      db
        .prepare("SELECT pickup_code FROM orders WHERE business = 'retail' AND status = 'awaiting' AND pickup_code IS NOT NULL")
        .all() as Array<{ pickup_code: string }>
    ).map((x) => x.pickup_code)
  );
  return uniquePickupCode((code) => taken.has(code));
}

function methodLabel(method: string): string {
  if (method === 'cash') return '现金';
  if (method === 'alipay') return '支付宝';
  return '微信支付';
}

function markPaid(db: DatabaseType, orderId: string, paymentRef: string): void {
  const now = Date.now();
  const tx = db.transaction(() => {
    const order = getOrderRow(db, orderId);
    if (order.payment_status === 'paid') return order;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid').all(orderId) as OrderItemRow[];
    const method = saleMethod({
      channel: order.channel,
      paymentMethod: order.payment_method ? methodLabel(order.payment_method) : null
    });
    db.prepare(
      "UPDATE orders SET status = ?, payment_status = 'paid', paid_at = ?, payment_ref = ?, pickup_code = ?, print_status = ? WHERE id = ?"
    ).run(
      order.business === 'retail' ? 'awaiting' : 'pending',
      now,
      paymentRef,
      order.business === 'retail' ? assignPickupCode(db) : null,
      order.business === 'retail' ? 'none' : 'queued',
      orderId
    );
    if (order.business === 'fresh') {
      const insertUnit = db.prepare(
        'INSERT INTO order_units (id, order_id, item_id, label, status, scanned_at) VALUES (?,?,?,?,?,NULL)'
      );
      let cup = 0;
      for (const item of items) {
        for (let i = 0; i < item.qty; i += 1) {
          cup += 1;
          insertUnit.run(newId('U'), orderId, item.id, cupLabel(order.number, cup), 'pending');
        }
      }
    }
    addFinanceEntry(db, {
      orderId,
      storeId: order.business === 'retail' ? 'brand' : order.store_id,
      type: 'SALE',
      amountCents: order.total_cents,
      method: method.method,
      settlement: method.settlement,
      memo: order.business === 'retail' ? '零售订单收款' : '订单收款',
      costCents: items.reduce((n, x) => n + x.cost_cents, 0),
      dedupeKey: `ORDER:${orderId}:SALE`,
      at: now
    });
    logAction(db, {
      actorId: null,
      actorName: '支付网关',
      action: '支付成功',
      detail: `${order.number} · ¥${(order.total_cents / 100).toFixed(2)}`,
      type: 'payment',
      storeId: order.business === 'retail' ? 'brand' : order.store_id,
      orderId,
      at: now
    });
    if (order.business === 'fresh') enqueuePrintJob(db, orderId);
  });
  tx();
}

function markPaymentFailed(db: DatabaseType, orderId: string, reason: string): void {
  const order = getOrderRow(db, orderId);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as OrderItemRow[];
  const tx = db.transaction(() => {
    if (order.business === 'fresh') {
      const lines = items.map((item) => {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as ProductRow;
        return {
          product,
          qty: item.qty,
          module: 'fresh' as const,
          unitPriceCents: item.unit_price_cents,
          totalCents: item.total_cents,
          costCents: item.cost_cents,
          temp: item.temp,
          ice: item.ice
        };
      });
      releaseStock(db, order.store_id, lines);
    }
    db.prepare("UPDATE orders SET status = 'cancelled', payment_status = 'failed' WHERE id = ?").run(orderId);
    logAction(db, {
      actorId: null,
      actorName: '支付网关',
      action: '支付失败',
      detail: `${order.number} · ${reason}`,
      type: 'payment',
      storeId: order.store_id,
      orderId
    });
  });
  tx();
}

export async function createOrder(
  db: DatabaseType,
  input: CreateOrderInput
): Promise<{ order: ReturnType<typeof mapOrder>; printError?: string }> {
  const external = input.channel === 'meituan' || input.channel === 'taobao';
  const retail = input.business === 'retail';
  const storeId = input.storeId || 'sh';
  let resolvedStore = storeId;
  if (retail) {
    if (external) throw badRequest('零售不接外卖平台');
    resolvedStore = 'brand';
  } else {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as
      | { open: number; channels_json: string; positions_json: string }
      | undefined;
    if (!store) throw badRequest('门店不存在');
    if (!store.open) throw conflict('本店暂停营业，请选择其他门店');
    if (!external) {
      const channels = JSON.parse(store.channels_json) as Record<string, boolean>;
      if (!channels[input.channel]) throw conflict('该门店暂未开通此下单渠道');
    }
    if (input.type === 'dine') {
      const positions = JSON.parse(store.positions_json) as string[];
      if (!input.seat || !positions.includes(input.seat)) {
        throw badRequest('堂食请选择有效的吧台或窗边位置');
      }
    }
    if (input.type === 'delivery' && input.channel === 'assisted') {
      throw badRequest('伙伴代点不支持骑手配送，请选择堂食或外带');
    }
    if (input.actor) assertStaffStore(input.actor, storeId);
  }
  if (input.business === 'retail' && input.type !== 'retail') throw badRequest('零售订单类型无效');
  if (input.business === 'fresh' && input.type === 'retail') throw badRequest('请选择堂食、外带或配送');

  const prepared = prepareLines(db, input, retail ? storeId : storeId);
  const orderId = createUnpaidOrder(db, input, storeId, prepared);

  if (!external) {
    const method = input.paymentMethod || 'wechat';
    const result = await hardware.payment.charge({
      amountCents: prepared.totalCents,
      method,
      reference: orderId,
      metadata: { orderType: input.business, storeId }
    });
    if (!result.ok) {
      markPaymentFailed(db, orderId, result.error || '支付失败');
      throw conflict(result.error || '支付未完成，请重试');
    }
    markPaid(db, orderId, result.providerRef || `SIM-${orderId}`);
  } else {
    markPaid(db, orderId, input.externalRef || `PLATFORM-${orderId}`);
  }

  let printError: string | undefined;
  if (input.business === 'fresh') {
    const job = db
      .prepare("SELECT id FROM print_jobs WHERE order_id = ? AND status = 'queued' ORDER BY created_at DESC LIMIT 1")
      .get(orderId) as { id: string } | undefined;
    if (job) {
      const printed = await processPrintJob(db, job.id);
      if (!printed.ok) printError = printed.error;
    }
  }
  const order = getOrder(db, orderId);
  return { order, printError };
}

export function listOrders(
  db: DatabaseType,
  options: {
    storeIds: string[];
    status?: string;
    business?: string;
    q?: string;
    from?: number;
    to?: number;
    limit?: number;
    customerId?: string;
  }
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.customerId) {
    clauses.push('o.customer_id = ?');
    params.push(options.customerId);
  }
  if (options.storeIds.length) {
    const placeholders = options.storeIds.map(() => '?').join(',');
    clauses.push(
      `(o.store_id IN (${placeholders}) OR (o.business = 'retail' AND (o.pickup_store_id IS NULL OR o.pickup_store_id IN (${placeholders}))))`
    );
    params.push(...options.storeIds, ...options.storeIds);
  }
  if (options.status && options.status !== 'all') {
    clauses.push('o.status = ?');
    params.push(options.status);
  }
  if (options.business && options.business !== 'all') {
    clauses.push('o.business = ?');
    params.push(options.business);
  }
  if (options.from != null) {
    clauses.push('o.created_at >= ?');
    params.push(options.from);
  }
  if (options.to != null) {
    clauses.push('o.created_at < ?');
    params.push(options.to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT o.*, s.name AS store_name FROM orders o LEFT JOIN stores s ON s.id = o.store_id
       ${where} ORDER BY o.created_at DESC LIMIT ?`
    )
    .all(...params, options.limit || 100) as Array<OrderRow & { store_name: string | null }>;
  const q = (options.q || '').trim().toLowerCase();
  const result = rows
    .filter((row) =>
      !q
        ? true
        : `${row.number}${row.pickup_code || ''}${row.seat || ''}`.toLowerCase().includes(q.replace(/\s/g, ''))
    )
    .map((row) => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.id) as OrderItemRow[];
      const units = db.prepare('SELECT * FROM order_units WHERE order_id = ?').all(row.id) as UnitRow[];
      return mapOrder(row, items, units, row.business === 'retail' ? '品牌零售' : row.store_name || row.store_id);
    });
  return result;
}

export function storeQueue(db: DatabaseType, storeId: string) {
  const orders = listOrders(db, { storeIds: [storeId], limit: 80 });
  const fresh = orders.filter((order) => order.business === 'fresh' && (order.status === 'pending' || order.status === 'ready'));
  const retail = orders.filter((order) => order.business === 'retail' && order.status === 'awaiting');
  return {
    fresh: fresh.sort((a, b) => a.createdAt - b.createdAt),
    retail: retail.sort((a, b) => a.createdAt - b.createdAt),
    counts: {
      pending: fresh.filter((x) => x.status === 'pending').length,
      ready: fresh.filter((x) => x.status === 'ready').length,
      retail: retail.length
    }
  };
}

export function scanCupLabel(db: DatabaseType, staff: StaffUser, label: string) {
  const code = String(label || '').trim().toUpperCase();
  if (!code) throw badRequest('请扫描杯贴');
  const unit = db.prepare('SELECT * FROM order_units WHERE label = ?').get(code) as UnitRow | undefined;
  if (!unit) throw notFound(`未找到杯贴 ${code}`);
  return scanUnit(db, staff, unit);
}

export function scanUnitById(db: DatabaseType, staff: StaffUser, orderId: string, unitId: string) {
  const unit = db
    .prepare('SELECT * FROM order_units WHERE id = ? AND order_id = ?')
    .get(unitId, orderId) as UnitRow | undefined;
  if (!unit) throw notFound('杯贴不存在');
  return scanUnit(db, staff, unit);
}

function scanUnit(db: DatabaseType, staff: StaffUser, unit: UnitRow) {
  const order = getOrderRow(db, unit.order_id);
  if (order.business !== 'fresh') throw badRequest('零售请使用提货码交付');
  assertStaffStore(staff, order.store_id);
  if (order.status === 'refunded' || order.status === 'cancelled') throw conflict('该订单已退款或取消，不能出餐');
  if (unit.status === 'refunded') throw conflict('该杯已退款，无需出餐');
  if (unit.status !== 'scanned') {
    const tx = db.transaction(() => {
      db.prepare("UPDATE order_units SET status = 'scanned', scanned_at = ? WHERE id = ?").run(Date.now(), unit.id);
      const remaining = db
        .prepare("SELECT COUNT(*) AS n FROM order_units WHERE order_id = ? AND status = 'pending'")
        .get(order.id) as { n: number };
      if (!remaining.n) {
        db.prepare("UPDATE orders SET status = 'ready', prepared_at = COALESCE(prepared_at, ?) WHERE id = ?").run(
          Date.now(),
          order.id
        );
        logAction(db, {
          actorId: staff.id,
          actorName: staff.name,
          action: '整单出餐完成',
          detail: `${order.number} · 全部杯贴已扫码`,
          type: 'order',
          storeId: order.store_id,
          orderId: order.id
        });
      } else {
        logAction(db, {
          actorId: staff.id,
          actorName: staff.name,
          action: '扫码出餐',
          detail: `${unit.label}`,
          type: 'order',
          storeId: order.store_id,
          orderId: order.id
        });
      }
    });
    tx();
  }
  return getOrder(db, order.id);
}

export async function reprintOrder(db: DatabaseType, staff: StaffUser, orderId: string) {
  const order = getOrderRow(db, orderId);
  assertStaffStore(staff, order.store_id);
  if (order.business !== 'fresh') throw badRequest('零售订单没有杯贴');
  if (order.status === 'refunded' || order.status === 'cancelled') throw conflict('已退款或取消的订单无需打印');
  const count = db.prepare('SELECT COUNT(*) AS n FROM order_units WHERE order_id = ?').get(orderId) as { n: number };
  if (!count.n) throw conflict('本单没有杯贴');
  const jobId = enqueuePrintJob(db, orderId, true);
  if (!jobId) throw conflict('无法创建打印任务');
  const result = await processPrintJob(db, jobId);
  logAction(db, {
    actorId: staff.id,
    actorName: staff.name,
    action: '补打杯贴',
    detail: `${order.number} · ${result.ok ? '已受理' : result.error}`,
    type: 'print',
    storeId: order.store_id,
    orderId
  });
  return { ok: result.ok, error: result.error, order: getOrder(db, orderId) };
}

export async function remakeOrder(db: DatabaseType, staff: StaffUser, orderId: string, reason?: string) {
  const original = getOrderRow(db, orderId);
  if (original.business !== 'fresh') throw badRequest('零售订单不能创建补做单');
  assertStaffStore(staff, original.store_id);
  if (original.payment_status !== 'paid' || original.status === 'cancelled') {
    throw conflict('该订单未支付或已取消，不能补做');
  }
  const items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ? AND qty > refunded_qty')
    .all(orderId) as OrderItemRow[];
  if (!items.length) throw conflict('本单没有可补做的商品');
  const now = Date.now();
  const childId = newId('SO');
  const number = nextFreshNumber(db, original.store_id, true);
  const tx = db.transaction(() => {
    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as ProductRow;
      const qty = item.qty - item.refunded_qty;
      if (product.kind === 'tea') {
        const res = db
          .prepare('UPDATE stock SET grams = grams - ? WHERE store_id = ? AND product_id = ? AND grams >= ?')
          .run(product.dose_g * qty, original.store_id, product.id, product.dose_g * qty);
        if (!res.changes) throw conflict(`${product.name} 库存不足，无法补做`);
      }
    }
    db.prepare(
      `INSERT INTO orders (id, number, business, store_id, channel, type, seat, status, payment_status, total_cents, refunded_cents,
        pickup_code, pickup_store_id, print_status, parent_order_id, note, customer_id, owner_kind, created_by, payment_ref, payment_method,
        prepared_at, created_at, paid_at, delivered_at, refund_pending)
       VALUES (?,?, 'fresh', ?, ?, ?, ?, 'pending','paid',0,0,NULL,NULL,'queued',?,?,?, 'customer', ?, 'REMAKE', '补做', NULL,?,?,NULL,0)`
    ).run(
      childId,
      number,
      original.store_id,
      original.channel,
      original.type,
      original.seat,
      original.id,
      String(`补做 ${original.number} · ${reason || '服务补偿'}`).slice(0, 200),
      original.customer_id,
      staff.id,
      now,
      now
    );
    const insertItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, name, name_en, kind, series, qty, refunded_qty, unit_price_cents, total_cents, cost_cents, temp, ice)
       VALUES (?,?,?,?,?,?,?,?,0,0,0,?,?,?)`
    );
    const insertUnit = db.prepare(
      'INSERT INTO order_units (id, order_id, item_id, label, status, scanned_at) VALUES (?,?,?,?,?,NULL)'
    );
    let cup = 0;
    for (const item of items) {
      const qty = item.qty - item.refunded_qty;
      const itemId = newId('OI');
      const product = db.prepare('SELECT cost_cents FROM products WHERE id = ?').get(item.product_id) as {
        cost_cents: number;
      };
      insertItem.run(
        itemId,
        childId,
        item.product_id,
        item.name,
        item.name_en,
        item.kind,
        item.series,
        qty,
        product.cost_cents * qty,
        item.temp,
        item.ice
      );
      for (let i = 0; i < qty; i += 1) {
        cup += 1;
        insertUnit.run(newId('U'), childId, itemId, cupLabel(number, cup), 'pending');
      }
    }
    enqueuePrintJob(db, childId);
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: '创建补做单',
      detail: `${original.number} → ${number} · ${reason || '服务补偿'}`,
      type: 'order',
      storeId: original.store_id,
      orderId: childId
    });
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: '关联补做',
      detail: `${number}`,
      type: 'order',
      storeId: original.store_id,
      orderId: original.id
    });
  });
  tx();
  const job = db
    .prepare("SELECT id FROM print_jobs WHERE order_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(childId) as { id: string } | undefined;
  if (job) await processPrintJob(db, job.id);
  return getOrder(db, childId);
}

export type RefundLineInput = { itemId: string; qty: number };

function quoteRefund(db: DatabaseType, order: OrderRow, lines?: RefundLineInput[]) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid').all(order.id) as OrderItemRow[];
  const wanted = new Map<string, number>();
  if (lines?.length) {
    for (const line of lines) {
      const qty = Number(line.qty);
      if (!Number.isInteger(qty) || qty < 1) throw badRequest('退款数量须为正整数');
      wanted.set(line.itemId, (wanted.get(line.itemId) || 0) + qty);
    }
  } else {
    for (const item of items) {
      if (item.qty - item.refunded_qty > 0) wanted.set(item.id, item.qty - item.refunded_qty);
    }
  }
  if (!wanted.size) throw conflict('本单没有可退款数量');
  let amount = 0;
  let cost = 0;
  const detail: Array<{ item: OrderItemRow; qty: number; amountCents: number; costCents: number }> = [];
  for (const [itemId, qty] of wanted) {
    const item = items.find((x) => x.id === itemId);
    if (!item) throw notFound('订单行不存在');
    const remaining = item.qty - item.refunded_qty;
    if (qty > remaining) throw badRequest(`${item.name} 退款数量超过剩余可退数量`);
    const lineAmount = Math.floor((item.total_cents * (item.refunded_qty + qty)) / item.qty) - Math.floor((item.total_cents * item.refunded_qty) / item.qty);
    const lineCost = Math.floor((item.cost_cents * (item.refunded_qty + qty)) / item.qty) - Math.floor((item.cost_cents * item.refunded_qty) / item.qty);
    amount += lineAmount;
    cost += lineCost;
    detail.push({ item, qty, amountCents: lineAmount, costCents: lineCost });
  }
  return { amount, cost, detail };
}

function isPrepared(db: DatabaseType, order: OrderRow): boolean {
  if (order.business === 'retail') return order.status === 'delivered';
  if (order.status === 'ready') return true;
  const scanned = db
    .prepare("SELECT COUNT(*) AS n FROM order_units WHERE order_id = ? AND status = 'scanned'")
    .get(order.id) as { n: number };
  return scanned.n > 0;
}

export function refundQuoteForOrder(
  db: DatabaseType,
  orderId: string,
  lines?: RefundLineInput[]
) {
  const order = getOrderRow(db, orderId);
  return { order, quote: quoteRefund(db, order, lines), prepared: isPrepared(db, order) };
}

export function isOrderPrepared(db: DatabaseType, orderId: string): boolean {
  return isPrepared(db, getOrderRow(db, orderId));
}

function refundFlow(db: DatabaseType) {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = 'refundFlow'").get() as
    | { value_json: string }
    | undefined;
  return row
    ? (JSON.parse(row.value_json) as { enabled: boolean; thresholdCents: number; approvers: string[] })
    : { enabled: true, thresholdCents: 5000, approvers: ['u-zhou', 'u-lin'] };
}

export function refundNeedsApproval(db: DatabaseType, staff: StaffUser, amount: number): boolean {
  const flow = refundFlow(db);
  if (!flow.enabled) return false;
  return !hasPerm(staff, 'order:refund') || amount >= flow.thresholdCents;
}

export async function requestRefund(
  db: DatabaseType,
  staff: StaffUser,
  orderId: string,
  options: { lines?: RefundLineInput[]; reason?: string }
) {
  const order = getOrderRow(db, orderId);
  if (order.business === 'retail') assertStoreAccess(staff, order.pickup_store_id || 'brand');
  else assertStaffStore(staff, order.store_id);
  if (!hasPerm(staff, 'order:refund') && !hasPerm(staff, 'order:refund:request')) {
    throw forbidden('当前账号没有退款权限');
  }
  if (order.payment_status !== 'paid') throw conflict('订单未支付，不能退款');
  if (order.refund_pending) throw conflict('该订单已有待审批的退款申请');
  const quote = quoteRefund(db, order, options.lines);
  if (quote.amount <= 0) throw conflict('退款金额为 0');
  const prepared = isPrepared(db, order);
  const reason = String(options.reason || '顾客需求').slice(0, 120);
  if (!refundNeedsApproval(db, staff, quote.amount)) {
    const result = await executeRefund(db, staff, {
      order,
      quote,
      reason,
      prepared,
      approvalId: null,
      decidedBy: staff.name
    });
    if (result.error) throw conflict(result.error);
    return { mode: 'refunded' as const, ...result, order: getOrder(db, orderId) };
  }
  const id = newId('AP');
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO approvals (id, kind, status, amount_cents, store_id, order_id, summary, payload_json, requested_by, decided_by, comment, result_note, created_at, decided_at)
       VALUES (?, 'REFUND', 'pending', ?, ?, ?, ?, ?, ?, NULL, '', '', ?, NULL)`
    ).run(
      id,
      quote.amount,
      order.business === 'retail' ? order.pickup_store_id || 'brand' : order.store_id,
      order.id,
      `退款申请：${order.number} · ¥${(quote.amount / 100).toFixed(2)} · ${reason}`,
      JSON.stringify({
        lines: quote.detail.map((x) => ({ itemId: x.item.id, qty: x.qty, amountCents: x.amountCents })),
        reason,
        prepared
      }),
      staff.id,
      now
    );
    db.prepare('UPDATE orders SET refund_pending = 1 WHERE id = ?').run(order.id);
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: '发起退款申请',
      detail: `${order.number} · ¥${(quote.amount / 100).toFixed(2)} · ${reason}`,
      type: 'approval',
      storeId: order.business === 'retail' ? order.pickup_store_id || 'brand' : order.store_id,
      orderId: order.id
    });
  })();
  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
  return { mode: 'approval' as const, approval, amountCents: quote.amount, order: getOrder(db, orderId) };
}

export async function executeRefund(
  db: DatabaseType,
  staff: StaffUser | null,
  input: {
    order: OrderRow;
    quote: ReturnType<typeof quoteRefund>;
    reason: string;
    prepared: boolean;
    approvalId: string | null;
    decidedBy: string;
  }
): Promise<{ refundedCents: number; providerRef: string | null; error?: string }> {
  const { order, quote, prepared } = input;
  const refundRef = newId('RF');
  const gateway = await hardware.payment.refund({
    paymentRef: order.payment_ref || '',
    amountCents: quote.amount,
    reference: refundRef
  });
  if (!gateway.ok) {
    return { refundedCents: 0, providerRef: null, error: gateway.error || '支付网关退款失败' };
  }
  const now = Date.now();
  const tx = db.transaction(() => {
    const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as OrderRow;
    const remaining = fresh.total_cents - fresh.refunded_cents;
    if (quote.amount > remaining) throw conflict('退款金额超过剩余可退金额');
    for (const line of quote.detail) {
      db.prepare('UPDATE order_items SET refunded_qty = refunded_qty + ? WHERE id = ?').run(line.qty, line.item.id);
      if (order.business === 'fresh' && !prepared) {
        const product = db.prepare('SELECT dose_g, kind FROM products WHERE id = ?').get(line.item.product_id) as {
          dose_g: number;
          kind: string;
        };
        if (product.kind === 'tea') {
          db.prepare('UPDATE stock SET grams = grams + ? WHERE store_id = ? AND product_id = ?').run(
            product.dose_g * line.qty,
            order.store_id,
            line.item.product_id
          );
        }
      }
    }
    const refunded = fresh.refunded_cents + quote.amount;
    const fully = refunded >= fresh.total_cents;
    db.prepare(
      "UPDATE orders SET refunded_cents = ?, status = CASE WHEN ? THEN 'refunded' ELSE status END, refund_pending = 0 WHERE id = ?"
    ).run(refunded, fully ? 1 : 0, order.id);
    if (fully && order.business === 'fresh') {
      db.prepare("UPDATE order_units SET status = 'refunded' WHERE order_id = ? AND status != 'scanned'").run(order.id);
    }
    const costReversal = prepared ? 0 : -quote.cost;
    addFinanceEntry(db, {
      orderId: order.id,
      storeId: order.business === 'retail' ? 'brand' : order.store_id,
      type: 'REFUND',
      amountCents: -quote.amount,
      method: '原路退回',
      settlement: 'settled',
      memo: `退款 · ${input.reason}`,
      costCents: costReversal,
      dedupeKey: `ORDER:${order.id}:REFUND:${refundRef}`,
      at: now
    });
    logAction(db, {
      actorId: staff?.id || null,
      actorName: input.decidedBy,
      action: '执行退款',
      detail: `${fresh.number} · ¥${(quote.amount / 100).toFixed(2)}${prepared ? ' · 已制作，保留原料成本' : ' · 未制作，成本冲回'}${input.approvalId ? ` · 审批 ${input.approvalId}` : ''}`,
      type: 'refund',
      storeId: order.business === 'retail' ? 'brand' : order.store_id,
      orderId: order.id,
      at: now
    });
  });
  tx();
  return { refundedCents: quote.amount, providerRef: gateway.providerRef || null };
}

export function retailLookup(db: DatabaseType, staff: StaffUser, code: string) {
  const digits = String(code || '').replace(/\D/g, '');
  if (digits.length !== 4) throw badRequest('请输入顾客的 4 位提货码');
  const row = db
    .prepare("SELECT * FROM orders WHERE business = 'retail' AND pickup_code = ? AND status = 'awaiting' ORDER BY created_at DESC LIMIT 1")
    .get(digits) as OrderRow | undefined;
  if (!row) throw notFound('没有匹配的待交付零售订单');
  const order = getOrder(db, row.id);
  return order;
}

export function deliverRetail(
  db: DatabaseType,
  staff: StaffUser,
  input: { orderId: string; storeId: string; code: string }
) {
  const order = getOrderRow(db, input.orderId);
  if (order.business !== 'retail') throw badRequest('仅零售订单需要交付确认');
  if (order.status === 'delivered') return getOrder(db, order.id);
  if (order.status !== 'awaiting') throw conflict('该订单不可交付');
  if (String(input.code || '').replace(/\D/g, '') !== order.pickup_code) {
    throw badRequest('提货码不正确，请让顾客重新核对 4 位数字');
  }
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(input.storeId) as
    | { open: number; retail_pickup: number; name: string }
    | undefined;
  if (!store) throw notFound('门店不存在');
  if (!store.open || !store.retail_pickup) throw conflict('本店暂不可领取，请选择其他门店');
  assertStoreAccess(staff, input.storeId);
  const items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ? AND qty > refunded_qty')
    .all(order.id) as OrderItemRow[];
  const tx = db.transaction(() => {
    for (const item of items) {
      const qty = item.qty - item.refunded_qty;
      const stock = db
        .prepare('SELECT grams FROM stock WHERE store_id = ? AND product_id = ?')
        .get(input.storeId, item.product_id) as { grams: number } | undefined;
      if (!stock || stock.grams < qty) throw conflict(`${item.name} 在本店库存不足，请调货或选择其他门店`);
    }
    for (const item of items) {
      db.prepare('UPDATE stock SET grams = grams - ? WHERE store_id = ? AND product_id = ?').run(
        item.qty - item.refunded_qty,
        input.storeId,
        item.product_id
      );
    }
    db.prepare("UPDATE orders SET status = 'delivered', pickup_store_id = ?, delivered_at = ? WHERE id = ?").run(
      input.storeId,
      Date.now(),
      order.id
    );
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: '确认零售交付',
      detail: `${order.number} · ${store.name} · 4 位提货码核验通过`,
      type: 'order',
      storeId: input.storeId,
      orderId: order.id
    });
  });
  tx();
  return getOrder(db, order.id);
}

export function orderLogs(db: DatabaseType, orderId: string) {
  return db
    .prepare('SELECT id, actor_name, action, detail, type, at FROM logs WHERE order_id = ? ORDER BY at ASC, rowid ASC')
    .all(orderId)
    .map((row) => {
      const r = row as { id: string; actor_name: string | null; action: string; detail: string; type: string; at: number };
      return { id: r.id, actor: r.actor_name || '系统', action: r.action, detail: r.detail, type: r.type, at: r.at };
    });
}
