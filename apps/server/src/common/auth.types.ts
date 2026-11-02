import { forbidden } from './errors';

export type RoleInfo = {
  id: string;
  name: string;
  description: string;
  scope: string;
  builtin: boolean;
  perms: string[];
};

export type StaffContext = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  allStores: boolean;
  storeIds: string[];
  roles: RoleInfo[];
  perms: Set<string>;
  /** 会话版本：密码重置 / 权限调整时 +1；与令牌里的 ver 不一致即视为已吊销。 */
  tokenVersion: number;
};

export type CustomerContext = {
  id: string;
  memberCode: string;
  name: string;
  phone: string | null;
};

export function hasPerm(user: StaffContext, permission: string): boolean {
  return user.perms.has('*') || user.perms.has(permission);
}

export function assertPerm(user: StaffContext, permission: string): void {
  if (!hasPerm(user, permission)) throw forbidden('当前账号没有该操作权限');
}

export function assertStoreAccess(user: StaffContext, storeId: string): void {
  if (storeId === 'brand') {
    if (!user.allStores) throw forbidden('只有全部门店范围才能访问品牌 / 总部数据');
    return;
  }
  if (!user.allStores && !user.storeIds.includes(storeId)) {
    throw forbidden('当前账号没有该门店的数据权限');
  }
}
