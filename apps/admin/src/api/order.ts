import { get, post } from './request'

/** 后台订单列表 */
export function adminListOrders(params?: { status?: string; orderType?: string; keyword?: string }) {
  return get('/order-admin', params)
}
