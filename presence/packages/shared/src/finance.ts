/**
 * 财务共享定义。
 *
 * 收入：各业务系统的口径统一抽到 RevenueRecord，按 月份 × 门店 × 数据源 存流水。
 * 支出分三类来路，互不重叠，任一项都不要在其他地方重复录入：
 * - 人工录入/导入：人力、美团推广、其他（ExpenseEntry）
 * - 按门店参数现算：房租（保底与提成取高）、物业费（固定）、管理费、培训费
 * - 由业务单据汇总：耗材成本（该门店向总部的采购单）
 */

/** 收入数据源 */
export type RevenueSourceKey = 'SELF' | 'ONSITE' | 'QINGLIAO' | 'MANUAL'

export type RevenueSourceStatus = 'CONNECTED' | 'PENDING' | 'MANUAL'

export const SOURCE_STATUS_META: Record<RevenueSourceStatus, { text: string; color: string }> = {
  CONNECTED: { text: '已打通', color: 'green' },
  PENDING: { text: '待打通', color: 'orange' },
  MANUAL: { text: '人工兼容', color: 'default' },
}

export type RevenueWay = 'AUTO' | 'IMPORT' | 'MANUAL'

export const REVENUE_WAY_NAMES: Record<RevenueWay, string> = {
  AUTO: '接口自动',
  IMPORT: '手工导入',
  MANUAL: '手工录入',
}

/**
 * 人工录入类支出科目。
 * 房租与物业费不在此列 —— 它们按门店租金参数现算（见 computeRent），
 * 若又开一个科目让人手工录，同一笔租金会被计两次。
 */
export type ExpenseCategory = 'LABOR' | 'MEITUAN' | 'OTHER'

export const EXPENSE_CATEGORY_NAMES: Record<ExpenseCategory, string> = {
  LABOR: '人力成本',
  MEITUAN: '美团推广费',
  OTHER: '其他支出',
}

export type ExpenseSource = 'MANUAL' | 'IMPORT'

export const EXPENSE_SOURCE_NAMES: Record<ExpenseSource, string> = {
  MANUAL: '手工录入',
  IMPORT: '批量导入',
}

export type ExpenseStatus = 'PENDING_APPROVAL' | 'EFFECTIVE' | 'REJECTED'

export const EXPENSE_STATUS_META: Record<ExpenseStatus, { text: string; color: string }> = {
  PENDING_APPROVAL: { text: '审批中', color: 'orange' },
  EFFECTIVE: { text: '已生效', color: 'green' },
  REJECTED: { text: '已驳回', color: 'red' },
}

/** 只有已生效的支出计入看板 */
export const EXPENSE_COUNTED_STATUS: ExpenseStatus[] = ['EFFECTIVE']

/** 房租本月按哪个口径取的 */
export type RentMode = 'BASE' | 'RATIO'

export const RENT_MODE_NAMES: Record<RentMode, string> = {
  BASE: '保底租金',
  RATIO: '提成租金',
}

export interface RentResult {
  /** 本月实际房租：保底与提成取高 */
  rent: number
  mode: RentMode
  /** 按营收算出的提成租金，用于告诉门店「还差多少才超保底」 */
  ratioRent: number
  baseRent: number
  /** 提成比例，单位 %（展示用） */
  ratePercent: number
}

