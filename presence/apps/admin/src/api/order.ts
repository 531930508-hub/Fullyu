import { get, post } from './request'

/** 后台订单列表 */
export function adminListOrders(params?: { status?: string; orderType?: string; keyword?: string }) {
  return get('/order-admin', params)
}

/** 强制退款（客诉特殊处理，经二次审批） */
export function forceRefundOrder(id: string, body: { amount?: number; reason?: string }) {
  return post(`/order-admin/${id}/force-refund`, body)
}
