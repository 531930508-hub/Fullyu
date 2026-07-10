import { get } from './request'

/** 后台用户列表 */
export function adminListUsers(params?: { keyword?: string }) {
  return get('/user-admin', params)
}
