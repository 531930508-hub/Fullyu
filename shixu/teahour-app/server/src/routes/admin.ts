import type { FastifyInstance } from 'fastify';
import type { Database as DatabaseType } from 'better-sqlite3';
import { z } from 'zod';
import { staffGuard, hasPerm } from '../lib/auth.js';
import { forbidden } from '../lib/errors.js';
import { resolveRange, toDateString } from '../lib/dates.js';
import { overview } from '../services/dashboard.js';
import { financeSummary, listFinance, profitReport } from '../services/finance.js';
import {
  addExpense,
  commitExpenseImport,
  expenseSummary,
  listExpenses,
  previewExpenseImport,
  sampleExpenseFor,
  voidExpense
} from '../services/expenses.js';
import { decideApproval, listApprovals, approvalCounts } from '../services/approvals.js';
import { getLossPolicy, listLosses, lossSummary, saveLossPolicy } from '../services/losses.js';
import {
  createProduct,
  listCategoriesAdmin,
  listLogs,
  listMappings,
  listProducts,
  listRoles,
  listStaff,
  listStoresAdmin,
  permissionCatalog,
  saveCategory,
  saveMapping,
  saveRole,
  saveStaff,
  updateProduct,
  updateStore
} from '../services/admin.js';

function storeIdsOf(db: DatabaseType, allStores: boolean, staffStoreIds: string[]): string[] {
  if (!allStores) return staffStoreIds;
  return (db.prepare('SELECT id FROM stores').all() as Array<{ id: string }>).map((x) => x.id);
}

function financeScope(db: DatabaseType, staff: { allStores: boolean; storeIds: string[] }): string[] {
  const ids = storeIdsOf(db, staff.allStores, staff.storeIds);
  return staff.allStores ? [...ids, 'brand'] : ids;
}

const rangeSchema = z
  .object({
    range: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional()
  })
  .optional();

