import { get, post, put, del } from './request'
import type { DataScope } from '@fullyu/shared'

export interface AdminRow {
  id: string
  username: string
  name: string
  phone: string | null
  isActive: boolean
  orgId: string | null
  createdAt: string
  org: { id: string; name: string; shortName: string; type: string } | null
  roles: { role: { id: string; name: string; description: string | null; dataScope: DataScope } }[]
}

export interface RoleRow {
  id: string
  name: string
  description: string | null
  dataScope: DataScope
  isBuiltin: boolean
  createdAt: string
  userCount: number
  permissionIds: string[]
  permissionCodes: string[]
}

export interface PermissionRow {
  id: string
  code: string
  name: string
  module: string
  level: 'MENU' | 'TAB' | 'ACTION' | 'FIELD'
  groupName: string
  sortOrder: number
}

export interface PermTreeNode {
  key: string
  title: string
  code?: string
  level?: string
  levelName?: string
  children?: PermTreeNode[]
}

export interface PermissionTreeResult {
  tree: PermTreeNode[]
  dataScopes: { value: DataScope; name: string; desc: string }[]
}

/** 人员下拉选项 */
export interface AdminOption {
  id: string
  /** 选人的存值：登录名（即手机号），比 id 稳定且可读 */
  value: string
  username: string
  name: string
  orgId: string | null
  orgName: string
  /** 展示文本，形如「福田店·李文静」 */
  label: string
}

/** 管理员列表 */
export function listAdmins() {
  return get<AdminRow[]>('/rbac/admins')
}

/**
 * 人员下拉选项（选审批人/负责人用）。
 * 与 listAdmins 分开：该接口仅需登录，不要求 rbac:view，
 * 所以只有审批权限的人也能正常选人。
 */
export function listAdminOptions() {
  return get<AdminOption[]>('/rbac/admin-options')
}

/** 创建管理员 */
export function createAdmin(body: any) {
  return post('/rbac/admins', body)
}

/** 更新管理员 */
export function updateAdmin(id: string, body: any) {
  return put(`/rbac/admins/${id}`, body)
}

/** 角色列表 */
export function listRoles() {
  return get<RoleRow[]>('/rbac/roles')
}

/** 创建角色 */
export function createRole(body: any) {
  return post('/rbac/roles', body)
}

/** 复制角色为自定义角色 */
export function cloneRole(id: string, body: { name: string; description?: string }) {
  return post(`/rbac/roles/${id}/clone`, body)
}

/** 更新角色（含权限分配与数据范围） */
export function updateRole(id: string, body: any) {
  return put(`/rbac/roles/${id}`, body)
}

/** 删除角色 */
export function removeRole(id: string) {
  return del(`/rbac/roles/${id}`)
}

/** 权限点列表 */
export function listPermissions() {
  return get<PermissionRow[]>('/rbac/permissions')
}

/** 权限树（模块-分组-权限点）与数据范围选项 */
export function getPermissionTree() {
  return get<PermissionTreeResult>('/rbac/permission-tree')
}
