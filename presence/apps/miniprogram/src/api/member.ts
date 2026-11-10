/** 会员卡相关 API */
import { get, post } from '@/utils/request'

export interface MemberCardProduct {
  id: string
  type: string
  name: string
  price: number
  durationDays: number
  description?: string
  benefits: string[]
  status: string
  sort: number
}

export interface MemberCard {
  id: string
  type: string
  expiresAt: string
  status: string
  createdAt: string
  product?: any
}

export interface PurchaseResult {
  orderId: string
  actualPaid: number
  expireInSeconds?: number
}

/** 会员卡商品列表（公开需登录态因后端挂 JWT，但可无卡展示） */
export function listMemberProducts() {
  // silent：后端未启动时静默降级，页面保留默认卡展示
  return get<MemberCardProduct[]>('/member/products', undefined, { silent: true })
}

/** 我的会员卡 */
export function listMyCards() {
  return get<MemberCard[]>('/member/cards')
}

/** 我的当前有效会员卡 */
export function getActiveCard() {
  return get<MemberCard | null>('/member/active', undefined, { silent: true })
}

/** 购买 / 续费会员卡（首次开卡需传个人照片 photo，base64） */
export function purchaseMember(productId: string, photo?: string) {
  return post<PurchaseResult>('/member/purchase', { productId, photo })
}
