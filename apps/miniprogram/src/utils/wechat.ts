/**
 * 微信小程序原生能力封装：登录、支付、订阅消息
 */
import type { JsapiPayParams } from '@/api/payment'
import { createJsapiPayment } from '@/api/payment'

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
    uni.requestSubscribeMessage({
      tmplIds,
      success: (res) => resolve(res as unknown as Record<string, string>),
      // 用户拒绝授权不阻断主流程
      fail: () => resolve({}),
    })
  })
}

/**
 * 统一支付流程：创建 JSAPI 支付 → 调起微信支付
 * @param orderId 待支付订单 id
 */
export async function payOrder(orderId: string): Promise<void> {
  const params = await createJsapiPayment(orderId)
  await requestPayment(params)
}
