import type { Database as DatabaseType } from 'better-sqlite3';
import {
  EXPENSE_CATEGORIES,
  parseExpenseAmount,
  parseExpenseDate,
  parseExpenseSheet,
  resolveExpenseCategory,
  resolveExpenseStore,
  expenseKey,
  sampleExpenseText,
  sampleMultiStoreExpenseText,
  type StoreAlias
} from '../lib/csv.js';
import { assertStoreAccess, type StaffUser } from '../lib/auth.js';
import { conflict, forbidden, notFound, unprocessable } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { logAction } from '../db/index.js';
import type { DateRange } from '../lib/dates.js';

type ExpenseRow = {
  id: string;
  store_id: string;
  category: string;
  amount_cents: number;
  at: string;
  memo: string;
  source: string;
  batch_id: string | null;
  created_by: string | null;
  created_at: number;
  voided_at: number | null;
  voided_by: string | null;
  store_name?: string | null;
};

const storeAliases = (db: DatabaseType): StoreAlias[] =>
  db.prepare('SELECT id, name, name_en, short, city, city_en FROM stores ORDER BY city, id').all() as StoreAlias[];

const categoryName = (id: string) =>
  EXPENSE_CATEGORIES.find((c) => c.id === id)?.name || id;

function storeLabel(db: DatabaseType, storeId: string): string {
  if (storeId === 'brand') return '品牌零售 / 总部';
  const row = db.prepare('SELECT name FROM stores WHERE id = ?').get(storeId) as { name: string } | undefined;
  return row?.name || storeId;
}

function assertExpenseScope(staff: StaffUser, storeId: string): void {
  if (storeId === 'brand') {
    if (!staff.allStores) throw forbidden('只有全部门店范围才能录入品牌 / 总部费用');
    return;
  }
  assertStoreAccess(staff, storeId);
}

function mapExpense(row: ExpenseRow) {
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: row.store_id === 'brand' ? '品牌零售 / 总部' : row.store_name || row.store_id,
    category: row.category,
    categoryName: categoryName(row.category),
    amountCents: row.amount_cents,
    date: row.at,
    memo: row.memo,
    source: row.source,
    batchId: row.batch_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by
  };
}

export function listExpenses(
  db: DatabaseType,
  options: {
    storeIds: string[];
    range?: DateRange;
    includeVoided?: boolean;
    category?: string;
    limit?: number;
  }
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.storeIds.length) {
    clauses.push(`e.store_id IN (${options.storeIds.map(() => '?').join(',')})`);
    params.push(...options.storeIds);
  }
  if (!options.includeVoided) clauses.push('e.voided_at IS NULL');
  if (options.range) {
    clauses.push('e.at >= ? AND e.at <= ?');
    params.push(options.range.fromDate, options.range.toDate);
  }
  if (options.category && options.category !== 'all') {
    clauses.push('e.category = ?');
    params.push(options.category);
  }
  const rows = db
    .prepare(
      `SELECT e.*, s.name AS store_name FROM expenses e LEFT JOIN stores s ON s.id = e.store_id
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY e.at DESC, e.created_at DESC LIMIT ?`
    )
    .all(...params, options.limit || 500) as ExpenseRow[];
  return rows.map(mapExpense);
}

export function expenseSummary(
  db: DatabaseType,
  options: { storeIds: string[]; range: DateRange }
) {
  const list = listExpenses(db, { ...options, limit: 5000 });
  const byCategory = EXPENSE_CATEGORIES.map((category) => {
    const rows = list.filter((x) => x.category === category.id);
    return {
      id: category.id,
      name: category.name,
      nameEn: category.nameEn,
      amountCents: rows.reduce((n, x) => n + x.amountCents, 0),
      count: rows.length
    };
  });
  const byStore = new Map<string, { storeId: string; storeName: string; amountCents: number; count: number }>();
  for (const row of list) {
    const existing = byStore.get(row.storeId) || {
      storeId: row.storeId,
      storeName: row.storeName,
      amountCents: 0,
      count: 0
    };
    existing.amountCents += row.amountCents;
    existing.count += 1;
    byStore.set(row.storeId, existing);
  }
  return {
    totalCents: list.reduce((n, x) => n + x.amountCents, 0),
    count: list.length,
    byCategory,
    byStore: Array.from(byStore.values()).sort((a, b) => b.amountCents - a.amountCents)
  };
}

function getExpense(db: DatabaseType, id: string): ExpenseRow | null {
  const row = db
    .prepare(
      `SELECT e.*, s.name AS store_name FROM expenses e LEFT JOIN stores s ON s.id = e.store_id WHERE e.id = ?`
    )
    .get(id) as ExpenseRow | undefined;
  return row || null;
}

