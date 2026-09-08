import { get, post } from './request'
import type { DataScope, PasswordPolicy } from '@fullyu/shared'

/** 登录返回的组织信息 */
export interface AdminOrgInfo {
  id: string
  name: string
  shortName: string
  type: string
}

export interface AdminLoginResult {
  token: string
  admin: {
    id: string
    username: string
    name: string
    permissions: string[]
    roles: string[]
    dataScope: DataScope
    org: AdminOrgInfo | null
    mustChangePassword: boolean
  }
}

/** 权限画像：刷新页面后以此为权威源重建菜单与按钮可见性 */
export interface AdminProfile {
  id: string
  username: string
  name: string
  permissions: string[]
  roles: string[]
  roleLabels: string[]
  dataScope: DataScope
  org: AdminOrgInfo | null
  visibleOrgIds: string[] | null
  mustChangePassword: boolean
}

/** 管理后台登录 */
export function adminLogin(username: string, password: string) {
  return post<AdminLoginResult>('/auth/admin/login', { username, password })
}

/** 当前管理员权限画像 */
export function adminProfile() {
  return get<AdminProfile>('/auth/admin/profile')
}

/** 管理员修改密码 */
export function adminChangePassword(oldPassword: string, newPassword: string) {
  return post('/auth/admin/change-password', { oldPassword, newPassword })
}

/** 后端当前生效的密码策略（免登录接口），hint 是给输入框用的一句话提示 */
export function getPasswordPolicy() {
  return get<PasswordPolicy & { hint: string }>('/auth/password-policy')
}
