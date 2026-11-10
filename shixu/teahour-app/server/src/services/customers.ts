import type { Database as DatabaseType } from 'better-sqlite3';
import { randomInt } from 'node:crypto';
import { newId, dayStamp } from '../lib/ids.js';
import { conflict, notFound } from '../lib/errors.js';
import { mapCustomer } from './mappers.js';
import { loadCustomer, type CustomerUser } from '../lib/auth.js';
import { listOrders, getOrder } from './orders.js';

function generateMemberCode(db: DatabaseType): string {
  for (let i = 0; i < 50; i += 1) {
    const code = `TH-${dayStamp().slice(2)}-${String(randomInt(1000, 10000))}`;
    const exists = db.prepare('SELECT id FROM customers WHERE member_code = ?').get(code);
    if (!exists) return code;
  }
  return `TH-${dayStamp().slice(2)}-${newId('M').slice(-4).toUpperCase()}`;
}

export function createCustomerSession(
  db: DatabaseType,
  input: { memberCode?: string; name?: string; phone?: string }
) {
  const requested = String(input.memberCode || '').trim().toUpperCase();
  if (requested) {
    const existing = db.prepare('SELECT id FROM customers WHERE member_code = ?').get(requested) as
      | { id: string }
      | undefined;
    if (existing) {
      const customer = loadCustomer(db, existing.id)!;
      return customer;
    }
  }
  const now = Date.now();
  const id = newId('C');
  const code = requested && /^TH-[A-Z0-9-]{4,}$/.test(requested) ? requested : generateMemberCode(db);
  const taken = db.prepare('SELECT id FROM customers WHERE member_code = ?').get(code);
  if (taken) throw conflict('该会员码已被占用');
  db.prepare('INSERT INTO customers (id, member_code, name, phone, created_at) VALUES (?,?,?,?,?)').run(
    id,
    code,
    String(input.name || '茶客').slice(0, 30),
    input.phone ? String(input.phone).slice(0, 20) : null,
    now
  );
  return loadCustomer(db, id)!;
}

export function customerOrders(db: DatabaseType, customer: CustomerUser) {
  return listOrders(db, { storeIds: [], limit: 100, customerId: customer.id });
}

export function customerOrder(db: DatabaseType, customer: CustomerUser, id: string) {
  const order = getOrder(db, id);
  if (order.customerId !== customer.id) throw notFound('订单不存在');
  return order;
}

export function retailAvailability(db: DatabaseType) {
  const stores = db
    .prepare('SELECT id, name FROM stores WHERE retail_pickup = 1 AND open = 1 ORDER BY city, id')
    .all() as Array<{ id: string; name: string }>;
  const products = db
    .prepare("SELECT id, name, price_cents FROM products WHERE kind IN ('retail','bottle') AND status = 'published'")
    .all() as Array<{ id: string; name: string; price_cents: number }>;
  return products.map((product) => {
    const stock = db
      .prepare('SELECT COALESCE(SUM(grams),0) AS grams FROM stock WHERE product_id = ?')
      .get(product.id) as { grams: number };
    return { ...product, totalStock: stock.grams, stores: stores.length };
  });
}

export function customerPayload(customer: CustomerUser) {
  return { ...mapCustomer(customer), memberTier: 'annual', discountPerCupCents: 100 };
}
