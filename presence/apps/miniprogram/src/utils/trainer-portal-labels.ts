/**
 * 门户展示口径：课程阶段、日期、名单锁定等文案集中在这里。
 * 业务状态本身来自后端（phase / status / rosterUnlocked），前端只负责翻译与排版。
 */
import { tr } from '@/locale'

const PHASE_TEXT: Record<string, { zh: string; en: string }> = {
  ENROLL_UPCOMING: { zh: '待开售', en: 'Sale soon' },
  ENROLLING: { zh: '报名中', en: 'Enrolling' },
  LATE_ENROLLING: { zh: '即将开课·可报名', en: 'Starting soon · open' },
  ENROLL_CLOSED: { zh: '报名已截止', en: 'Enrollment closed' },
  STARTING: { zh: '即将开始', en: 'Starting' },
  ONGOING: { zh: '进行中', en: 'In progress' },
  ENDED: { zh: '已结束', en: 'Ended' },
  COMPLETED: { zh: '已完成', en: 'Completed' },
  EXPIRED: { zh: '已过期', en: 'Expired' },
  CANCELLED: { zh: '已取消', en: 'Cancelled' },
}

export function phaseText(phase: string) {
  const item = PHASE_TEXT[phase]
  if (!item) return phase
  return tr(item.zh, item.en)
}

/** 报名中/即将开课允许报名，用于卡片主色 */
export function phaseTone(phase: string) {
  if (phase === 'ENROLLING' || phase === 'LATE_ENROLLING') return 'live'
  if (phase === 'CANCELLED' || phase === 'EXPIRED') return 'muted'
  if (phase === 'COMPLETED' || phase === 'ENDED') return 'done'
  return 'neutral'
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 后端时间统一是 ISO 字符串，这里只做「本地时区」展示 */
export function formatDateTime(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDate(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatDay(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export const weekdayOf = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return tr(names[d.getDay()], en[d.getDay()])
}

/** 课程时间：单日课只显示日期，多日课显示区间 */
export function courseTimeRange(startAt: string, endAt: string) {
  const s = new Date(startAt)
  const e = new Date(endAt)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return ''
  const sameDay = s.toDateString() === e.toDateString()
  return sameDay ? formatDay(startAt) : `${formatDay(startAt)} – ${formatDay(endAt)}`
}

/** 名单解锁提示：后端给布尔值，前端只说人话 */
export function rosterHint(unlocked: boolean, startAt: string) {
  return unlocked
    ? tr('学员名单已开放，可提前联系学员', 'Roster is open — you can contact students in advance')
    : tr(`开课前 3 小时开放名单（${formatDateTime(new Date(new Date(startAt).getTime() - 3 * 3600 * 1000).toISOString())}）`, 'Roster opens 3 hours before the class starts')
}

/** 提案状态色，与共享常量保持一致 */
export function proposalStatusClass(status: string) {
  switch (status) {
    case 'DRAFT':
      return 's-draft'
    case 'SUBMITTED':
    case 'REVIEWING':
      return 's-review'
    case 'REJECTED':
      return 's-reject'
    case 'APPROVED':
    case 'PUBLISHED':
      return 's-done'
    default:
      return 's-draft'
  }
}

/** 只有草稿与被驳回可改，和后端 saveProposal 的规则一致 */
export const canEditProposal = (status: string) => status === 'DRAFT' || status === 'REJECTED'