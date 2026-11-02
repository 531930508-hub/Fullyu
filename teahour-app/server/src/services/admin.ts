import type { Database as DatabaseType } from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { hasPerm, loadStaff, publicStaff, type StaffUser } from '../lib/auth.js';
import { mapProduct, mapStaffSummary, mapStore, type ProductRow, type StoreRow } from './mappers.js';
import { newId } from '../lib/ids.js';
import { logAction } from '../db/index.js';
import { PERMISSION_CODES, PERMISSIONS, PERMISSION_MODULES, ROLE_TEMPLATES } from '../lib/permissions.js';

export function listProducts(db: DatabaseType) {
  const rows = db.prepare('SELECT * FROM products ORDER BY series, id').all() as ProductRow[];
  const stock = db
    .prepare('SELECT product_id, SUM(grams) AS grams, SUM(sold_out) AS sold_out FROM stock GROUP BY product_id')
    .all() as Array<{ product_id: string; grams: number; sold_out: number }>;
  const stockMap = new Map(stock.map((x) => [x.product_id, x]));
  return rows.map((row) => ({
    ...mapProduct(row),
    totalGrams: stockMap.get(row.id)?.grams || 0,
    soldOutStores: stockMap.get(row.id)?.sold_out || 0
  }));
}

export function listCategoriesAdmin(db: DatabaseType) {
  return db.prepare('SELECT * FROM categories ORDER BY rowid').all().map((row) => {
    const r = row as { id: string; name: string; name_en: string; kind: string };
    return { id: r.id, name: r.name, nameEn: r.name_en, kind: r.kind };
  });
}

type ProductInput = {
  name?: string;
  nameEn?: string;
  categoryId?: string;
  series?: string;
  kind?: 'tea' | 'retail' | 'bottle';
  priceCents?: number;
  costCents?: number;
  doseGrams?: number;
  status?: string;
  temps?: string[];
  ice?: boolean;
  memberEligible?: boolean;
  desc?: string;
  descEn?: string;
  spec?: string;
  specEn?: string;
  tag?: string;
  tagEn?: string;
  unit?: string;
  unitEn?: string;
};

const SERIES_IDS = ['xing', 'song', 'qing', 'mian'];

export function createProduct(db: DatabaseType, staff: StaffUser, input: ProductInput) {
  const name = String(input.name || '').trim();
  if (!name) throw badRequest('请填写商品名称');
  const nameEn = String(input.nameEn || '').trim() || name;
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(String(input.categoryId || '')) as
    | { id: string; kind: string }
    | undefined;
  if (!category) throw badRequest('请选择有效分类');
  const series = String(input.series || '');
  if (!SERIES_IDS.includes(series)) throw badRequest('系列无效');
  const kind = input.kind || (category.kind === 'fresh' ? 'tea' : 'retail');
  if (!['tea', 'retail', 'bottle'].includes(kind)) throw badRequest('商品类型无效');
  const priceCents = Math.round(Number(input.priceCents || 0));
  const costCents = Math.round(Number(input.costCents || 0));
  if (!Number.isInteger(priceCents) || priceCents < 0) throw badRequest('售价须为非负整数（分）');
  if (!Number.isInteger(costCents) || costCents < 0) throw badRequest('成本须为非负整数（分）');
  const dose = Number(input.doseGrams ?? (kind === 'tea' ? 3.5 : 1));
  if (!(dose > 0)) throw badRequest('每杯剂量须大于 0');
  const id = newId('P');
  const now = Date.now();
  const status = input.status === 'draft' || input.status === 'archived' ? input.status : 'published';
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO products (id, name, name_en, category_id, series, kind, price_cents, cost_cents, dose_g, status, temps_json, ice, member_eligible,
        desc_zh, desc_en, spec_zh, spec_en, tag_zh, tag_en, unit_zh, unit_en, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      name,
      nameEn,
      category.id,
      series,
      kind,
      priceCents,
      costCents,
      dose,
      status,
      JSON.stringify(input.temps || (kind === 'tea' ? ['热', '冰'] : [])),
      input.ice === false ? 0 : 1,
      input.memberEligible === false ? 0 : 1,
      input.desc || '',
      input.descEn || '',
      input.spec || '',
      input.specEn || '',
      input.tag || '',
      input.tagEn || '',
      input.unit || (kind === 'tea' ? '杯' : '件'),
      input.unitEn || (kind === 'tea' ? 'cup' : 'pc'),
      now
    );
    const stores = db.prepare('SELECT id FROM stores').all() as Array<{ id: string }>;
    for (const store of stores) {
      db.prepare('INSERT INTO stock (store_id, product_id, grams, sold_out) VALUES (?,?,0,0)').run(store.id, id);
    }
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: '创建商品',
      detail: `${name} · ${series} · ¥${(priceCents / 100).toFixed(2)}`,
      type: 'product'
    });
  });
  tx();
  return listProducts(db).find((x) => x.id === id);
}

