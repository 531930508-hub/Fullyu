import { get } from './request'

/** 仪表盘概览 */
export function overview() {
  return get('/analytics/overview')
}

/** 营收趋势 */
export function revenueTrend(days = 30) {
  return get('/analytics/revenue-trend', { days })
}
