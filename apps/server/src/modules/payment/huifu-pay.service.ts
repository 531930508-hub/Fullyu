import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { BusinessException } from '../../common/exceptions/business.exception'
import type { JsapiPayParams, DecryptedNotify } from './wechat-pay.service'

export type { JsapiPayParams, DecryptedNotify }

/**
 * 汇付斗拱（BsPay）聚合支付服务端封装。
 * 接口契约依据官方 dg-payment-skills（聚合支付 v4）：
 * - 下单   POST /v4/trade/payment/create（trade_type=T_MINIAPP，返回 pay_info 即微信调起五件套）
 * - 退款   POST /v4/trade/payment/scanpay/refund（按 org_req_date + org_hf_seq_id 定位原交易）
 * - 回调   form 提交 resp_data + sign，用汇付 RSA 公钥对 resp_data 原文验签（不重排序）
 * - 回包   HTTP 200 + 文本 `RECV_ORD_ID_${req_seq_id}`
 * 签名规则（shared-signing-v2）：仅对 data 第一层字段按 ASCII 排序后的 JSON 做 SHA256withRSA。
 *
 * 依赖以下配置：
 * - HUIFU_SYS_ID           系统号（渠道商/商户 huifu_id）
 * - HUIFU_PRODUCT_ID       产品号
 * - HUIFU_HUIFU_ID         商户号（缺省时取 HUIFU_SYS_ID）
 * - HUIFU_RSA_PRIVATE_KEY  商户 RSA 私钥（PEM 或裸 base64，换行可用 \n）
 * - HUIFU_RSA_PUBLIC_KEY   汇付 RSA 公钥（同上）
 * - HUIFU_NOTIFY_URL       支付结果回调地址（退款回调自动替换为 /payment/refund-notify）
 * - HUIFU_API_BASE         网关地址，默认生产 https://api.huifu.com
 * - WECHAT_APP_ID          小程序 AppID（作为 sub_appid 上送）
 */
@Injectable()
export class HuifuPayService {
  private readonly logger = new Logger('HuifuPayService')

  constructor(private readonly config: ConfigService) {}

  private get base() {
    return this.config.get<string>('HUIFU_API_BASE', 'https://api.huifu.com')
  }
  private get sysId() {
    return this.config.get<string>('HUIFU_SYS_ID', '')
  }
  private get productId() {
    return this.config.get<string>('HUIFU_PRODUCT_ID', '')
  }
  private get huifuId() {
    return this.config.get<string>('HUIFU_HUIFU_ID', '') || this.sysId
  }
  private get privateKey() {
    return this.toPem(this.config.get<string>('HUIFU_RSA_PRIVATE_KEY', ''), 'PRIVATE KEY')
  }
  private get huifuPublicKey() {
    return this.toPem(this.config.get<string>('HUIFU_RSA_PUBLIC_KEY', ''), 'PUBLIC KEY')
  }
  private get notifyUrl() {
    return this.config.get<string>('HUIFU_NOTIFY_URL', '')
  }
  private get subAppId() {
    return this.config.get<string>('WECHAT_APP_ID', '')
  }

  /**
   * 小程序下单（T_MINIAPP），返回微信调起支付参数。
   * 与 WechatPayService.createJsapiOrder 保持相同签名：金额入参为分，内部转元。
   */
  async createJsapiOrder(params: {
    outTradeNo: string
    description: string
    totalFen: number
    openid: string
  }): Promise<JsapiPayParams> {
    const reqDate = this.today()
    // req_seq_id 当日唯一：orderId + 时间戳，支持同一订单重复拉起支付
    const reqSeqId = `${params.outTradeNo}_${Date.now()}`
    const data: Record<string, any> = {
      req_date: reqDate,
      req_seq_id: reqSeqId,
      huifu_id: this.huifuId,
      trade_type: 'T_MINIAPP',
      trans_amt: (params.totalFen / 100).toFixed(2),
      goods_desc: params.description.slice(0, 127),
      notify_url: this.notifyUrl,
      // method_expand 内容即微信对象本身，不再包 trade_type 层
      method_expand: JSON.stringify({
        sub_appid: this.subAppId,
        sub_openid: params.openid,
      }),
    }
    const resp = await this.request('/v4/trade/payment/create', data)
    if (!resp.pay_info) {
      this.logger.error(`汇付下单失败: ${resp.resp_code} ${resp.resp_desc}`)
      throw new BusinessException('支付下单失败', 5101)
    }
    // pay_info 为微信 JSAPI 调起参数的 JSON 字符串，前端零改动直接透传
    return JSON.parse(resp.pay_info) as JsapiPayParams
  }

