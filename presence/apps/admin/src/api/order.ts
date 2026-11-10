import { get, post } from './request'

/** 后台订单列表 */
export function adminListOrders(params?: { status?: string; orderType?: string; keyword?: string }) {
  return get('/order-admin', params)
}

/** 强制退款（客诉特殊处理，经二次审批） */
export function forceRefundOrder(id: string, body: { amount?: number; reason?: string }) {
  return post(`/order-admin/${id}/force-refund`, body)
}

export interface RefundRecord {
  id: string
  outRefundNo: string
  amountYuan: string
  status: string
  source: string
  reason?: string | null
  operatorName?: string | null
  attempts: number
  gatewayRef?: string | null
  failCode?: string | null
  failMessage?: string | null
  createdAt: string
  settledAt?: string | null
}

export interface RefundSummary {
  orderId: string
  orderStatus: string
  orderType: string
  actualPaidFen: number
  refundedFen: number
  remainingFen: number
  activeRefundId: string | null
  canQueryGateway: boolean
  canForceRefund: boolean
  refunds: RefundRecord[]
}

/** 退款台账：累计已退 / 剩余可退 / 各次退款流水 */
export function getRefundSummary(id: string) {
  return get<RefundSummary>(`/order-admin/${id}/refunds`)
}

/** 重试结果待确认的退款流水（同一流水号，网关幂等） */
export function retryOrderRefund(orderId: string, refundId: string) {
  return post(`/order-admin/${orderId}/refunds/${refundId}/retry`)
}

/** 人工确认该笔退款未发生（作废流水，可重新发起） */
export function confirmOrderRefundFailed(orderId: string, refundId: string) {
  return post(`/order-admin/${orderId}/refunds/${refundId}/confirm-failed`)
}

/** 主动查询网关退款结果（回调丢失时使用，查到即按回调口径结算） */
export function queryOrderRefund(orderId: string, refundId: string) {
  return post<{ status: string; message: string; orderStatus: string }>(
    `/order-admin/${orderId}/refunds/${refundId}/query`,
  )
}

/** 主动查询旧版退款（改造前未落流水，按订单定位） */
export function queryLegacyOrderRefund(orderId: string) {
  return post<{ status: string; message: string; orderStatus: string }>(
    `/order-admin/${orderId}/refund-query`,
  )
}

/** 人工确认旧版退款未发生（无流水时按订单作废，可重新发起） */
export function confirmLegacyOrderRefundFailed(orderId: string) {
  return post(`/order-admin/${orderId}/refund-confirm-failed`)
}
