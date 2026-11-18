/** CRM 模块的接口契约。字段名与 crm/apps/server 的返回体一一对应，不要自行改名。 */
import { api } from '@/shell/api'
import type { CrmSession } from '@/shell/session'

export interface MemberIdentity {
  business: string
  localUserId?: string
}

export interface MemberRow {
  id: string
  memberNo: string
  name: string
  phone: string
  gender?: string | null
  birthday?: string | null
  status: string
  balance: number
  identities: MemberIdentity[]
}

export interface LedgerRow {
  id: string
  memberId: string
  memberNo: string
  memberName: string
  phone: string
  type: string
  delta: number
  balanceAfter: number
  business: string
  ref: string | null
  note: string | null
  operatorName?: string | null
  createdAt: string
}

export interface LedgerQuery {
  q?: string
  type?: string
  business?: string
  ref?: string
  from?: string
  to?: string
  page?: number
  size?: number
}

export interface LedgerResult {
  rows: LedgerRow[]
  page: number
  size: number
  total: number
  summary: { count: number; plus: number; minus: number }
}

export interface SyncBusinessRow {
  business: string
  lastSeenAt: string | null
  lastPath: string
  lagSeconds: number | null
  webhookConfigured: boolean
  deliveredCount: number
  pending: number
  failed: number
}

export interface SyncStatus {
  businesses: SyncBusinessRow[]
  pending: number
  failed: number
  delivery: { enabled: boolean; intervalMs: number }
}

export interface AdjustmentRow {
  id: string
  status: string
}

export interface PrizeRow {
  id: string
  status: string
}

export interface MonthlyReport {
  cards: {
    total: { count: number; grossCents: number }
  }
}

export const crmApi = {
  login: (username: string, password: string) =>
    api.post<CrmSession>('/auth/login', { username, password }),

  members: (params: { q?: string; business?: string }) =>
    api.get<{ members: MemberRow[] }>('/members', params).then((data) => data.members),

  /** 会员详情页尚未迁移，这里只取列表所需字段 */
  ledger: (query: LedgerQuery) => api.get<LedgerResult>('/points/ledger', query),

  syncStatus: () => api.get<SyncStatus>('/sync/status'),

  adjustments: () => api.get<AdjustmentRow[]>('/adjustments'),

  pendingPrizes: () => api.get<{ prizes: PrizeRow[] }>('/game/prizes', { status: 'PENDING' }),

  monthlyReport: (month: string) => api.get<MonthlyReport>('/reports/monthly', { month })
}