  /**
   * 申请退款。paymentId 为支付回调存入的复合定位键 `req_date|hf_seq_id`。
   */
  async refund(params: {
    outTradeNo: string
    outRefundNo: string
    totalFen: number
    refundFen: number
    reason?: string
    paymentId?: string | null
  }): Promise<{ refund_id: string; status: string }> {
    const [orgReqDate, orgHfSeqId] = (params.paymentId ?? '').split('|')
    if (!orgReqDate || !orgHfSeqId) {
      throw new BusinessException('订单缺少汇付交易流水，无法退款', 5105)
    }
    const data: Record<string, any> = {
      req_date: this.today(),
      // 同一退款流水号重试时保持幂等：汇付按 req_seq_id 去重，重复请求不会二次扣款
      req_seq_id: params.outRefundNo,
      huifu_id: this.huifuId,
      ord_amt: (params.refundFen / 100).toFixed(2),
      org_req_date: orgReqDate,
      org_hf_seq_id: orgHfSeqId,
      notify_url: this.notifyUrl.replace('/payment/notify', '/payment/refund-notify'),
    }
    if (params.reason) data.remark = params.reason.slice(0, 84)
    const resp = await this.request('/v4/trade/payment/scanpay/refund', data)
    // 00000000/00000100 均表示已受理，终态以退款异步通知为准
    if (resp.resp_code !== '00000000' && resp.resp_code !== '00000100') {
      this.logger.error(`汇付退款受理失败: ${resp.resp_code} ${resp.resp_desc}`)
      throw new BusinessException('退款申请失败', 5106)
    }
    return { refund_id: resp.hf_seq_id ?? '', status: resp.trans_stat ?? 'P' }
  }

  /**
   * 主动查询退款结果（退款异步通知丢失时的兜底）。
   * 按退款请求流水号 org_req_seq_id + 退款日期 org_req_date 定位，
   * 同一笔退款可反复查询，不产生任何资金动作。
   * - status: SUCCESS 已到账 / PROCESSING 受理中 / FAIL 失败 / NOT_FOUND 网关查无此退款
   * - 23000001「原交易不存在」同时覆盖「未受理」和「日期不符」，调用方需结合日期判断，
   *   不得直接据此认定退款未发生。
   */
  async queryRefund(params: {
    outRefundNo: string
    orgReqDate: string
  }): Promise<{
    status: 'SUCCESS' | 'PROCESSING' | 'FAIL' | 'NOT_FOUND'
    gatewayRef?: string
    amountFen?: number
    respCode: string
    respDesc: string
  }> {
    const resp = await this.request('/v4/trade/payment/scanpay/refundquery', {
      huifu_id: this.huifuId,
      org_req_date: params.orgReqDate,
      org_req_seq_id: params.outRefundNo,
    })
    const respCode = String(resp.resp_code ?? '')
    const respDesc = String(resp.resp_desc ?? '')
    if (respCode === '23000001') {
      return { status: 'NOT_FOUND', respCode, respDesc }
    }
    if (respCode !== '00000000' && respCode !== '00000100') {
      this.logger.error(`汇付退款查询失败 ${params.outRefundNo}: ${respCode} ${respDesc}`)
      throw new BusinessException(`退款查询失败：${respDesc || respCode}`, 5107)
    }
    const stat = String(resp.trans_stat ?? '').toUpperCase()
    return {
      status: stat === 'S' ? 'SUCCESS' : stat === 'P' ? 'PROCESSING' : 'FAIL',
      // 退款查询对 TRANS_REFUND 只在 org_hf_seq_id 返回本次退款流水号（已实测）
      gatewayRef: resp.hf_seq_id
        ? String(resp.hf_seq_id)
        : resp.trade_type === 'TRANS_REFUND' && resp.org_hf_seq_id
          ? String(resp.org_hf_seq_id)
          : undefined,
      amountFen:
        resp.actual_ref_amt != null && resp.actual_ref_amt !== ''
          ? Math.round(Number(resp.actual_ref_amt) * 100)
          : undefined,
      respCode,
      respDesc,
    }
  }

