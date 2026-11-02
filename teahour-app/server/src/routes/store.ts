import type { FastifyInstance } from 'fastify';
import type { Database as DatabaseType } from 'better-sqlite3';
import { z } from 'zod';
import { assertStoreAccess, staffGuard, type StaffUser } from '../lib/auth.js';
import { badRequest } from '../lib/errors.js';
import {
  createOrder,
  deliverRetail,
  getOrder,
  getOrderRow,
  listOrders,
  orderLogs,
  remakeOrder,
  reprintOrder,
  retailLookup,
  scanCupLabel,
  scanUnitById,
  storeQueue
} from '../services/orders.js';
import { financeSummary, listFinance } from '../services/finance.js';
import { resolveRange } from '../lib/dates.js';
import { getLossPolicy, listLosses, lossSummary, reportLoss, deviceStatuses } from '../services/losses.js';
import { listExpenses } from '../services/expenses.js';
import { listLogs } from '../services/admin.js';
import { approvalCounts } from '../services/approvals.js';
import { stockForStore } from '../services/catalog.js';

const itemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1).max(20),
  temp: z.string().max(20).nullable().optional(),
  ice: z.string().max(20).nullable().optional()
});

function ensureOrderAccess(user: StaffUser, orderId: string, db: DatabaseType) {
  const order = getOrderRow(db, orderId);
  if (order.business !== 'retail') assertStoreAccess(user, order.store_id);
  return order;
}