export function updateProduct(db: DatabaseType, staff: StaffUser, id: string, input: ProductInput) {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined;
  if (!row) throw notFound('商品不存在');
  if (input.priceCents != null && !hasPerm(staff, 'product:price')) {
    throw forbidden('当前账号不能调整售价');
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };
  if (input.name != null) add('name', String(input.name).trim() || row.name);
  if (input.nameEn != null) add('name_en', String(input.nameEn).trim() || row.name_en);
  if (input.categoryId != null) {
    const exists = db.prepare('SELECT id FROM categories WHERE id = ?').get(input.categoryId);
    if (!exists) throw badRequest('分类不存在');
    add('category_id', input.categoryId);
  }
  if (input.series != null) {
    if (!SERIES_IDS.includes(input.series)) throw badRequest('系列无效');
    add('series', input.series);
  }
  if (input.kind != null) {
    if (!['tea', 'retail', 'bottle'].includes(input.kind)) throw badRequest('商品类型无效');
    add('kind', input.kind);
  }
  if (input.priceCents != null) {
    const cents = Math.round(Number(input.priceCents));
    if (!Number.isInteger(cents) || cents < 0) throw badRequest('售价无效');
    add('price_cents', cents);
  }
  if (input.costCents != null) {
    const cents = Math.round(Number(input.costCents));
    if (!Number.isInteger(cents) || cents < 0) throw badRequest('成本无效');
    add('cost_cents', cents);
  }
  if (input.doseGrams != null) {
    const dose = Number(input.doseGrams);
    if (!(dose > 0)) throw badRequest('剂量无效');
    add('dose_g', dose);
  }
  if (input.status != null) {
    if (!['published', 'draft', 'archived'].includes(input.status)) throw badRequest('状态无效');
    add('status', input.status);
  }
  if (input.temps != null) add('temps_json', JSON.stringify(input.temps));
  if (input.ice != null) add('ice', input.ice ? 1 : 0);
  if (input.memberEligible != null) add('member_eligible', input.memberEligible ? 1 : 0);
  if (input.desc != null) add('desc_zh', input.desc);
  if (input.descEn != null) add('desc_en', input.descEn);
  if (input.spec != null) add('spec_zh', input.spec);
  if (input.specEn != null) add('spec_en', input.specEn);
  if (input.tag != null) add('tag_zh', input.tag);
  if (input.tagEn != null) add('tag_en', input.tagEn);
  if (input.unit != null) add('unit_zh', input.unit);
  if (input.unitEn != null) add('unit_en', input.unitEn);
  if (!sets.length) return listProducts(db).find((x) => x.id === id);
  add('updated_at', Date.now());
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  logAction(db, {
    actorId: staff.id,
    actorName: staff.name,
    action: '更新商品',
    detail: `${row.name}${input.priceCents != null ? ` · 售价 ¥${(input.priceCents / 100).toFixed(2)}` : ''}`,
    type: 'product'
  });
  return listProducts(db).find((x) => x.id === id);
}

export function saveCategory(
  db: DatabaseType,
  staff: StaffUser,
  input: { id?: string; name?: string; nameEn?: string; kind?: string }
) {
  const name = String(input.name || '').trim();
  if (!name) throw badRequest('请填写分类名称');
  const kind = input.kind || 'fresh';
  if (!['fresh', 'retail', 'bottle'].includes(kind)) throw badRequest('分类类型无效');
  if (input.id) {
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(input.id) as
      | { id: string }
      | undefined;
    if (!existing) throw notFound('分类不存在');
    db.prepare('UPDATE categories SET name = ?, name_en = ?, kind = ? WHERE id = ?').run(
      name,
      String(input.nameEn || '').trim() || name,
      kind,
      input.id
    );
    logAction(db, { actorId: staff.id, actorName: staff.name, action: '更新分类', detail: name, type: 'product' });
    return listCategoriesAdmin(db).find((x) => x.id === input.id);
  }
  const id = newId('CAT');
  db.prepare('INSERT INTO categories (id, name, name_en, kind) VALUES (?,?,?,?)').run(
    id,
    name,
    String(input.nameEn || '').trim() || name,
    kind
  );
  logAction(db, { actorId: staff.id, actorName: staff.name, action: '创建分类', detail: name, type: 'product' });
  return listCategoriesAdmin(db).find((x) => x.id === id);
}

