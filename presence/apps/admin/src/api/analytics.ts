import { get } from './request'

/** 仪表盘概览 */
export function overview() {
  return get('/analytics/overview')
}

/**
 * 首页工作台。后端按调用人权限逐块裁剪，只要登录就不会 403，
 * 返回体里的 blocks 告诉前端哪些块该渲染。
 */
export function workbench(date?: string) {
  return get('/analytics/workbench', date ? { date } : {})
}

/** 营收趋势 */
export function revenueTrend(days = 30) {
  return get('/analytics/revenue-trend', { days })
}

/** 扩展图表（课程热度/导师评分/用户增长/会员分布） */
export function charts() {
  return get('/analytics/charts')
}
