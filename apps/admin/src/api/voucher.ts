import { get, post } from './request'

/** 代金券列表（后台） */
export function listVouchers(params?: { userId?: string; status?: string }) {
  return get('/vouchers', params)
}

/** 发放代金券 */
export function grantVoucher(body: any) {
  return post('/vouchers/grant', body)
}

/** 作废代金券 */
export function revokeVoucher(id: string) {
  return post(`/vouchers/${id}/revoke`)
}