export async function storeRoutes(app: FastifyInstance, options: { db: DatabaseType }) {
  const { db } = options;

  app.get('/store/overview', { preHandler: staffGuard(db, 'order:view') }, async (req) => {
    const query = z.object({ storeId: z.string().min(1) }).parse(req.query);
    assertStoreAccess(req.staff!, query.storeId);
    const range = resolveRange({ range: 'today' });
    const entries = listFinance(db, { range, storeIds: [query.storeId] });
    const summary = financeSummary(entries);
    const expenses = listExpenses(db, { storeIds: [query.storeId], range, limit: 100 });
    return {
      storeId: query.storeId,
      date: range.fromDate,
      queue: storeQueue(db, query.storeId),
      finance: summary,
      opexCents: expenses.reduce((n, x) => n + x.amountCents, 0),
      expenses,
      approvals: approvalCounts(db, [query.storeId])
    };
  });

  app.get('/store/queue', { preHandler: staffGuard(db, 'pos:use') }, async (req) => {
    const query = z.object({ storeId: z.string().min(1) }).parse(req.query);
    assertStoreAccess(req.staff!, query.storeId);
    return storeQueue(db, query.storeId);
  });

  app.get('/store/orders', { preHandler: staffGuard(db, 'order:view') }, async (req) => {
    const query = z
      .object({
        storeId: z.string().optional(),
        status: z.string().optional(),
        business: z.string().optional(),
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(300).optional()
      })
      .parse(req.query ?? {});
    const staff = req.staff!;
    const storeIds = staff.allStores
      ? query.storeId
        ? [query.storeId]
        : (db.prepare('SELECT id FROM stores').all() as Array<{ id: string }>).map((x) => x.id)
      : query.storeId
        ? (assertStoreAccess(staff, query.storeId), [query.storeId])
        : staff.storeIds;
    return { orders: listOrders(db, { ...query, storeIds }) };
  });

  app.post('/store/orders', { preHandler: staffGuard(db, 'pos:use') }, async (req) => {
    const input = z
      .object({
        storeId: z.string().min(1),
        business: z.enum(['fresh', 'retail']).default('fresh'),
        type: z.enum(['dine', 'takeaway', 'delivery', 'retail']),
        seat: z.string().max(30).nullable().optional(),
        items: z.array(itemSchema).min(1).max(30),
        note: z.string().max(200).optional(),
        paymentMethod: z.enum(['wechat', 'alipay', 'cash']).default('wechat')
      })
      .parse(req.body);
    const staff = req.staff!;
    assertStoreAccess(staff, input.storeId);
    const result = await createOrder(db, {
      ...input,
      channel: 'assisted',
      ownerKind: 'guest',
      actor: staff,
      paymentMethod: input.paymentMethod
    });
    return { order: result.order, printError: result.printError };
  });

  app.get('/store/orders/:id', { preHandler: staffGuard(db, 'order:view') }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    ensureOrderAccess(req.staff!, params.id, db);
    return { order: getOrder(db, params.id), logs: orderLogs(db, params.id) };
  });

  app.post('/store/scan', { preHandler: staffGuard(db, 'pos:use') }, async (req) => {
    const input = z.object({ code: z.string().min(1) }).parse(req.body);
    return { order: scanCupLabel(db, req.staff!, input.code) };
  });

  app.post('/store/orders/:id/scan', { preHandler: staffGuard(db, 'pos:use') }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z.object({ unitId: z.string().min(1) }).parse(req.body);
    ensureOrderAccess(req.staff!, params.id, db);
    return { order: scanUnitById(db, req.staff!, params.id, input.unitId) };
  });

  app.post('/store/orders/:id/reprint', { preHandler: staffGuard(db, 'pos:use') }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    ensureOrderAccess(req.staff!, params.id, db);
    return reprintOrder(db, req.staff!, params.id);
  });

  app.post('/store/orders/:id/remake', { preHandler: staffGuard(db, 'pos:use') }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z.object({ reason: z.string().max(120).optional() }).parse(req.body ?? {});
    ensureOrderAccess(req.staff!, params.id, db);
    return { order: await remakeOrder(db, req.staff!, params.id, input.reason) };
  });

  app.post('/store/orders/:id/refund', { preHandler: staffGuard(db) }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z
      .object({
        items: z.array(z.object({ itemId: z.string(), qty: z.number().int().min(1) })).optional(),
        reason: z.string().max(120).optional()
      })
      .parse(req.body ?? {});
    ensureOrderAccess(req.staff!, params.id, db);
    const { requestRefund } = await import('../services/orders.js');
    return requestRefund(db, req.staff!, params.id, input);
  });

  app.post('/store/retail/lookup', { preHandler: staffGuard(db, 'retail:handover') }, async (req) => {
    const input = z.object({ code: z.string().min(1) }).parse(req.body);
    return { order: retailLookup(db, req.staff!, input.code) };
  });

  app.post('/store/retail/:id/deliver', { preHandler: staffGuard(db, 'retail:handover') }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z.object({ storeId: z.string().min(1), code: z.string().min(1) }).parse(req.body);
    return { order: deliverRetail(db, req.staff!, { orderId: params.id, ...input }) };
  });

  app.get('/store/inventory', { preHandler: staffGuard(db, 'store:stock') }, async (req) => {
    const query = z.object({ storeId: z.string().min(1) }).parse(req.query);
    assertStoreAccess(req.staff!, query.storeId);
    return { items: stockForStore(db, query.storeId) };
  });

  app.put('/store/inventory', { preHandler: staffGuard(db, 'store:stock') }, async (req) => {
    const input = z
      .object({
        storeId: z.string().min(1),
        items: z
          .array(
            z.object({
              productId: z.string().min(1),
              grams: z.number().min(0).max(1_000_000).optional(),
              soldOut: z.boolean().optional()
            })
          )
          .min(1)
      })
      .parse(req.body);
    assertStoreAccess(req.staff!, input.storeId);
    const tx = db.transaction(() => {
      for (const item of input.items) {
        const exists = db
          .prepare('SELECT 1 FROM stock WHERE store_id = ? AND product_id = ?')
          .get(input.storeId, item.productId);
        if (!exists) throw badRequest('库存商品不存在');
        if (item.grams != null) {
          db.prepare('UPDATE stock SET grams = ? WHERE store_id = ? AND product_id = ?').run(
            Math.round(item.grams * 10) / 10,
            input.storeId,
            item.productId
          );
        }
        if (item.soldOut != null) {
          db.prepare('UPDATE stock SET sold_out = ? WHERE store_id = ? AND product_id = ?').run(
            item.soldOut ? 1 : 0,
            input.storeId,
            item.productId
          );
        }
      }
    });
    tx();
    return { items: stockForStore(db, input.storeId) };
  });

  app.get('/store/losses', { preHandler: staffGuard(db, 'loss:report') }, async (req) => {
    const query = z.object({ storeId: z.string().min(1), status: z.string().optional() }).parse(req.query);
    assertStoreAccess(req.staff!, query.storeId);
    return {
      losses: listLosses(db, { storeIds: [query.storeId], status: query.status, limit: 100 }),
      policy: getLossPolicy(db),
      summary: lossSummary(db, { storeIds: [query.storeId] })
    };
  });

  app.post('/store/losses', { preHandler: staffGuard(db, 'loss:report') }, async (req) => {
    const input = z
      .object({
        storeId: z.string().min(1),
        productId: z.string().min(1),
        qty: z.coerce.number().positive(),
        reason: z.string().min(1).max(120),
        note: z.string().max(200).optional()
      })
      .parse(req.body);
    return { loss: reportLoss(db, req.staff!, input) };
  });

  app.get('/store/devices', { preHandler: staffGuard(db, 'store:device') }, async () => {
    return { devices: await deviceStatuses() };
  });

  app.get('/store/logs', { preHandler: staffGuard(db, 'log:view') }, async (req) => {
    const query = z
      .object({ storeId: z.string().min(1), q: z.string().optional(), limit: z.coerce.number().int().optional() })
      .parse(req.query);
    assertStoreAccess(req.staff!, query.storeId);
    return { logs: listLogs(db, { storeIds: [query.storeId], q: query.q, limit: query.limit || 100 }) };
  });

}
