import { post } from './request'

export interface AdminLoginResult {
  token: string
  admin: { id: string; username: string; name: string; permissions: string[] }
}

/** 管理后台登录 */
export function adminLogin(username: string, password: string) {
  return post<AdminLoginResult>('/auth/admin/login', { username, password })
}
