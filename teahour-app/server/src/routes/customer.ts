import type { FastifyInstance } from 'fastify';
import type { Database as DatabaseType } from 'better-sqlite3';
import { z } from 'zod';
import { customerGuard } from '../lib/auth.js';
import { badRequest } from '../lib/errors.js';
import { catalogForStore, listCategories, listStores } from '../services/catalog.js';
import { createOrder, getOrder } from '../services/orders.js';
import { customerOrder, customerOrders, retailAvailability } from '../services/customers.js';
import { hardware } from '../hardware/index.js';

const itemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1).max(20),
  temp: z.string().max(20).nullable().optional(),
  ice: z.string().max(20).nullable().optional()
});

const orderSchema = z.object({
  storeId: z.string().min(1),
  business: z.enum(['fresh', 'retail']),
  type: z.enum(['dine', 'takeaway', 'delivery', 'retail']),
  seat: z.string().max(30).nullable().optional(),
  items: z.array(itemSchema).min(1).max(30),
  note: z.string().max(200).optional(),
  memberCode: z.string().max(40).optional()
});

export async function customerRoutes(app: FastifyInstance, options: { db: DatabaseType }) {
  const { db } = options;

  app.get('/customer/stores', async () => ({ stores: listStores(db) }));

  app.get('/customer/bootstrap', async (req) => {
    const query = z.object({ storeId: z.string().optional() }).parse(req.query ?? {});
    const stores = listStores(db);
    const storeId = query.storeId && stores.some((s) => s.id === query.storeId) ? query.storeId : stores[0]?.id;
    if (!storeId) throw badRequest('暂无可用门店');
    const catalog = catalogForStore(db, storeId);
    return {
      stores,
      store: catalog.store,
      categories: catalog.categories,
      products: catalog.products,
      retail: retailAvailability(db),
      hardware: {
        payment: hardware.payment.mode,
        member: hardware.member.mode,
        printer: hardware.printer.mode,
        teaMachine: hardware.teaMachine.mode
      }
    };
  });

  app.get('/customer/menu', async (req) => {
    const query = z.object({ storeId: z.string().min(1) }).parse(req.query ?? {});
    return { ...catalogForStore(db, query.storeId), categories: listCategories(db) };
  });

  app.post('/customer/member/verify', async (req) => {
    const input = z.object({ code: z.string().trim().min(1) }).parse(req.body);
    const benefit = await hardware.member.verify(input.code);
    return { benefit, mode: hardware.member.mode };
  });

  app.post('/customer/orders', { preHandler: customerGuard(db) }, async (req) => {
    const input = orderSchema.parse(req.body);
    const customer = req.customer!;
    let discount = 0;
    if (input.memberCode && input.business === 'fresh') {
      const benefit = await hardware.member.verify(input.memberCode);
      if (benefit) discount = benefit.discountPerCupCents;
    }
    const result = await createOrder(db, {
      storeId: input.storeId,
      business: input.business,
      channel: 'mini',
      type: input.type,
      seat: input.seat,
      items: input.items,
      note: input.note,
      customerId: customer.id,
      ownerKind: 'customer',
      memberDiscountPerCupCents: discount,
      paymentMethod: 'wechat'
    });
    return { order: result.order, printError: result.printError };
  });

  app.get('/customer/orders', { preHandler: customerGuard(db) }, async (req) => {
    return { orders: customerOrders(db, req.customer!) };
  });

  app.get('/customer/orders/:id', { preHandler: customerGuard(db) }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const order = customerOrder(db, req.customer!, params.id);
    return { order: getOrder(db, order.id) };
  });

  app.get('/customer/retail', async () => ({ products: retailAvailability(db) }));
}
