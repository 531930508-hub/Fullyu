import { get, post, put } from './request'

/** 结算列表 */
export function listSettlements(trainerId?: string) {
  return get('/settlements', { trainerId })
}

/** 生成课程结算 */
export function settle(body: { courseId: string; hours: number; rate?: number }) {
  return post('/settlements', body)
}

/** 人工调整结算（单笔） */
export function adjustSettlement(id: string, body: { adjustedAmount: number; adjustNote: string }) {
  return put(`/settlements/${id}/adjust`, body)
}

/** 批量调整结算 */
export function batchAdjustSettlements(items: Array<{ id: string; adjustedAmount: number; adjustNote: string }>) {
  return post('/settlements/batch-adjust', { items })
}