export function addExpense(
  db: DatabaseType,
  staff: StaffUser,
  input: { storeId?: string; date?: string; category?: string; amount?: string | number; memo?: string }
) {
  const stores = storeAliases(db);
  const storeId = resolveExpenseStore(stores, input.storeId ?? '');
  assertExpenseScope(staff, storeId);
  const date = parseExpenseDate(input.date);
  const category = resolveExpenseCategory(input.category);
  const amountCents = parseExpenseAmount(input.amount);
  const memo = String(input.memo || '').trim().slice(0, 120);
  const id = newId('EX');
  const now = Date.now();
  db.prepare(
    `INSERT INTO expenses (id, store_id, category, amount_cents, at, memo, source, batch_id, created_by, created_at, voided_at, voided_by)
     VALUES (?,?,?,?,?,?, 'manual', NULL, ?, ?, NULL, NULL)`
  ).run(id, storeId, category.id, amountCents, date, memo, staff.id, now);
  logAction(db, {
    actorId: staff.id,
    actorName: staff.name,
    action: '录入运营费用',
    detail: `${storeLabel(db, storeId)} · ${category.name} · ¥${(amountCents / 100).toFixed(2)}${memo ? ` · ${memo}` : ''}`,
    type: 'finance',
    storeId,
    at: now
  });
  const created = getExpense(db, id);
  return created ? mapExpense(created) : null;
}

function accessibleStores(db: DatabaseType, staff: StaffUser): StoreAlias[] {
  const all = storeAliases(db);
  return staff.allStores ? all : all.filter((store) => staff.storeIds.includes(store.id));
}

export function previewExpenseImport(db: DatabaseType, staff: StaffUser, text: string) {
  const stores = accessibleStores(db, staff);
  const existing = new Set(
    (
      db.prepare('SELECT store_id, category, at, amount_cents, memo FROM expenses WHERE voided_at IS NULL').all() as Array<{
        store_id: string;
        category: string;
        at: string;
        amount_cents: number;
        memo: string;
      }>
    ).map((x) =>
      expenseKey({ storeId: x.store_id, category: x.category, date: x.at, amountCents: x.amount_cents, memo: x.memo })
    )
  );
  const parsed = parseExpenseSheet(text, stores, { existingKeys: existing });
  const rows = parsed.rows.filter((row) => {
    if (row.storeId === 'brand') return staff.allStores;
    return staff.allStores || staff.storeIds.includes(row.storeId);
  });
  const denied = parsed.rows.length - rows.length;
  const errors = [...parsed.errors];
  if (denied > 0) errors.push({ line: 0, message: `${denied} 行属于未授权门店，已跳过` });
  const totalCents = rows.reduce((n, x) => n + x.amountCents, 0);
  return {
    rows,
    errors,
    duplicates: parsed.duplicates,
    lineCount: parsed.lineCount,
    totalCents,
    storeCount: new Set(rows.map((x) => x.storeId)).size
  };
}

export function commitExpenseImport(db: DatabaseType, staff: StaffUser, text: string, source = 'import') {
  const preview = previewExpenseImport(db, staff, text);
  if (preview.errors.length) {
    const first = preview.errors[0];
    throw unprocessable(
      first.line ? `第 ${first.line} 行需要修正：${first.message}` : first.message,
      preview.errors
    );
  }
  if (!preview.rows.length) throw conflict('没有可新增的有效行（可能全部重复）');
  const batchId = newId('IMP');
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO expenses (id, store_id, category, amount_cents, at, memo, source, batch_id, created_by, created_at, voided_at, voided_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL)`
  );
  const tx = db.transaction(() => {
    for (const row of preview.rows) {
      insert.run(newId('EX'), row.storeId, row.category, row.amountCents, row.date, row.memo, source, batchId, staff.id, now);
    }
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: '批量导入运营费用',
      detail: `${preview.rows.length} 笔 · ¥${(preview.totalCents / 100).toFixed(2)} · ${preview.storeCount} 个门店 · 重复跳过 ${preview.duplicates} 笔`,
      type: 'finance',
      at: now
    });
  });
  tx();
  return {
    created: preview.rows.length,
    duplicates: preview.duplicates,
    totalCents: preview.totalCents,
    storeCount: preview.storeCount,
    batchId
  };
}

export function voidExpense(db: DatabaseType, staff: StaffUser, id: string) {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as ExpenseRow | undefined;
  if (!row) throw notFound('费用记录不存在');
  if (row.voided_at) throw conflict('该费用已作废');
  assertExpenseScope(staff, row.store_id);
  db.prepare('UPDATE expenses SET voided_at = ?, voided_by = ? WHERE id = ?').run(Date.now(), staff.id, id);
  logAction(db, {
    actorId: staff.id,
    actorName: staff.name,
    action: '作废运营费用',
    detail: `${storeLabel(db, row.store_id)} · ${categoryName(row.category)} · ¥${(row.amount_cents / 100).toFixed(2)}`,
    type: 'finance',
    storeId: row.store_id
  });
  const updated = getExpense(db, id);
  return updated ? mapExpense(updated) : null;
}

export function sampleExpenseFor(db: DatabaseType, staff: StaffUser, today: string) {
  if (!staff.allStores) {
    const names = accessibleStores(db, staff).map((s) => s.name);
    return names.length ? sampleMultiStoreExpenseText(today, names) : sampleExpenseText(today);
  }
  return sampleMultiStoreExpenseText(today, accessibleStores(db, staff).map((s) => s.name));
}