  /**
   * 验签并解析支付/退款异步回调（form 原文 resp_data=...&sign=...）。
   * 返回字段映射为微信兼容结构，payment.service 处理逻辑保持不变：
   * - out_trade_no    订单号（从 req_seq_id / org_req_seq_id 前缀还原）
   * - transaction_id  复合定位键 `req_date|hf_seq_id`（存入 Order.paymentId，退款时回用）
   * - trade_state / refund_status  SUCCESS / PROCESSING / FAIL
   * - req_seq_id      用于回包 RECV_ORD_ID_
   */
  decryptNotify(rawBody: string): DecryptedNotify & { req_seq_id: string } {
    const form = new URLSearchParams(rawBody)
    const respData = form.get('resp_data')
    const sign = form.get('sign')
    if (!respData || !sign) {
      throw new BusinessException('回调报文缺少 resp_data/sign', 5103)
    }
    // 异步验签：对 resp_data 原文直接验签，不重排序
    const verified = crypto
      .createVerify('RSA-SHA256')
      .update(respData, 'utf8')
      .verify(this.huifuPublicKey, sign, 'base64')
    if (!verified) {
      throw new BusinessException('回调验签失败', 5102)
    }
    let payload: any
    try {
      payload = JSON.parse(respData)
    } catch {
      throw new BusinessException('回调报文解析失败', 5104)
    }

    const isRefund = payload.trans_type === 'TRANS_REFUND'
    // 支付回调用自身 req_seq_id 还原订单号；退款回调用原交易 org_req_seq_id
    const seqForOrder: string = isRefund
      ? (payload.org_req_seq_id ?? '')
      : (payload.req_seq_id ?? '')
    const outTradeNo = seqForOrder.split('_')[0] ?? ''
    const state =
      payload.trans_stat === 'S'
        ? 'SUCCESS'
        : payload.trans_stat === 'P'
          ? 'PROCESSING'
          : 'FAIL'

    return {
      ...payload,
      out_trade_no: outTradeNo,
      transaction_id: `${payload.req_date ?? ''}|${payload.hf_seq_id ?? ''}`,
      trade_state: state,
      refund_status: state,
      amount: {
        total: Math.round(Number(payload.trans_amt ?? 0) * 100),
        payer_total: Math.round(Number(payload.pay_amt ?? payload.trans_amt ?? 0) * 100),
      },
      req_seq_id: payload.req_seq_id ?? '',
    }
  }

  /** 汇付要求的回调应答：HTTP 200 + RECV_ORD_ID_ + 请求流水号 */
  buildNotifyAck(reqSeqId: string): string {
    return `RECV_ORD_ID_${reqSeqId}`
  }

  // ============ 内部实现 ============

  /** 发起 v4 聚合支付请求：{sys_id, product_id, sign, data}，仅对 data 签名 */
  private async request(urlPath: string, data: Record<string, any>): Promise<any> {
    const body = {
      sys_id: this.sysId,
      product_id: this.productId,
      sign: this.signData(data),
      data,
    }
    const res = await fetch(`${this.base}${urlPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    if (res.status >= 400) {
      this.logger.error(`汇付请求失败 ${res.status}: ${text}`)
      throw new BusinessException('支付接口调用失败', 5107)
    }
    let payload: any
    try {
      payload = JSON.parse(text)
    } catch {
      this.logger.error(`汇付响应非 JSON: ${text}`)
      throw new BusinessException('支付接口响应异常', 5107)
    }
    const respData = payload?.data ?? {}
    // 同步验签失败仅告警不阻断（重序列化可能与原文有差异），业务以 resp_code 为准
    if (payload?.sign && !this.verifyData(respData, payload.sign)) {
      this.logger.warn(`汇付同步响应验签未通过: ${urlPath}`)
    }
    return respData
  }

  /** data 第一层字段 ASCII 排序 → JSON 序列化 → SHA256withRSA → base64 */
  private signData(data: Record<string, any>): string {
    return crypto
      .createSign('RSA-SHA256')
      .update(this.canonicalize(data), 'utf8')
      .sign(this.privateKey, 'base64')
  }

  private verifyData(data: Record<string, any>, sign: string): boolean {
    try {
      return crypto
        .createVerify('RSA-SHA256')
        .update(this.canonicalize(data), 'utf8')
        .verify(this.huifuPublicKey, sign, 'base64')
    } catch {
      return false
    }
  }

  private canonicalize(data: Record<string, any>): string {
    const sorted: Record<string, any> = {}
    for (const key of Object.keys(data).sort()) {
      sorted[key] = data[key]
    }
    return JSON.stringify(sorted)
  }

  /** 兼容 env 中的裸 base64 / \n 转义 PEM，统一输出标准 PEM */
  private toPem(raw: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
    const value = raw.replace(/\\n/g, '\n').trim()
    if (!value || value.includes('-----BEGIN')) return value
    const body = value.replace(/\s+/g, '').replace(/(.{64})/g, '$1\n').trim()
    return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`
  }

  /** 北京时间 yyyyMMdd */
  private today(): string {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .replace(/\D/g, '')
  }
}
