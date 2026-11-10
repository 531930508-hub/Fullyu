import { get, post } from './request'

/** 代金券列表（后台；status=UNCLAIMED 表示未兑换的兑换码券） */
export function listVouchers(params?: { userId?: string; status?: string; batchNo?: string }) {
  return get('/vouchers', params)
}

/** 发放代金券（指定用户） */
export function grantVoucher(body: any) {
  return post('/vouchers/grant', body)
}

/** 兑换码批量发券：每批 N 张，各带唯一兑换码 */
export function grantVoucherBatch(body: {
  quantity: number
  mode?: 'REDUCE_BY' | 'REDUCE_TO'
  amount?: number
  targetPrice?: number
  expiresAt: string
  source?: string
  applicableAll?: boolean
  applicableCourseIds?: string[]
}) {
  return post('/vouchers/batch', body)
}

/** 兑换码批次列表 */
export function listVoucherBatches() {
  return get('/vouchers/batches')
}

/** 兑换码批次明细 */
export function getVoucherBatchDetail(batchNo: string) {
  return get(`/vouchers/batches/${encodeURIComponent(batchNo)}`)
}

/** 作废代金券 */
export function revokeVoucher(id: string) {
  return post(`/vouchers/${id}/revoke`)
}
