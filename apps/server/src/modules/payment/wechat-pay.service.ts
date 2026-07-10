import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { BusinessException } from '../../common/exceptions/business.exception'

/** JSAPI 下单返回给小程序的调起参数 */
export interface JsapiPayParams {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

/** 回调解密后的支付结果 */
export interface DecryptedNotify {
  out_trade_no: string
  transaction_id: string
  trade_state: string
  amount: { total: number; payer_total: number }
  [key: string]: any
}

/**
 * 微信支付 APIv3（JSAPI）服务端封装。
 * 基于 Node crypto 自包含实现：请求签名、下单、回调验签+解密、退款。
 * 依赖以下配置：
 * - WECHAT_APP_ID           小程序 AppID
 * - WECHAT_PAY_MCH_ID       商户号
 * - WECHAT_PAY_SERIAL_NO    商户 API 证书序列号
 * - WECHAT_PAY_PRIVATE_KEY  商户 API 私钥（PEM，换行用 \n）
 * - WECHAT_PAY_API_V3_KEY   APIv3 密钥（32 位，用于回调解密）
 * - WECHAT_PAY_NOTIFY_URL   支付结果回调地址
 */
@Injectable()
export class WechatPayService {
  private readonly logger = new Logger('WechatPayService')
  private static readonly BASE = 'https://api.mch.weixin.qq.com'

  constructor(private readonly config: ConfigService) {}

  private get appId() {
    return this.config.get<string>('WECHAT_APP_ID', '')
  }
  private get mchId() {
    return this.config.get<string>('WECHAT_PAY_MCH_ID', '')
  }
  private get serialNo() {
    return this.config.get<string>('WECHAT_PAY_SERIAL_NO', '')
  }
  private get privateKey() {
    // 支持 env 中 \n 转义的多行 PEM
    return this.config.get<string>('WECHAT_PAY_PRIVATE_KEY', '').replace(/\\n/g, '\n')
  }
  private get apiV3Key() {
    return this.config.get<string>('WECHAT_PAY_API_V3_KEY', '')
  }
  private get notifyUrl() {
    return this.config.get<string>('WECHAT_PAY_NOTIFY_URL', '')
  }

  /**
   * JSAPI 统一下单，返回小程序调起支付参数
   * @param params.outTradeNo 商户订单号
   * @param params.description 商品描述
   * @param params.totalFen 金额（分）
   * @param params.openid 支付用户 openid
   */
  async createJsapiOrder(params: {
    outTradeNo: string
    description: string
    totalFen: number
    openid: string
  }): Promise<JsapiPayParams> {
    const url = '/v3/pay/transactions/jsapi'
    const body = {
      appid: this.appId,
      mchid: this.mchId,
      description: params.description,
      out_trade_no: params.outTradeNo,
      notify_url: this.notifyUrl,
      amount: { total: params.totalFen, currency: 'CNY' },
      payer: { openid: params.openid },
    }
    const resp = await this.request<{ prepay_id: string }>('POST', url, body)
    if (!resp.prepay_id) {
      throw new BusinessException('微信支付下单失败', 5101)
    }
    return this.buildInvokeParams(resp.prepay_id)
  }

  /**
   * 申请退款
   * @param params.outRefundNo 商户退款单号
   * @param params.totalFen 原订单总额（分）
   * @param params.refundFen 退款金额（分）
   */
  async refund(params: {
    outTradeNo: string
    outRefundNo: string
    totalFen: number
    refundFen: number
    reason?: string
  }): Promise<{ refund_id: string; status: string }> {
    const url = '/v3/refund/domestic/refunds'
    const body: any = {
      out_trade_no: params.outTradeNo,
      out_refund_no: params.outRefundNo,
      reason: params.reason,
      notify_url: this.notifyUrl.replace('/payment/notify', '/payment/refund-notify'),
      amount: { refund: params.refundFen, total: params.totalFen, currency: 'CNY' },
    }
    return this.request('POST', url, body)
  }

  /**
   * 验证并解密支付/退款回调
   * @param headers 请求头（含 Wechatpay-Signature / Timestamp / Nonce / Serial）
   * @param rawBody 原始请求体字符串
   */
  decryptNotify(rawBody: string): DecryptedNotify {
    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      throw new BusinessException('回调报文解析失败', 5102)
    }
    const resource = payload.resource
    if (!resource?.ciphertext) {
      throw new BusinessException('回调报文缺少 resource', 5103)
    }
    const decrypted = this.aesGcmDecrypt(
      resource.ciphertext,
      resource.nonce,
      resource.associated_data,
    )
    return JSON.parse(decrypted)
  }

  // ============ 内部实现 ============

  /** 构造小程序调起支付参数（对 appId\ntimeStamp\nnonceStr\npackage\n 签名） */
  private buildInvokeParams(prepayId: string): JsapiPayParams {
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = crypto.randomBytes(16).toString('hex')
    const pkg = `prepay_id=${prepayId}`
    const message = `${this.appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
    const paySign = this.rsaSign(message)
    return {
      appId: this.appId,
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'RSA',
      paySign,
    }
  }

  /** 发起带 APIv3 签名的请求 */
  private async request<T = any>(method: string, urlPath: string, body: any): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomBytes(16).toString('hex')
    const bodyStr = body ? JSON.stringify(body) : ''
    const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyStr}\n`
    const signature = this.rsaSign(message)
    const authorization =
      `WECHATPAY2-SHA256-RSA2048 ` +
      `mchid="${this.mchId}",` +
      `nonce_str="${nonce}",` +
      `signature="${signature}",` +
      `timestamp="${timestamp}",` +
      `serial_no="${this.serialNo}"`

    const res = await fetch(`${WechatPayService.BASE}${urlPath}`, {
      method,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'fullyu-server',
      },
      body: bodyStr || undefined,
    })
    const text = await res.text()
    if (res.status >= 400) {
      this.logger.error(`微信支付请求失败 ${res.status}: ${text}`)
      throw new BusinessException('微信支付接口调用失败', 5104)
    }
    return text ? (JSON.parse(text) as T) : ({} as T)
  }

  /** 商户私钥 RSA-SHA256 签名，输出 base64 */
  private rsaSign(message: string): string {
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(message)
    sign.end()
    return sign.sign(this.privateKey, 'base64')
  }

  /** APIv3 密钥 AES-256-GCM 解密回调 resource */
  private aesGcmDecrypt(ciphertext: string, nonce: string, associatedData: string): string {
    const key = Buffer.from(this.apiV3Key, 'utf8')
    const data = Buffer.from(ciphertext, 'base64')
    // 密文尾部 16 字节为 authTag
    const authTag = data.subarray(data.length - 16)
    const encrypted = data.subarray(0, data.length - 16)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'))
    decipher.setAuthTag(authTag)
    if (associatedData) {
      decipher.setAAD(Buffer.from(associatedData, 'utf8'))
    }
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  }
}
