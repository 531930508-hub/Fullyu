/** 支付相关 API */
import { post } from '@/utils/request'

/** 微信小程序调起支付参数 */
export interface JsapiPayParams {
  appId?: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA' | 'MD5' | 'HMAC-SHA256'
  paySign: string
}

/** 创建 JSAPI 支付，返回小程序调起参数 */
export function createJsapiPayment(orderId: string) {
  return post<JsapiPayParams>(`/payment/jsapi/${orderId}`)
}
