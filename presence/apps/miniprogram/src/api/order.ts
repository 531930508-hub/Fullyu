/** 订单相关 API */
import { get, post } from '@/utils/request'

export interface EnrollQuote {
  courseId: string
  position: number
  basePrice: number
  memberCardType?: string | null
  discountPercent: number
  discountAmount: number
  priceAfterDiscount: number
  allowDeduction: boolean
  pointsBalance: number
  maxPointsDeduction: number
  vouchers: Array<{ id: string; amount: number; expiresAt: string }>
  remaining: number
  isFull: boolean
  phase?: string
  phaseLabel?: string
  bookable?: boolean
  enrollDeadline?: string | null
}

export interface EnrollResult {
  orderId: string
  actualPaid: number
  expireInSeconds: number
}

export interface OrderItem {
  id: string
  orderNo: string
  orderType: string
  courseId?: string
  courseName?: string
  originalPrice: number
  discountAmount: number
  pointsDeduction: number
  voucherDeduction: number
  actualPaid: number
  status: string
  createdAt: string
  /** 待支付订单的支付截止时间（服务端按席位锁定计算），非待支付为 null */
  expireAt?: string | null
  course?: any
}

/** 报名询价 */
export function quoteEnroll(courseId: string) {
  return get<EnrollQuote>(`/orders/quote/${courseId}`)
}

/** 报名询价（静默预览，不占位、不打扰用户） */
export function previewEnrollQuote(courseId: string) {
  return get<EnrollQuote>(`/orders/quote/${courseId}`, undefined, { silent: true })
}

/** 报名下单（锁价 + 生成待支付订单） */
export function enrollCourse(courseId: string, body: { usePoints?: number; voucherId?: string } = {}) {
  return post<EnrollResult>(`/orders/enroll/${courseId}`, body)
}

/** 我的订单列表 */
export function listMyOrders(status?: string) {
  return get<OrderItem[]>('/orders', status ? { status } : undefined)
}

/** 首页下一场已支付课程（轻量查询，不拉取全部订单） */
export function fetchNextCourse() {
  return get<OrderItem | null>('/orders/next-course')
}

/** 取消订单 */
export function cancelOrder(id: string, reason: string) {
  return post(`/orders/${id}/cancel`, { reason })
}

/** 自助取消前的退款金额预览：fullRefund=false 时前端需明确提示可退金额 */
export function previewOrderRefund(id: string) {
  return get<{ fullRefund: boolean; refundFen: number; totalFen: number; percent: number }>(`/orders/${id}/refund-preview`, undefined, { silent: true })
}
