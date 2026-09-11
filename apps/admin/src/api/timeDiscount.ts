import { get, post, put, del } from './request'

// ===== 会员卡时段折扣规则 =====

/** 规则列表（全量，按优先级升序） */
export function listTimeDiscountRules() {
  return get('/time-discounts/admin/list')
}

/** 创建规则 */
export function createTimeDiscountRule(body: any) {
  return post('/time-discounts', body)
}

/** 更新规则 */
export function updateTimeDiscountRule(id: string, body: any) {
  return put(`/time-discounts/${id}`, body)
}

/** 启用/停用 */
export function setTimeDiscountRuleStatus(id: string, status: 'ENABLED' | 'DISABLED') {
  return post(`/time-discounts/${id}/status`, { status })
}

/** 删除（被订单引用时后端拒绝） */
export function removeTimeDiscountRule(id: string) {
  return del(`/time-discounts/${id}`)
}

/** 优先级调序：传全量 id 顺序 */
export function reorderTimeDiscountRules(ids: string[]) {
  return post('/time-discounts/reorder', { ids })
}
