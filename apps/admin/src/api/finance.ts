import { get, post, put, del } from './request'
import type {
  ExpenseCategory,
  ExpenseSource,
  ExpenseStatus,
  RevenueSourceKey,
  RevenueSourceStatus,
  RevenueWay,
  StoreProfit,
} from '@fullyu/shared'

export interface RevenueSource {
  key: RevenueSourceKey
  name: string
  intro: string
  status: RevenueSourceStatus
  /** 抽数方式说明 */
  mode: string
  /** 同步频率说明 */
  cron: string
  lastSyncAt: string | null
  note: string
  sortOrder: number
}

export interface RevenueRecord {
  id: string
  month: string
  orgId: string
  orgName: string
  source: RevenueSourceKey
  amount: number
  orderCount: number
  way: RevenueWay
  remark: string
  syncAt: string
}

export interface ExpenseEntry {
  id: string
  orgId: string
  orgName: string
  month: string
  category: ExpenseCategory
  name: string
  amount: number
  source: ExpenseSource
  remark: string
  status: ExpenseStatus
  approvalId: string | null
  flowName: string
  createdBy: string
  createdByName: string
  createdAt: string
}

export interface DashboardTotal {
  revenue: number
  /** 房租：保底与提成取高后的现算值 */
  rent: number
  /** 物业费：门店设定的月固定额 */
  property: number
  labor: number
  meituan: number
  other: number
  mgmtFee: number
  trainingFee: number
  consumable: number
  totalExpense: number
  profit: number
  profitRate: number
  storeCount: number
}

export interface FinanceDashboard {
  month: string
  /** 无 finance:dashboard:profit 权限时为 false，成本与利润列全为 0 */
  profitVisible: boolean
  sourceMeta: {
    key: RevenueSourceKey
    name: string
    status: RevenueSourceStatus
    statusText: string
  }[]
  stores: StoreProfit[]
  total: DashboardTotal
}

// ===== 收入 =====

export function listRevenueSources() {
  return get<RevenueSource[]>('/finance/revenue/sources')
}

/** 手动触发抽取。只有已打通的源可用，其余会返回明确的失败原因 */
export function syncRevenueSource(key: RevenueSourceKey, month?: string) {
  return post<{
    month: string
    source: RevenueSourceKey
    orgCount: number
    orderCount: number
    skipped: number
    amount: number
  }>(`/finance/revenue/sources/${key}/sync`, { month })
}

export function listRevenueRecords(params?: {
  month?: string
  orgId?: string
  source?: RevenueSourceKey
}) {
  return get<RevenueRecord[]>('/finance/revenue/records', params)
}

export function createRevenueRecords(
  body:
    | { month: string; orgId: string; source: RevenueSourceKey; amount: number; orderCount?: number; remark?: string }
    | { month: string; orgId: string; source: RevenueSourceKey; amount: number; orderCount?: number; remark?: string }[],
) {
  return post<{ created: number }>('/finance/revenue/records', body)
}

export function removeRevenueRecord(id: string) {
  return del(`/finance/revenue/records/${id}`)
}

// ===== 支出 =====

export interface ExpensePayload {
  orgId: string
  month: string
  category: ExpenseCategory
  name?: string
  amount: number
  remark?: string
}

export function listExpenses(params?: {
  month?: string
  orgId?: string
  category?: ExpenseCategory
  status?: ExpenseStatus
}) {
  return get<ExpenseEntry[]>('/finance/expenses', params)
}

export function createExpense(body: ExpensePayload) {
  return post<ExpenseEntry>('/finance/expenses', body)
}

/** 批量导入直接生效，不走审批 */
export function importExpenses(items: ExpensePayload[]) {
  return post<{ created: number }>('/finance/expenses/import', { items })
}

export function updateExpense(id: string, body: ExpensePayload) {
  return put<ExpenseEntry>(`/finance/expenses/${id}`, body)
}

export function removeExpense(id: string) {
  return del(`/finance/expenses/${id}`)
}

// ===== 看板 =====

export function getDashboard(month?: string) {
  return get<FinanceDashboard>('/finance/dashboard', month ? { month } : undefined)
}

/** 近几月经营趋势，口径与月度损益表一致 */
export interface TrendPoint {
  month: string
  revenue: number
  totalExpense: number
  profit: number
  /** 净利率，单位 % */
  profitRate: number
}

export function getDashboardTrend(params?: { count?: number; orgId?: string }) {
  return get<TrendPoint[]>('/finance/dashboard/trend', params)
}
