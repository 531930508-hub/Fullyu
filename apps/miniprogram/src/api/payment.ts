/** 支付相关 API */
import { get, post } from '@/utils/request'

/** 微信小程序调起支付参数 */
export interface JsapiPayParams {
  appId?: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA' | 'MD5' | 'HMAC-SHA256'
  paySign: string
}

/** 订单支付状态（以服务端订单状态为准，不依赖微信端回调） */
export interface PaymentStatus {
  orderId: string
  status: string
  refundAmount: number
}

/** 0 元订单（积分/券全额抵扣）无需调起收银台，由服务端直接完成支付 */
export interface ZeroAmountPayResult {
  zeroAmount: true
  orderId: string
}

/** 创建 JSAPI 支付，返回小程序调起参数 */
export function createJsapiPayment(orderId: string) {
  return post<JsapiPayParams | ZeroAmountPayResult>(`/payment/jsapi/${orderId}`)
}

/** 查询本人订单支付结果 */
export function getPaymentStatus(orderId: string) {
  return get<PaymentStatus>(`/payment/status/${orderId}`)
}
