import { get, put } from './request'

/** 后台用户列表 */
export function adminListUsers(params?: { keyword?: string }) {
  return get('/user-admin', params)
}

/** 后台更新用户个人核验照片（用户不可自助修改） */
export function updateUserPhoto(id: string, photo: string) {
  return put(`/user-admin/${id}/photo`, { photo })
}
