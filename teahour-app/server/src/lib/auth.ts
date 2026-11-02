import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database as DatabaseType } from 'better-sqlite3';
import { forbidden, unauthorized } from './errors.js';

export type Role = {
  id: string;
  name: string;
  description: string;
  scope: string;
  builtin: boolean;
  perms: string[];
};

export type StaffUser = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  allStores: boolean;
  storeIds: string[];
  roles: Role[];
  perms: Set<string>;
};

export type CustomerUser = {
  id: string;
  memberCode: string;
  name: string;
  phone: string | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    staff?: StaffUser;
    customer?: CustomerUser;
  }
}

export function loadStaff(db: DatabaseType, id: string): StaffUser | null {
  const row = db
    .prepare('SELECT id, name, username, active, all_stores FROM users WHERE id = ?')
    .get(id) as
    | { id: string; name: string; username: string; active: number; all_stores: number }
    | undefined;
  if (!row) return null;
  const roles = db
    .prepare(
      `SELECT r.id, r.name, r.description, r.scope, r.builtin, r.perms_json
       FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`
    )
    .all(id) as Array<{
    id: string;
    name: string;
    description: string;
    scope: string;
    builtin: number;
    perms_json: string;
  }>;
  const perms = new Set<string>();
  for (const role of roles) {
    for (const perm of JSON.parse(role.perms_json) as string[]) perms.add(perm);
  }
  const storeIds = (
    db.prepare('SELECT store_id FROM user_stores WHERE user_id = ?').all(id) as Array<{ store_id: string }>
  ).map((x) => x.store_id);
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    active: !!row.active,
    allStores: !!row.all_stores,
    storeIds,
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      scope: r.scope,
      builtin: !!r.builtin,
      perms: JSON.parse(r.perms_json)
    })),
    perms
  };
}

export function loadCustomer(db: DatabaseType, id: string): CustomerUser | null {
  const row = db
    .prepare('SELECT id, member_code, name, phone FROM customers WHERE id = ?')
    .get(id) as { id: string; member_code: string; name: string; phone: string | null } | undefined;
  return row ? { id: row.id, memberCode: row.member_code, name: row.name, phone: row.phone } : null;
}

export function hasPerm(user: StaffUser, permission: string): boolean {
  return user.perms.has('*') || user.perms.has(permission);
}

export function assertPerm(user: StaffUser, permission: string): void {
  if (!hasPerm(user, permission)) throw forbidden('当前账号没有该操作权限');
}

export function assertStoreAccess(user: StaffUser, storeId: string): void {
  if (storeId === 'brand') {
    if (!user.allStores) throw forbidden('只有全部门店范围才能访问品牌 / 总部数据');
    return;
  }
  if (!user.allStores && !user.storeIds.includes(storeId)) {
    throw forbidden('当前账号没有该门店的数据权限');
  }
}

export function publicStaff(user: StaffUser) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    active: user.active,
    allStores: user.allStores,
    storeIds: user.storeIds,
    roles: user.roles.map((r) => ({ id: r.id, name: r.name, scope: r.scope })),
    permissions: Array.from(user.perms)
  };
}

export function staffGuard(db: DatabaseType, permission?: string) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw unauthorized();
    let payload: { kind?: string; sub?: string };
    try {
      payload = req.server.jwt.verify<{ kind?: string; sub?: string }>(token);
    } catch {
      throw unauthorized('登录状态已过期，请重新登录');
    }
    if (payload.kind !== 'staff' || !payload.sub) throw unauthorized();
    const staff = loadStaff(db, payload.sub);
    if (!staff || !staff.active) throw unauthorized('账号已停用或不存在');
    req.staff = staff;
    if (permission) assertPerm(staff, permission);
  };
}

export function customerGuard(db: DatabaseType) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw unauthorized('请先建立顾客会话');
    let payload: { kind?: string; sub?: string };
    try {
      payload = req.server.jwt.verify<{ kind?: string; sub?: string }>(token);
    } catch {
      throw unauthorized('顾客会话已过期');
    }
    if (payload.kind !== 'customer' || !payload.sub) throw unauthorized();
    const customer = loadCustomer(db, payload.sub);
    if (!customer) throw unauthorized('顾客会话不存在');
    req.customer = customer;
  };
}
