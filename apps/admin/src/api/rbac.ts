import { get, post, put, del } from './request'

/** 管理员列表 */
export function listAdmins() {
  return get('/rbac/admins')
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
  return get('/rbac/roles')
}

/** 创建角色 */
export function createRole(body: any) {
  return post('/rbac/roles', body)
}

/** 更新角色（含权限分配） */
export function updateRole(id: string, body: any) {
  return put(`/rbac/roles/${id}`, body)
}

/** 删除角色 */
export function removeRole(id: string) {
  return del(`/rbac/roles/${id}`)
}

/** 权限点列表 */
export function listPermissions() {
  return get('/rbac/permissions')
}
