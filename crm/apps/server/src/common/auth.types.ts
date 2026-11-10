import { forbidden } from './errors';

export type StaffContext = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  perms: Set<string>;
  /** 会话版本：改密 / 撤销时 +1，令牌里的 ver 对不上立即失效。 */
  tokenVersion: number;
};

export function hasPerm(staff: StaffContext, permission: string): boolean {
  return staff.perms.has('*') || staff.perms.has(permission);
}

export function assertPerm(staff: StaffContext, permission: string): void {
  if (!hasPerm(staff, permission)) throw forbidden('当前账号没有该操作权限');
}
