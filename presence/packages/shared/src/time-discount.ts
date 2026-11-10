/**
 * 会员卡分时段折扣共享定义。
 *
 * 门店按忙闲时段差异化定价：峰值时段取消折扣甚至加价、闲时深折引流。
 * 命中判定放在这里，保证后端下单锁价与后台"一周总览预览"算出同一个答案
 * （同审批流引擎 pickFlowRule 的模式）。
 */

/** 折扣动作类型（与 Prisma TimeDiscountActionType 对齐） */
export type TimeDiscountActionType = 'PERCENT' | 'FIXED_BY_DURATION'

export const TIME_DISCOUNT_ACTION_META: Record<TimeDiscountActionType, { text: string; desc: string }> = {
  PERCENT: { text: '百分比折扣', desc: '50–200；100=原价，<100 打折，>100 峰时加价' },
  FIXED_BY_DURATION: { text: '按时长固定价', desc: '按服务时长分钟数取固定价（如 30 分钟 = 133 元）' },
}

/** 一天内时间段，"HH:mm"，含头不含尾，start < end（不支持跨午夜） */
export interface TimeDiscountRange {
  start: string
  end: string
}

/** 时长固定价条目；price 单位：元（与全系统运行时 Number 元口径一致） */
export interface TimeDiscountFixedPrice {
  minutes: number
  price: number
}

export interface TimeDiscountRuleLike {
  id: string
  name?: string
  /** 适用门店 id；空数组 = 全部门店（兜底，新店自动继承） */
  orgIds: string[]
  /** 适用卡类型；空数组 = 全部卡类型 */
  cardTypes: string[]
  /** 越小越优先（同特异性分组内） */
  priority: number
  /** 1=周一 … 7=周日；空数组 = 不限 */
  weekdays: number[]
  /** 空数组 = 全天 */
  timeRanges: TimeDiscountRange[]
  /** 生效日期范围（含两端，按自然日）；null = 不限 */
  validFrom: string | Date | null
  validTo: string | Date | null
  actionType: TimeDiscountActionType
  /** PERCENT 时必填，50–200 */
  discountPercent: number | null
  /** FIXED_BY_DURATION 时必填 */
  fixedPrices: TimeDiscountFixedPrice[] | null
  enabled: boolean
}

export interface TimeDiscountHit {
  ruleId: string
  ruleName: string
  actionType: TimeDiscountActionType
  discountPercent: number | null
  /** 单位：元 */
  fixedPrice: number | null
}

export interface TimeDiscountContext {
  /** 订单归属门店；null（场地未挂门店）时只能命中全局规则 */
  orgId: string | null
  /** 用户当前有效会员卡类型 */
  cardType: string
  /** 本单预约开始时间（判定口径） */
  appointmentStart: Date
  /** 本单服务时长（分钟）；null 时 FIXED_BY_DURATION 规则无法命中 */
  durationMinutes: number | null
}

/** "HH:mm" → 当日分钟数；非法格式返回 null */
export function parseHHmm(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

/** Date → 1=周一 … 7=周日（JS getDay 0=周日 转换） */
export function weekdayOf(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

/**
 * 日期字面量比较值 YYYYMMDD。
 * 字符串（含 Prisma 返回的 ISO 串）直接取前 10 位日期字面量，避免 UTC/本地时区偏移；
 * Date 对象按本地时区取年月日（部署时区 Asia/Shanghai，UTC 午夜 = 当地同日 08:00，无跨日问题）。
 */
function toDateKey(v: string | Date): number {
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
    if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])
  }
  const d = v instanceof Date ? v : new Date(v)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** 规则排序：显式门店在前（特异性高），组内 priority 升序 */
export function sortTimeDiscountRules(rules: TimeDiscountRuleLike[]): TimeDiscountRuleLike[] {
  return [...rules].sort((a, b) => {
    const sa = a.orgIds.length > 0 ? 0 : 1
    const sb = b.orgIds.length > 0 ? 0 : 1
    if (sa !== sb) return sa - sb
    return a.priority - b.priority
  })
}

/**
 * 匹配时段折扣规则；全部未命中返回 null（调用方回退课程固定折扣 → 原价）。
 * FIXED_BY_DURATION 规则在服务时长未知或价目表不含该时长时视为未命中，继续匹配下一条。
 */
export function pickTimeDiscountRule(
  rules: TimeDiscountRuleLike[],
  ctx: TimeDiscountContext,
): TimeDiscountHit | null {
  const start = ctx.appointmentStart
  const dayKey = toDateKey(start)
  const wd = weekdayOf(start)
  const minuteOfDay = start.getHours() * 60 + start.getMinutes()

  for (const r of sortTimeDiscountRules(rules)) {
    if (!r.enabled) continue
    if (r.orgIds.length > 0 && (ctx.orgId == null || !r.orgIds.includes(ctx.orgId))) continue
    if (r.cardTypes.length > 0 && !r.cardTypes.includes(ctx.cardType)) continue
    if (r.validFrom != null && dayKey < toDateKey(r.validFrom)) continue
    if (r.validTo != null && dayKey > toDateKey(r.validTo)) continue
    if (r.weekdays.length > 0 && !r.weekdays.includes(wd)) continue
    if (r.timeRanges.length > 0) {
      const inRange = r.timeRanges.some((tr) => {
        const s = parseHHmm(tr.start)
        const e = parseHHmm(tr.end)
        return s != null && e != null && s < e && minuteOfDay >= s && minuteOfDay < e
      })
      if (!inRange) continue
    }
    if (r.actionType === 'PERCENT') {
      if (r.discountPercent == null) continue
      return {
        ruleId: r.id,
        ruleName: r.name ?? '',
        actionType: 'PERCENT',
        discountPercent: r.discountPercent,
        fixedPrice: null,
      }
    }
    if (ctx.durationMinutes == null || !r.fixedPrices) continue
    const fp = r.fixedPrices.find((p) => p.minutes === ctx.durationMinutes)
    if (!fp) continue
    return {
      ruleId: r.id,
      ruleName: r.name ?? '',
      actionType: 'FIXED_BY_DURATION',
      discountPercent: null,
      fixedPrice: fp.price,
    }
  }
  return null
}
