/**
 * 微信小程序原生能力封装：登录、支付、订阅消息
 */
import type { JsapiPayParams } from '@/api/payment'
import { createJsapiPayment, getPaymentStatus } from '@/api/payment'

/** uni.login 获取临时登录凭证 code */
export function wxLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (res) => {
        if (res.code) resolve(res.code)
        else reject(new Error('获取登录凭证失败'))
      },
      fail: (err) => reject(err),
    })
  })
}

/** 调起微信支付 */
export function requestPayment(params: JsapiPayParams): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.requestPayment({
      provider: 'wxpay',
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign,
      success: () => resolve(),
      fail: (err) => reject(err),
    })
  })
}

/**
 * 请求订阅消息授权（开课提醒 / 候补递补 / 支付成功等）
 * @param tmplIds 订阅消息模板 id 列表
 */
export function requestSubscribeMessage(tmplIds: string[]): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    if (!tmplIds || tmplIds.length === 0) {
      resolve({})
      return
    }
    // H5 等非微信环境无此 API：静默跳过，不影响主流程
    if (typeof uni.requestSubscribeMessage !== 'function') {
      resolve({})
      return
    }
    try {
      uni.requestSubscribeMessage({
        tmplIds,
        success: (res: unknown) => resolve(res as Record<string, string>),
        // 用户拒绝授权不阻断主流程
        fail: () => resolve({}),
      })
    } catch {
      resolve({})
    }
  })
}

/**
 * 统一支付流程：创建 JSAPI 支付 → 调起微信支付
 * @param orderId 待支付订单 id
 */
export async function payOrder(orderId: string): Promise<void> {
  const params = await createJsapiPayment(orderId)
  // 积分/代金券全额抵扣：服务端已直接完成支付，返回体不带支付签名，无需调起微信收银台
  if (!('paySign' in params)) return
  await requestPayment(params)
}

/** 视为「已付款」的订单状态（含支付后进入退款流程的订单） */
const PAID_ORDER_STATUSES = ['PAID', 'COMPLETED', 'REFUNDING', 'REFUNDED', 'CONVERTED']

/**
 * 以服务端订单状态为准确认支付结果。
 * 微信 requestPayment 回调可能因切后台、网络抖动丢失，或支付回调落库略晚于客户端，
 * 此时不能直接提示「支付未完成」，需先核对订单状态。
 */
export async function isOrderPaid(orderId: string): Promise<boolean> {
  try {
    const { status } = await getPaymentStatus(orderId)
    return PAID_ORDER_STATUSES.includes(status)
  } catch {
    return false
  }
}
