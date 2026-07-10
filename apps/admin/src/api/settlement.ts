import { get, post } from './request'

/** 结算列表 */
export function listSettlements(trainerId?: string) {
  return get('/settlements', { trainerId })
}

/** 生成课程结算 */
export function settle(body: { courseId: string; hours: number; rate?: number }) {
  return post('/settlements', body)
}