/** 门店月度损益 */
export interface StoreProfit {
  orgId: string
  storeName: string
  revenue: number
  /** 收入按数据源拆分 */
  sources: { source: RevenueSourceKey; name: string; status: RevenueSourceStatus; amount: number }[]
  /** 房租：保底与提成取高，按门店参数现算 */
  rent: number
  rentMode: RentMode
  ratioRent: number
  baseRent: number
  rentRate: number
  /** 物业费：直接取门店设定的月固定额 */
  property: number
  labor: number
  meituan: number
  other: number
  /** 上缴总部管理费 */
  mgmtFee: number
  /** 比例，单位 %（展示用） */
  mgmtRate: number
  trainingFee: number
  trainingRate: number
  /** 向总部采购耗材的成本 */
  consumable: number
  totalExpense: number
  profit: number
  /** 净利率，单位 % */
  profitRate: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * 按收入与比例算上缴费用。
 * rate 传的是百分数（如 15 表示 15%），库里存的是小数（0.15），
 * 换算统一走 rateToPercent，避免两边理解不一致导致金额差 100 倍。
 */
export function feeOf(revenue: number, ratePercent: number): number {
  return round2((revenue * ratePercent) / 100)
}

/** 库里的小数比例（0.15）→ 展示用百分数（15） */
export function rateToPercent(rate: number | string | null | undefined): number {
  const n = Number(rate ?? 0)
  return Number.isFinite(n) ? round2(n * 100) : 0
}

/** 展示用百分数（15）→ 入库的小数比例（0.15） */
export function percentToRate(percent: number | string | null | undefined): number {
  const n = Number(percent ?? 0)
  return Number.isFinite(n) ? Math.round(n * 10000) / 1000000 : 0
}

/**
 * 房租：保底租金与提成租金取高。
 *
 * 商场链路的通行算法：每月按营业额×提成比例算一个数，与月保底租金相比，哪个高交哪个。
 * 两者相等时记作保底 —— 此时营收刚好够到保底线，说「超保底」不实。
 */
export function computeRent(input: {
  revenue: number
  baseRent: number
  /** 提成比例，传百分数（如 6 表示 6%） */
  ratePercent: number
}): RentResult {
  const baseRent = round2(Math.max(0, Number(input.baseRent) || 0))
  const ratePercent = Math.max(0, Number(input.ratePercent) || 0)
  const ratioRent = feeOf(Math.max(0, Number(input.revenue) || 0), ratePercent)
  const useRatio = ratioRent > baseRent
  return {
    rent: useRatio ? ratioRent : baseRent,
    mode: useRatio ? 'RATIO' : 'BASE',
    ratioRent,
    baseRent,
    ratePercent,
  }
}

/** 汇总一条门店损益，各项成本由调用方按口径查好后传入 */
export function buildStoreProfit(input: {
  orgId: string
  storeName: string
  revenue: number
  sources: StoreProfit['sources']
  /** 月保底租金 */
  baseRent: number
  /** 提成租金比例，百分数 */
  rentRatePercent: number
  /** 月物业费（固定） */
  propertyFee: number
  labor: number
  meituan: number
  other: number
  consumable: number
  mgmtRatePercent: number
  trainingRatePercent: number
}): StoreProfit {
  const mgmtFee = feeOf(input.revenue, input.mgmtRatePercent)
  const trainingFee = feeOf(input.revenue, input.trainingRatePercent)
  const rentResult = computeRent({
    revenue: input.revenue,
    baseRent: input.baseRent,
    ratePercent: input.rentRatePercent,
  })
  const property = round2(Math.max(0, Number(input.propertyFee) || 0))
  const totalExpense = round2(
    rentResult.rent +
      property +
      input.labor +
      input.meituan +
      input.other +
      mgmtFee +
      trainingFee +
      input.consumable,
  )
  const profit = round2(input.revenue - totalExpense)
  return {
    orgId: input.orgId,
    storeName: input.storeName,
    revenue: round2(input.revenue),
    sources: input.sources,
    rent: rentResult.rent,
    rentMode: rentResult.mode,
    ratioRent: rentResult.ratioRent,
    baseRent: rentResult.baseRent,
    rentRate: rentResult.ratePercent,
    property,
    labor: round2(input.labor),
    meituan: round2(input.meituan),
    other: round2(input.other),
    mgmtFee,
    mgmtRate: input.mgmtRatePercent,
    trainingFee,
    trainingRate: input.trainingRatePercent,
    consumable: round2(input.consumable),
    totalExpense,
    profit,
    profitRate: input.revenue ? round2((profit / input.revenue) * 100) : 0,
  }
}

/** 校验 yyyy-MM */
export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')
}

/** 当前月份 yyyy-MM */
export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** 往前推 n 个月的月份列表（含当月，由近及远） */
export function recentMonths(count = 6, now = new Date()): string[] {
  const list: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    list.push(currentMonth(d))
  }
  return list
}

/** 月份的起止时间，用于按创建时间过滤流水 */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number)
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) }
}
