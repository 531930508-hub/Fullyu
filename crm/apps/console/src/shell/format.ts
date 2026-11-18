/** 展示层格式化：口径必须与旧后台一致，否则同一张流水两边显示不同。 */

const BUSINESS_LABEL: Record<string, string> = {
  sx: '时叙',
  ql: '轻疗',
  zc: '在场',
  teahour: '时叙',
  retreat: '轻疗',
  presence: '在场',
  hq: '总部'
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: '生效中',
  CURRENT: '当前',
  APPLIED: '已执行',
  DELIVERED: '已投递',
  COLLECTED: '已交付',
  PENDING: '待处理',
  PENDING_APPROVAL: '待审批',
  PAUSED: '已暂停',
  NEW: '未读',
  ISSUED: '待核销',
  CLAIMED: '已领取',
  REDEEMED: '已核销',
  PUBLISHED: '已发布',
  READ: '已读',
  VOID: '已作废',
  SCHEDULED: '待生效',
  DRAFT: '草稿',
  EXPIRING: '即将到期',
  FAILED: '失败',
  EXPIRED: '已过期',
  REFUNDED: '已退款',
  REJECTED: '已驳回',
  CANCELED: '已撤销',
  ARCHIVED: '已归档',
  IGNORED: '已忽略',
  RETIRED: '已下架'
}

type Tone = 'green' | 'amber' | 'red' | ''

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'green',
  CURRENT: 'green',
  APPLIED: 'green',
  DELIVERED: 'green',
  COLLECTED: 'green',
  PENDING: 'amber',
  PENDING_APPROVAL: 'amber',
  PAUSED: 'amber',
  NEW: 'amber',
  ISSUED: 'amber',
  CLAIMED: 'green',
  REDEEMED: 'green',
  PUBLISHED: 'green',
  READ: '',
  VOID: 'red',
  SCHEDULED: 'amber',
  DRAFT: 'amber',
  EXPIRING: 'amber',
  FAILED: 'red',
  EXPIRED: 'red',
  REFUNDED: 'red',
  REJECTED: 'red',
  CANCELED: 'red',
  ARCHIVED: '',
  IGNORED: ''
}

export const LEDGER_TYPE_LABEL: Record<string, string> = {
  EARN: '获得',
  CONSUME: '消耗',
  REFUND: '退回',
  REVOKE: '撤销',
  EXPIRE: '到期',
  ADJUST: '调整',
  MIGRATE: '迁移'
}

export const LEDGER_TYPE_TONE: Record<string, Tone> = {
  EARN: 'green',
  REFUND: 'green',
  ADJUST: 'amber',
  REVOKE: 'red',
  EXPIRE: 'red'
}

export function bizLabel(value?: string | null): string {
  if (!value) return '—'
  return BUSINESS_LABEL[value] || value
}

export function statusLabel(status?: string | null): string {
  if (!status) return '—'
  return STATUS_LABEL[status] || status
}

export function statusTone(status?: string | null): Tone {
  if (!status) return ''
  return STATUS_TONE[status] ?? ''
}

/** Tone → Ant Design Tag 颜色 */
export function tagColor(tone: Tone): string {
  if (tone === 'green') return 'success'
  if (tone === 'amber') return 'warning'
  if (tone === 'red') return 'error'
  return 'default'
}

export function money(cents?: number | null): string {
  return `¥${((Number(cents) || 0) / 100).toFixed(2)}`
}

/** 上海时区展示；与旧后台一样把斜杠换成短横。 */
export function fmt(value?: string | number | null, withTime = true): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date
    .toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
    })
    .replace(/\//g, '-')
}

/**
 * 同步滞后阈值：滞后 = 距该端最近一次签名调用。
 * 12 小时内算正常（夜间闭店不调用是常态），超过 48 小时基本可判定接入断了。
 */
export const LAG_WARN_SECONDS = 12 * 60 * 60
export const LAG_ERROR_SECONDS = 48 * 60 * 60

export function fmtLag(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  const value = Math.max(0, Math.floor(seconds))
  if (value < 60) return `${value} 秒`
  if (value < 3600) return `${Math.floor(value / 60)} 分钟`
  if (value < 86400) return `${Math.floor(value / 3600)} 小时`
  return `${Math.floor(value / 86400)} 天`
}

export function lagColor(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return 'default'
  if (seconds >= LAG_ERROR_SECONDS) return 'error'
  if (seconds >= LAG_WARN_SECONDS) return 'warning'
  return 'success'
}

/** 上海时区的 YYYY-MM */
export function shanghaiMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}`
}
