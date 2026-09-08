import { get, post, put, del } from './request'

/** 场地列表 */
export function listVenues() {
  return get('/venues')
}

/** 场地详情 */
export function getVenue(id: string) {
  return get(`/venues/${id}`)
}

/** 创建场地 */
export function createVenue(body: any) {
  return post('/venues', body)
}

/** 更新场地 */
export function updateVenue(id: string, body: any) {
  return put(`/venues/${id}`, body)
}

/** 删除场地 */
export function removeVenue(id: string) {
  return del(`/venues/${id}`)
}

/** 场地预约列表 */
export function listReservations(params?: { venueId?: string; date?: string }) {
  return get('/venues/reservations', params)
}

/** 创建场地预约 */
export function createReservation(body: any) {
  return post('/venues/reservations', body)
}

/** 编辑场地预约元信息（使用类型/合同状态/销售/金额等） */
export function updateReservation(id: string, body: any) {
  return put(`/venues/reservations/${id}`, body)
}

/** 上传合同（可选同步标记为已签约） */
export function uploadReservationContract(
  id: string,
  body: { contractUrl: string; contractName?: string; markSigned?: boolean },
) {
  return post(`/venues/reservations/${id}/contract`, body)
}

/** 删除场地预约 */
export function removeReservation(id: string) {
  return del(`/venues/reservations/${id}`)
}

/** 场地预约操作日志 */
export function listReservationLogs(params?: { venueId?: string; limit?: number; from?: string; to?: string }) {
  return get('/venues/reservation-logs', params)
}

/** 合同管理列表 */
export function listContractReservations(params?: {
  contractStatus?: 'INTENT' | 'SIGNED'
  venueId?: string
  keyword?: string
}) {
  return get('/venues/contracts', params)
}

/** 预约收款流水 */
export function listPayments(reservationId: string) {
  return get(`/venues/reservations/${reservationId}/payments`)
}

/** 记录一笔收款 */
export function createPayment(
  reservationId: string,
  body: {
    amount: number // 分
    method: 'OFFLINE_TRANSFER' | 'QR_CODE'
    transferAt?: string
    counterparty?: string
    qrChannel?: 'ALIPAY' | 'WECHAT'
    remark?: string
    status?: 'PENDING' | 'CONFIRMED'
  },
) {
  return post(`/venues/reservations/${reservationId}/payments`, body)
}

/** 确认/取消收款流水 */
export function confirmPayment(paymentId: string, status: 'CONFIRMED' | 'CANCELLED') {
  return put(`/venues/payments/${paymentId}/status`, { status })
}

/** 获取收款码配置 */
export function getPaymentQrConfig() {
  return get('/venues/payment-qr')
}

/** 更新收款码配置 */
export function setPaymentQrConfig(body: { alipay?: string | null; wechat?: string | null }) {
  return put('/venues/payment-qr', body)
}
