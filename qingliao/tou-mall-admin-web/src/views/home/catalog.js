// 首页区块与快捷入口目录：首页渲染与「系统配置 · 首页配置」共用同一份键名，
// 后端 HomeConfigService.BLOCK_KEYS / LINK_KEYS 与此保持一致。

export const HOME_BLOCKS = [
  { key: 'kpiRevenue', label: '今日实际收入', desc: '收入指标卡，含与昨日对比', group: 'kpi' },
  { key: 'kpiOrders', label: '今日预约', desc: '预约单量指标卡', group: 'kpi' },
  { key: 'kpiCustomers', label: '今日到店客户', desc: '到店客户数指标卡', group: 'kpi' },
  { key: 'kpiPending', label: '待支付订单', desc: '待支付提醒指标卡', group: 'kpi' },
  { key: 'schedule', label: '今日服务安排', desc: '按预约时间排序的服务时间线', group: 'panel' },
  { key: 'todo', label: '待你处理', desc: '待你审批的事项', group: 'panel' },
  { key: 'quick', label: '快捷操作', desc: '常用入口，一步直达', group: 'panel' },
  { key: 'projects', label: '今日项目分布', desc: '按预约场次统计服务结构', group: 'panel' }
]

export const HOME_LINKS = [
  { key: 'board', label: '排班看板', path: '/appointment/board', icon: 'el-icon-date', tone: 'brand', perm: 'board' },
  { key: 'customer', label: '客户列表', path: '/crm/customer', icon: 'el-icon-user', tone: 'info', perm: 'customer' },
  { key: 'shiftCenter', label: '疗愈师排班', path: '/appointment/shift', icon: 'el-icon-time', tone: 'success', perm: 'shiftCenter:schedules' },
  { key: 'leave', label: '我的请假', path: '/appointment/shift?tab=leave', icon: 'el-icon-circle-close', tone: 'warning', perm: 'shiftCenter:leave' },
  { key: 'statisticsOverview', label: '经营流水', path: '/statistics/overview', icon: 'el-icon-data-line', tone: 'warning', perm: 'statisticsOverview:revenue' },
  { key: 'orderCenter', label: '订单列表', path: '/order/list', icon: 'el-icon-tickets', tone: 'info', perm: 'orderCenter:ordinary' },
  { key: 'product', label: '商品列表', path: '/system/product', icon: 'el-icon-goods', tone: 'success', perm: 'product' },
  { key: 'incentiveCenter', label: '接单奖励', path: '/salary/incentive', icon: 'el-icon-present', tone: 'brand', perm: 'incentiveCenter:board' },
  { key: 'salaryDetail', label: '劳务服务费明细', path: '/salary/detail', icon: 'el-icon-money', tone: 'info', perm: 'salaryDetail' },
  { key: 'todo', label: '待办中心', path: '/todo/index', icon: 'el-icon-bell', tone: 'brand', perm: '' }
]

// 未保存自定义方案时的默认预设：疗愈师不看经营收入，管理岗看全量
export const PRESET_THERAPIST = {
  blocks: ['kpiOrders', 'schedule', 'todo', 'quick'],
  links: ['board', 'shiftCenter', 'leave', 'incentiveCenter']
}

export const PRESET_MANAGER = {
  blocks: HOME_BLOCKS.map(item => item.key),
  links: ['board', 'customer', 'shiftCenter', 'statisticsOverview']
}

export function presetFor(isTherapist) {
  return isTherapist ? PRESET_THERAPIST : PRESET_MANAGER
}