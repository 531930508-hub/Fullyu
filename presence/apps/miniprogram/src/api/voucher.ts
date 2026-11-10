/** 代金券相关 API */
import { get } from '@/utils/request'

export interface VoucherItem {
  id: string
  amount: number
  applicableCourseIds: string[]
  applicableAll: boolean
  expiresAt: string
  status: string
  source: string
  usedAt?: string | null
  createdAt: string
}

/** 我的代金券（usable=true 只返回可用券） */
export function listMyVouchers(usable?: boolean) {
  return get<VoucherItem[]>('/vouchers/mine', usable ? { usable: 'true' } : undefined)
}