export async function adminRoutes(app: FastifyInstance, options: { db: DatabaseType }) {
  const { db } = options;

  app.get('/admin/overview', { preHandler: staffGuard(db, 'dashboard:view') }, async (req) => {
    const query = rangeSchema.parse(req.query ?? {}) || {};
    const range = resolveRange(query);
    const staff = req.staff!;
    const storeIds = financeScope(db, staff);
    return { overview: overview(db, { range, storeIds }) };
  });

  app.get('/admin/finance', { preHandler: staffGuard(db, 'finance:view') }, async (req) => {
    const query = z
      .object({
        range: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        type: z.string().optional(),
        q: z.string().optional(),
        storeId: z.string().optional()
      })
      .parse(req.query ?? {});
    const staff = req.staff!;
    const range = resolveRange(query);
    let storeIds = financeScope(db, staff);
    if (query.storeId) {
      if (!storeIds.includes(query.storeId)) throw forbidden('当前账号没有该门店的数据权限');
      storeIds = [query.storeId];
    }
    const entries = listFinance(db, { range, storeIds, type: query.type, q: query.q });
    return {
      entries,
      summary: financeSummary(entries),
      range: { from: range.fromDate, to: range.toDate }
    };
  });

  app.get('/admin/profit', { preHandler: staffGuard(db, 'dashboard:profit') }, async (req) => {
    const query = rangeSchema.parse(req.query ?? {}) || {};
    const staff = req.staff!;
    const range = resolveRange(query);
    const storeIds = storeIdsOf(db, staff.allStores, staff.storeIds);
    const report = profitReport(db, { range, storeIds, includeBrand: staff.allStores });
    return {
      ...report,
      range: { from: range.fromDate, to: range.toDate },
      includesBrand: staff.allStores
    };
  });

  app.get('/admin/expenses', { preHandler: staffGuard(db, 'finance:view') }, async (req) => {
    const query = z
      .object({
        range: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        category: z.string().optional(),
        includeVoided: z.coerce.boolean().optional()
      })
      .parse(req.query ?? {});
    const staff = req.staff!;
    const range = resolveRange(query);
    const storeIds = financeScope(db, staff);
    return {
      expenses: listExpenses(db, { storeIds, range, includeVoided: query.includeVoided, category: query.category }),
      summary: expenseSummary(db, { storeIds, range }),
      range: { from: range.fromDate, to: range.toDate }
    };
  });

  app.get('/admin/expenses/sample', { preHandler: staffGuard(db, 'finance:expense') }, async (req) => {
    return { text: sampleExpenseFor(db, req.staff!, toDateString()) };
  });

  app.post('/admin/expenses', { preHandler: staffGuard(db, 'finance:expense') }, async (req) => {
    const input = z
      .object({
        storeId: z.string().min(1),
        date: z.string().min(1),
        category: z.string().min(1),
        amount: z.union([z.string(), z.number()]),
        memo: z.string().max(120).optional()
      })
      .parse(req.body);
    return { expense: addExpense(db, req.staff!, input) };
  });

  app.post('/admin/expenses/preview', { preHandler: staffGuard(db, 'finance:expense') }, async (req) => {
    const input = z.object({ text: z.string().min(1).max(200000) }).parse(req.body);
    return previewExpenseImport(db, req.staff!, input.text);
  });

  app.post('/admin/expenses/import', { preHandler: staffGuard(db, 'finance:expense') }, async (req) => {
    const input = z.object({ text: z.string().min(1).max(200000), source: z.string().max(20).optional() }).parse(req.body);
    return commitExpenseImport(db, req.staff!, input.text, input.source || 'import');
  });

  app.post('/admin/expenses/:id/void', { preHandler: staffGuard(db, 'finance:expense') }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    return { expense: voidExpense(db, req.staff!, params.id) };
  });

  app.get('/admin/approvals', { preHandler: staffGuard(db, 'approval:view') }, async (req) => {
    const query = z
      .object({ status: z.string().optional(), kind: z.string().optional(), limit: z.coerce.number().optional() })
      .parse(req.query ?? {});
    const staff = req.staff!;
    const storeIds = financeScope(db, staff);
    return {
      approvals: listApprovals(db, { storeIds, status: query.status, kind: query.kind, limit: query.limit }),
      counts: approvalCounts(db, storeIds)
    };
  });

  app.post('/admin/approvals/:id/decide', { preHandler: staffGuard(db) }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z
      .object({ decision: z.enum(['approve', 'reject']), comment: z.string().max(200).optional() })
      .parse(req.body);
    return { approval: await decideApproval(db, req.staff!, params.id, input) };
  });

  app.get('/admin/losses', { preHandler: staffGuard(db, 'loss:view') }, async (req) => {
    const query = z
      .object({ range: z.string().optional(), from: z.string().optional(), to: z.string().optional(), status: z.string().optional() })
      .parse(req.query ?? {});
    const staff = req.staff!;
    const storeIds = storeIdsOf(db, staff.allStores, staff.storeIds);
    const range = resolveRange(query);
    return {
      losses: listLosses(db, { storeIds, range, status: query.status, limit: 300 }),
      summary: lossSummary(db, { range, storeIds }),
      policy: getLossPolicy(db),
      range: { from: range.fromDate, to: range.toDate }
    };
  });

  app.get('/admin/loss-policy', { preHandler: staffGuard(db, 'loss:view') }, async () => {
    return { policy: getLossPolicy(db) };
  });

  app.put('/admin/loss-policy', { preHandler: staffGuard(db, 'loss:config') }, async (req) => {
    const input = z
      .object({
        enabled: z.boolean().optional(),
        monthlyRatio: z.number().min(0).max(100).optional(),
        approvalThresholdCents: z.number().int().min(0).optional(),
        approvers: z.array(z.string()).optional()
      })
      .parse(req.body);
    return { policy: saveLossPolicy(db, req.staff!, input) };
  });

  app.get('/admin/products', { preHandler: staffGuard(db, 'product:view') }, async () => {
    return { products: listProducts(db), categories: listCategoriesAdmin(db) };
  });

  const productSchema = z.object({
    name: z.string().max(80).optional(),
    nameEn: z.string().max(80).optional(),
    categoryId: z.string().max(40).optional(),
    series: z.string().max(20).optional(),
    kind: z.enum(['tea', 'retail', 'bottle']).optional(),
    priceCents: z.number().int().min(0).optional(),
    costCents: z.number().int().min(0).optional(),
    doseGrams: z.number().positive().optional(),
    status: z.enum(['published', 'draft', 'archived']).optional(),
    temps: z.array(z.string()).optional(),
    ice: z.boolean().optional(),
    memberEligible: z.boolean().optional(),
    desc: z.string().max(2000).optional(),
    descEn: z.string().max(2000).optional(),
    spec: z.string().max(300).optional(),
    specEn: z.string().max(300).optional(),
    tag: z.string().max(100).optional(),
    tagEn: z.string().max(100).optional(),
    unit: z.string().max(20).optional(),
    unitEn: z.string().max(20).optional()
  });

  app.post('/admin/products', { preHandler: staffGuard(db, 'product:edit') }, async (req) => {
    const input = productSchema.parse(req.body);
    return { product: createProduct(db, req.staff!, input) };
  });

  app.patch('/admin/products/:id', { preHandler: staffGuard(db, 'product:edit') }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = productSchema.parse(req.body);
    return { product: updateProduct(db, req.staff!, params.id, input) };
  });

  app.post('/admin/categories', { preHandler: staffGuard(db, 'product:edit') }, async (req) => {
    const input = z
      .object({ id: z.string().optional(), name: z.string().min(1), nameEn: z.string().optional(), kind: z.string().optional() })
      .parse(req.body);
    return { category: saveCategory(db, req.staff!, input) };
  });

  app.get('/admin/stores', { preHandler: staffGuard(db, 'store:config') }, async () => {
    return { stores: listStoresAdmin(db) };
  });

  app.patch('/admin/stores/:id', { preHandler: staffGuard(db, 'store:config:edit') }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z
      .object({
        open: z.boolean().optional(),
        retailPickup: z.boolean().optional(),
        printerStatus: z.enum(['online', 'offline']).optional(),
        channels: z.record(z.boolean()).optional(),
        positions: z.array(z.string()).optional(),
        hours: z.string().max(40).optional(),
        waitMinutes: z.number().int().min(0).max(180).optional()
      })
      .parse(req.body);
    return { store: updateStore(db, req.staff!, params.id, input) };
  });

  app.get('/admin/staff', { preHandler: staffGuard(db, 'rbac:view') }, async () => {
    return { staff: listStaff(db), roles: listRoles(db) };
  });

  app.post('/admin/staff', { preHandler: staffGuard(db, 'rbac:edit') }, async (req) => {
    const input = z
      .object({
        name: z.string().min(1).max(30),
        username: z.string().min(6).max(20),
        password: z.string().min(8).max(72),
        roleIds: z.array(z.string()).min(1),
        storeIds: z.array(z.string()).optional(),
        allStores: z.boolean().optional(),
        active: z.boolean().optional()
      })
      .parse(req.body);
    return { staff: saveStaff(db, req.staff!, input) };
  });

  app.patch('/admin/staff/:id', { preHandler: staffGuard(db, 'rbac:edit') }, async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z
      .object({
        name: z.string().min(1).max(30),
        password: z.string().min(8).max(72).optional(),
        roleIds: z.array(z.string()).min(1),
        storeIds: z.array(z.string()).optional(),
        allStores: z.boolean().optional(),
        active: z.boolean().optional()
      })
      .parse(req.body);
    return { staff: saveStaff(db, req.staff!, { ...input, id: params.id }) };
  });

  app.get('/admin/roles', { preHandler: staffGuard(db, 'rbac:view') }, async () => {
    return { roles: listRoles(db), catalog: permissionCatalog() };
  });

  app.post('/admin/roles', { preHandler: staffGuard(db, 'rbac:edit') }, async (req) => {
    const input = z
      .object({
        id: z.string().optional(),
        name: z.string().min(1).max(40),
        description: z.string().max(200).optional(),
        scope: z.enum(['ALL', 'STORES']).optional(),
        perms: z.array(z.string()).min(1)
      })
      .parse(req.body);
    return { role: saveRole(db, req.staff!, input) };
  });

  app.get('/admin/permissions', { preHandler: staffGuard(db, 'rbac:view') }, async () => {
    return permissionCatalog();
  });

  app.get('/admin/logs', { preHandler: staffGuard(db, 'log:view') }, async (req) => {
    const query = z
      .object({
        range: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        q: z.string().optional(),
        type: z.string().optional(),
        limit: z.coerce.number().int().optional()
      })
      .parse(req.query ?? {});
    const staff = req.staff!;
    const range = resolveRange(query);
    // 全部门店范围读取全部记录（含不归属门店的登录 / 权限操作）；门店范围只读本店。
    const storeIds = staff.allStores ? [] : staff.storeIds;
    return {
      logs: listLogs(db, {
        storeIds,
        q: query.q,
        type: query.type,
        limit: query.limit,
        from: range.from,
        to: range.to
      })
    };
  });

  app.get('/admin/mappings', { preHandler: staffGuard(db, 'mapping:view') }, async () => {
    return { mappings: listMappings(db), products: listProducts(db) };
  });

  app.post('/admin/mappings', { preHandler: staffGuard(db, 'mapping:edit') }, async (req) => {
    const input = z
      .object({
        id: z.string().optional(),
        externalId: z.string().min(1),
        productId: z.string().min(1),
        unit: z.string().max(20).optional(),
        factor: z.number().positive()
      })
      .parse(req.body);
    return { mapping: saveMapping(db, req.staff!, input) };
  });

  app.get('/admin/refund-flow', { preHandler: staffGuard(db, 'approval:view') }, async () => {
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'refundFlow'").get() as
      | { value_json: string }
      | undefined;
    return { flow: JSON.parse(row?.value_json || '{}') };
  });

  app.get('/admin/me', { preHandler: staffGuard(db) }, async (req) => {
    if (!req.staff) throw forbidden();
    return {
      permissions: Array.from(req.staff.perms),
      hasProfit: hasPerm(req.staff, 'dashboard:profit')
    };
  });
}