export function listStoresAdmin(db: DatabaseType) {
  return (db.prepare('SELECT * FROM stores ORDER BY city, id').all() as StoreRow[]).map(mapStore);
}

export function updateStore(
  db: DatabaseType,
  staff: StaffUser,
  id: string,
  input: {
    open?: boolean;
    retailPickup?: boolean;
    printerStatus?: string;
    channels?: Record<string, boolean>;
    positions?: string[];
    hours?: string;
    waitMinutes?: number;
  }
) {
  const row = db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as StoreRow | undefined;
  if (!row) throw notFound('门店不存在');
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.open != null) {
    sets.push('open = ?');
    params.push(input.open ? 1 : 0);
  }
  if (input.retailPickup != null) {
    sets.push('retail_pickup = ?');
    params.push(input.retailPickup ? 1 : 0);
  }
  if (input.printerStatus != null) {
    if (!['online', 'offline'].includes(input.printerStatus)) throw badRequest('标签机状态无效');
    sets.push('printer_status = ?');
    params.push(input.printerStatus);
  }
  if (input.channels != null) {
    sets.push('channels_json = ?');
    params.push(JSON.stringify(input.channels));
  }
  if (input.positions != null) {
    const positions = input.positions.map((x) => String(x).trim()).filter(Boolean);
    if (!positions.length) throw badRequest('至少保留一个位置');
    sets.push('positions_json = ?');
    params.push(JSON.stringify(positions));
  }
  if (input.hours != null) {
    sets.push('hours = ?');
    params.push(String(input.hours).slice(0, 40));
  }
  if (input.waitMinutes != null) {
    const wait = Math.round(Number(input.waitMinutes));
    if (!(wait >= 0 && wait <= 180)) throw badRequest('等待时间应在 0–180 分钟');
    sets.push('wait_minutes = ?');
    params.push(wait);
  }
  if (!sets.length) return mapStore(row);
  db.prepare(`UPDATE stores SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  logAction(db, { actorId: staff.id, actorName: staff.name, action: '更新门店配置', detail: row.name, type: 'store' });
  return mapStore(db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as StoreRow);
}

export function listRoles(db: DatabaseType) {
  return (
    db.prepare('SELECT * FROM roles ORDER BY builtin DESC, id').all() as Array<{
      id: string;
      name: string;
      description: string;
      scope: string;
      builtin: number;
      perms_json: string;
    }>
  ).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    builtin: !!row.builtin,
    perms: JSON.parse(row.perms_json),
    users: (
      db.prepare('SELECT COUNT(*) AS n FROM user_roles WHERE role_id = ?').get(row.id) as { n: number }
    ).n
  }));
}

export function permissionCatalog() {
  return { modules: PERMISSION_MODULES, permissions: PERMISSIONS, codes: PERMISSION_CODES };
}

export function saveRole(
  db: DatabaseType,
  staff: StaffUser,
  input: { id?: string; name?: string; description?: string; scope?: string; perms?: string[] }
) {
  if (!hasPerm(staff, 'rbac:edit')) throw forbidden('没有维护角色的权限');
  const name = String(input.name || '').trim();
  if (!name) throw badRequest('请填写角色名称');
  const scope = input.scope === 'STORES' ? 'STORES' : 'ALL';
  const perms = Array.from(new Set(input.perms || []));
  for (const perm of perms) {
    if (perm === '*') throw badRequest('自定义角色不能使用全部权限通配符');
    if (!(PERMISSION_CODES as readonly string[]).includes(perm)) throw badRequest(`未知权限：${perm}`);
    if (!hasPerm(staff, perm)) throw forbidden(`不能授予自己没有的权限：${perm}`);
  }
  if (!perms.length) throw badRequest('请至少选择一个权限');
  if (input.id) {
    const row = db.prepare('SELECT * FROM roles WHERE id = ?').get(input.id) as
      | { builtin: number; name: string }
      | undefined;
    if (!row) throw notFound('角色不存在');
    if (row.builtin) throw conflict('内置角色不可修改，请克隆为自定义角色');
    db.prepare('UPDATE roles SET name = ?, description = ?, scope = ?, perms_json = ? WHERE id = ?').run(
      name,
      String(input.description || '').slice(0, 200),
      scope,
      JSON.stringify(perms),
      input.id
    );
    logAction(db, { actorId: staff.id, actorName: staff.name, action: '更新角色', detail: name, type: 'rbac' });
    return listRoles(db).find((x) => x.id === input.id);
  }
  const id = newId('R');
  db.prepare('INSERT INTO roles (id, name, description, scope, builtin, perms_json) VALUES (?,?,?,?,0,?)').run(
    id,
    name,
    String(input.description || '').slice(0, 200),
    scope,
    JSON.stringify(perms)
  );
  logAction(db, { actorId: staff.id, actorName: staff.name, action: '创建角色', detail: name, type: 'rbac' });
  return listRoles(db).find((x) => x.id === id);
}

export function listStaff(db: DatabaseType) {
  return (
    db.prepare('SELECT id FROM users ORDER BY created_at').all() as Array<{ id: string }>
  ).map((row) => {
    const user = loadStaff(db, row.id)!;
    return mapStaffSummary(user);
  });
}

export function saveStaff(
  db: DatabaseType,
  actor: StaffUser,
  input: {
    id?: string;
    name?: string;
    username?: string;
    password?: string;
    roleIds?: string[];
    storeIds?: string[];
    allStores?: boolean;
    active?: boolean;
  }
) {
  if (!hasPerm(actor, 'rbac:edit')) throw forbidden('没有维护账号的权限');
  const name = String(input.name || '').trim();
  if (!name) throw badRequest('请填写姓名');
  const roleIds = Array.from(new Set(input.roleIds || []));
  if (!roleIds.length) throw badRequest('请至少选择一个角色');
  const roles = (
    db.prepare(`SELECT * FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`).all(...roleIds) as Array<{
      id: string;
      perms_json: string;
    }>
  );
  if (roles.length !== roleIds.length) throw badRequest('存在无效角色');
  if (!hasPerm(actor, '*')) {
    for (const role of roles) {
      for (const perm of JSON.parse(role.perms_json) as string[]) {
        if (perm !== '*' && !hasPerm(actor, perm)) throw forbidden('不能授予自己没有的权限');
      }
    }
  }
  const allStores = !!input.allStores;
  const storeIds = allStores ? [] : Array.from(new Set(input.storeIds || []));
  if (!allStores && !storeIds.length) throw badRequest('请选择授权门店');
  for (const storeId of storeIds) {
    const exists = db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId);
    if (!exists) throw badRequest('存在无效门店');
  }
  const now = Date.now();
  if (input.id) {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(input.id) as
      | { id: string; username: string }
      | undefined;
    if (!existing) throw notFound('账号不存在');
    const sets = ['name = ?', 'all_stores = ?', 'active = ?'];
    const params: unknown[] = [name, allStores ? 1 : 0, input.active === false ? 0 : 1];
    if (input.password) {
      if (String(input.password).length < 8) throw badRequest('密码至少 8 位');
      sets.push('password_hash = ?');
      params.push(bcrypt.hashSync(String(input.password), 10));
    }
    db.transaction(() => {
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, input.id);
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(input.id);
      for (const roleId of roleIds) db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)').run(input.id, roleId);
      db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(input.id);
      for (const storeId of storeIds) {
        db.prepare('INSERT INTO user_stores (user_id, store_id) VALUES (?,?)').run(input.id, storeId);
      }
    })();
    logAction(db, { actorId: actor.id, actorName: actor.name, action: '更新账号', detail: existing.username, type: 'rbac' });
    return mapStaffSummary(loadStaff(db, input.id)!);
  }
  const username = String(input.username || '').trim();
  if (!/^\d{6,20}$/.test(username)) throw badRequest('账号应为 6–20 位数字手机号');
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) throw conflict('该账号已存在');
  const password = String(input.password || '');
  if (password.length < 8) throw badRequest('密码至少 8 位');
  const id = newId('U');
  db.transaction(() => {
    db.prepare(
      'INSERT INTO users (id, name, username, password_hash, all_stores, active, created_at) VALUES (?,?,?,?,?,?,?)'
    ).run(id, name, username, bcrypt.hashSync(password, 10), allStores ? 1 : 0, input.active === false ? 0 : 1, now);
    for (const roleId of roleIds) db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)').run(id, roleId);
    for (const storeId of storeIds) db.prepare('INSERT INTO user_stores (user_id, store_id) VALUES (?,?)').run(id, storeId);
  })();
  logAction(db, { actorId: actor.id, actorName: actor.name, action: '创建账号', detail: `${name} · ${username}`, type: 'rbac' });
  return mapStaffSummary(loadStaff(db, id)!);
}

export function listLogs(
  db: DatabaseType,
  options: { storeIds: string[]; q?: string; type?: string; from?: number; to?: number; limit?: number }
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.storeIds.length) {
    clauses.push(`(store_id IN (${options.storeIds.map(() => '?').join(',')}) OR store_id = 'brand')`);
    params.push(...options.storeIds);
  }
  if (options.type && options.type !== 'all') {
    clauses.push('type = ?');
    params.push(options.type);
  }
  if (options.from != null) {
    clauses.push('at >= ?');
    params.push(options.from);
  }
  if (options.to != null) {
    clauses.push('at < ?');
    params.push(options.to);
  }
  const rows = db
    .prepare(
      `SELECT l.*, s.name AS store_name FROM logs l LEFT JOIN stores s ON s.id = l.store_id
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY l.at DESC, l.rowid DESC LIMIT ?`
    )
    .all(...params, options.limit || 200) as Array<{
    id: string;
    actor_id: string | null;
    actor_name: string | null;
    action: string;
    detail: string;
    type: string;
    store_id: string | null;
    store_name: string | null;
    order_id: string | null;
    at: number;
  }>;
  const q = (options.q || '').trim().toLowerCase();
  return rows
    .filter((row) => !q || `${row.actor_name || ''}${row.action}${row.detail}`.toLowerCase().includes(q))
    .map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorName: row.actor_name || '系统',
      action: row.action,
      detail: row.detail,
      type: row.type,
      storeId: row.store_id,
      storeName: row.store_id === 'brand' ? '品牌零售 / 总部' : row.store_name,
      orderId: row.order_id,
      at: row.at
    }));
}

export function listMappings(db: DatabaseType) {
  return (
    db.prepare(
      `SELECT m.*, p.name AS product_name, p.kind FROM mappings m JOIN products p ON p.id = m.product_id ORDER BY m.external_id`
    ).all() as Array<{
      id: string;
      external_id: string;
      product_id: string;
      unit: string;
      factor: number;
      updated_at: number;
      product_name: string;
      kind: string;
    }>
  ).map((row) => ({
    id: row.id,
    externalId: row.external_id,
    productId: row.product_id,
    productName: row.product_name,
    kind: row.kind,
    unit: row.unit,
    factor: row.factor,
    updatedAt: row.updated_at
  }));
}

export function saveMapping(
  db: DatabaseType,
  staff: StaffUser,
  input: { id?: string; externalId?: string; productId?: string; unit?: string; factor?: number }
) {
  if (!hasPerm(staff, 'mapping:edit')) throw forbidden('没有维护映射的权限');
  const externalId = String(input.externalId || '').trim();
  const productId = String(input.productId || '');
  const factor = Number(input.factor);
  if (!externalId) throw badRequest('请填写原料 SKU 编号');
  if (!(factor > 0)) throw badRequest('换算系数须大于 0');
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) throw badRequest('商品不存在');
  if (input.id) {
    db.prepare('UPDATE mappings SET external_id = ?, product_id = ?, unit = ?, factor = ?, updated_at = ? WHERE id = ?').run(
      externalId,
      productId,
      String(input.unit || '袋'),
      factor,
      Date.now(),
      input.id
    );
  } else {
    db.prepare('INSERT INTO mappings (id, external_id, product_id, unit, factor, updated_at) VALUES (?,?,?,?,?,?)').run(
      newId('MAP'),
      externalId,
      productId,
      String(input.unit || '袋'),
      factor,
      Date.now()
    );
  }
  logAction(db, { actorId: staff.id, actorName: staff.name, action: '更新原料映射', detail: externalId, type: 'product' });
  return listMappings(db).find((x) => x.externalId === externalId);
}

export function roleTemplates() {
  return ROLE_TEMPLATES;
}

export function staffPublic(user: StaffUser) {
  return publicStaff(user);
}
