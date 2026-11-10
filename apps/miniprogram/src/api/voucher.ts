/** 代金券相关 API */
import { get, post } from '@/utils/request'

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

/** 兑换后的券：服务端额外返回 mode/targetPrice/redeemedAt */
export interface RedeemedVoucher extends VoucherItem {
  mode?: 'REDUCE_BY' | 'REDUCE_TO'
  targetPrice?: number | null
  redeemedAt?: string | null
}

export interface RedeemVoucherResult {
  /** true 表示之前已兑换过，本次为幂等返回 */
  replayed: boolean
  voucher: RedeemedVoucher
}

/** 兑换代金券：8 位券码，大小写与分隔符由服务端归一 */
export function redeemVoucher(code: string) {
  return post<RedeemVoucherResult>('/vouchers/redeem', { code })
}
