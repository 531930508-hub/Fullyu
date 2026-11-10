import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  type KeyObject
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import type {
  DeviceStatus,
  MicropayRequest,
  MicropayResult,
  NativePayRequest,
  NativePayResult,
  PaymentCallback,
  PaymentCallbackResult,
  PaymentChannel,
  PaymentGateway,
  PaymentQueryRequest,
  PaymentQueryResult,
  PaymentRefundResult,
  PaymentRequest,
  PaymentResult,
  PaymentState,
  PrepayRequest,
  PrepayResult,
  RefundRequest
} from '../../contracts';

/**
 * 汇付天下（斗拱 v2）支付实现 —— 服务商模式。
 *
 * 协议要点（与官方 dg-sdk / 社区 SDK 一致）：
 * - 请求：POST {apiBase}/v2/...，请求体 {sys_id, product_id, sign, data}；
 *   data 去掉空值并按 key ASCII 升序后紧凑序列化，RSA-SHA256(PKCS#1 v1.5) 签名 base64。
 * - 响应：{data, sign}；对 data 重新（顶层）排序紧凑序列化后验签，验不过一律拒绝采用。
 * - 异步通知：application/x-www-form-urlencoded，resp_data 是 JSON 字符串；
 *   必须对原始 resp_data 字符串验签，验不过再尝试排序后的等价串与可选的 MD5 回调密钥。
 * - 金额单位：请求为元、保留两位字符串；本地一律用分。
 * - 交易状态：S 成功、P 处理中、F 失败；P 绝不当作成功。
 *
 * 凭证只从服务器文件读取，任何错误与状态信息都不包含密钥内容。
 */
export type HuifuLiveOptions = {
  sysId?: string;
  productId: string;
  /** 默认子商户号；门店有独立子商户时用 storeMerchants 覆盖。 */
  huifuId?: string;
  /** 小程序 AppID（服务商模式为子商户绑定的 AppID）。 */
  subAppId?: string;
  privateKeyPath?: string;
  publicKeyPath?: string;
  webhookKeyPath?: string;
  /** 测试可注入内联 PEM；生产只走路径。 */
  privateKey?: string;
  publicKey?: string;
  webhookKey?: string;
  notifyUrl: string;
  apiBase: string;
  storeMerchants?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type HuifuKeys = {
  privateKey: KeyObject;
  publicKey: KeyObject;
  webhookKey?: string;
};

type HuifuData = Record<string, unknown>;

const trim = (value: unknown): string => String(value ?? '').trim();

/** 模板里的占位文本不能当成真实密钥使用，尤其是回调 MD5 兜底。 */
const isPlaceholderSecret = (value: string): boolean => /^(REPLACE_ME|请填写|在此粘贴|placeholder)/i.test(value);

/** 请求签名口径：顶层 key ASCII 升序、去掉空值、紧凑 JSON、UTF-8 不转义中文。 */
export function huifuCanonical(value: HuifuData): string {
  const keys = Object.keys(value)
    .filter((key) => {
      const item = value[key];
      if (item === undefined || item === null || item === '') return false;
      if (Array.isArray(item) && item.length === 0) return false;
      if (typeof item === 'object' && !Array.isArray(item) && Object.keys(item as object).length === 0) return false;
      return true;
    })
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(value[key])}`).join(',')}}`;
}

/**
 * 响应/回调验签口径：只排序顶层（与官方 Python SDK 的 sort_dict 一致），
 * 保留空字符串与空对象；null 在 JSON.parse 后按原样保留。
 */
export function huifuCanonicalForVerify(value: HuifuData): string {
  const keys = Object.keys(value)
    .filter((key) => value[key] !== null && value[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(value[key])}`).join(',')}}`;
}

const toSeqId = (reference: string): string => String(reference || '').replace(/[^A-Za-z0-9_]/g, '_');
const fromSeqId = (seq: string): string => String(seq || '').replace(/_/g, '-');

const ymd = (now: number): string => {
  const date = new Date(now);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
};

const yuan = (cents: number): string => (Number(cents) / 100).toFixed(2);

const centsFromYuan = (value: unknown): number | undefined => {
  const text = trim(value);
  if (!text) return undefined;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    const number = Number(text);
    return Number.isFinite(number) ? Math.round(number * 100) : undefined;
  }
  const fraction = (match[3] || '').padEnd(2, '0');
  const cents = Number(match[2]) * 100 + Number(fraction || 0);
  return match[1] ? -cents : cents;
};

const mapPayStat = (stat: string): PaymentState => {
  const value = stat.toUpperCase();
  if (value === 'S') return 'paid';
  if (value === 'P') return 'processing';
  if (value === 'F') return 'failed';
  if (value === 'I' || value === 'C') return 'closed';
  return 'pending';
};

const methodOfTradeType = (tradeType: string): PaymentChannel | undefined => {
  const value = tradeType.toUpperCase();
  if (value.startsWith('T_')) return 'wechat';
  if (value.startsWith('A_')) return 'alipay';
  return undefined;
};

export class HuifuPaymentGateway implements PaymentGateway {
  readonly name = 'huifu-payment';
  readonly mode = 'live';
  readonly displayName = '汇付天下';
  readonly asyncPayments = true;
  /** 汇付要求异步通知应答纯文本 success，否则会持续重试。 */
  readonly callbackAck = 'success';

  private readonly options: HuifuLiveOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private keys: HuifuKeys | null = null;
  private keysError: string | null = null;

  constructor(options: HuifuLiveOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl || fetch;
    this.now = options.now || Date.now;
  }

  merchantFor(storeId: string): string {
    return trim(this.options.storeMerchants?.[storeId]) || trim(this.options.huifuId);
  }

  async status(): Promise<DeviceStatus> {
    const ready = this.credentials();
    if (!ready.ok) {
      return { online: false, mode: this.mode, detail: ready.error };
    }
    return {
      online: true,
      mode: this.mode,
      detail: `汇付天下服务商模式已配置：系统号 ${this.options.sysId}，默认子商户 ${this.options.huifuId || '未设置'}`
    };
  }

  /**
   * 在线支付不走同步扣款：必须先建未支付单，再由预下单/收款码/付款码 + 回调落账。
   * 保留此方法只为满足接口，任何调用都诚实失败。
   */
  async charge(_request: PaymentRequest): Promise<PaymentResult> {
    return { ok: false, error: '汇付在线支付需先建单再发起预支付/扫码，不支持同步扣款' };
  }

  async prepay(request: PrepayRequest): Promise<PrepayResult> {
    const ready = this.credentials();
    if (!ready.ok) return { ok: false, error: ready.error };

    const storeId = trim(request.storeId) || 'sh';
    const merchant = this.merchantFor(storeId);
    if (!merchant) return { ok: false, error: '汇付子商户号未配置，无法发起小程序支付' };
    if (!trim(request.openId)) return { ok: false, error: '缺少微信 openId，无法发起小程序支付' };

    const data = this.baseTradeData({
      orderId: request.orderId,
      merchant,
      amountCents: request.amountCents,
      description: request.description,
      notifyUrl: request.notifyUrl
    });
    data.trade_type = 'T_MINIAPP';
    data.wx_data = JSON.stringify({
      sub_appid: trim(request.subAppId) || trim(this.options.subAppId),
      sub_openid: trim(request.openId)
    });
    if (request.clientIp) data.risk_check_data = JSON.stringify({ ip_addr: trim(request.clientIp) });

    const result = await this.call('/v2/trade/payment/jspay', data, ready.keys);
    const payInfo = this.parsePayInfo(result.pay_info);
    if (!payInfo) {
      return { ok: false, error: `汇付未返回小程序支付参数（${trim(result.resp_code)} ${trim(result.resp_desc)}）` };
    }
    return {
      ok: true,
      payment: {
        timeStamp: payInfo.timeStamp,
        nonceStr: payInfo.nonceStr,
        package: payInfo.package,
        signType: payInfo.signType === 'MD5' ? 'MD5' : 'RSA',
        paySign: payInfo.paySign
      }
    };
  }

  async nativePay(request: NativePayRequest): Promise<NativePayResult> {
    const ready = this.credentials();
    if (!ready.ok) return { ok: false, error: ready.error };
    const merchant = this.merchantFor(request.storeId);
    if (!merchant) return { ok: false, error: '汇付子商户号未配置，无法生成收款码' };

    const data = this.baseTradeData({
      orderId: request.orderId,
      merchant,
      amountCents: request.amountCents,
      description: request.description,
      notifyUrl: request.notifyUrl
    });
    data.trade_type = request.method === 'alipay' ? 'A_NATIVE' : 'T_NATIVE';
    if (request.clientIp) data.risk_check_data = JSON.stringify({ ip_addr: trim(request.clientIp) });

    const result = await this.call('/v2/trade/payment/jspay', data, ready.keys, {
      tolerateBusinessError: true
    });
    const respCode = trim(result.resp_code);
    if (respCode && respCode !== '00000000' && respCode !== '00000100') {
      // 商户未开通 native 支付、重复下单都是可解释的业务结果：回可读原因让营业台改走付款码，
      // 不能抛成 500 让界面只看到「服务暂时不可用」。
      return { ok: false, error: this.nativePayError(respCode, result) };
    }
    const status = mapPayStat(trim(result.trans_stat));
    const qrCode = trim(result.qr_code);
    if (!qrCode && status !== 'paid') {
      return {
        ok: false,
        status: 'pending',
        error: `汇付未返回收款码（${trim(result.resp_code)} ${trim(result.resp_desc)}）`
      };
    }
    return {
      ok: true,
      qrCode: qrCode || undefined,
      providerRef: trim(result.hf_seq_id) || undefined,
      status: status === 'paid' ? 'paid' : 'pending'
    };
  }

  async micropay(request: MicropayRequest): Promise<MicropayResult> {
    const ready = this.credentials();
    if (!ready.ok) return { ok: false, status: 'failed', error: ready.error };
    const merchant = this.merchantFor(request.storeId);
    if (!merchant) return { ok: false, status: 'failed', error: '汇付子商户号未配置，无法扫顾客付款码' };
    const authCode = trim(request.authCode);
    if (!authCode) return { ok: false, status: 'failed', error: '缺少顾客付款码' };

    const data = this.baseTradeData({
      orderId: request.orderId,
      merchant,
      amountCents: request.amountCents,
      description: request.description,
      notifyUrl: request.notifyUrl
    });
    data.auth_code = authCode;
    if (request.clientIp) data.risk_check_data = JSON.stringify({ ip_addr: trim(request.clientIp) });

    const result = await this.call('/v2/trade/payment/micropay', data, ready.keys, {
      tolerateBusinessError: true
    });
    const providerRef = trim(result.hf_seq_id) || trim(result.party_order_id) || undefined;
    const respCode = trim(result.resp_code);
    // 付款码过期/无效、余额不足等是正常业务结果，必须回给营业台提示，
    // 不能当成接口异常抛 500，也不能留下「未说明原因」的假处理中。
    if (respCode && respCode !== '00000000' && respCode !== '00000100') {
      const raw =
        trim(result.bank_message) || trim(result.bank_desc) || trim(result.resp_desc) || '顾客付款码扣款失败';
      const detail = /\[([^\]]+)\]/.exec(raw)?.[1] || raw;
      return { ok: false, status: 'failed', providerRef, error: detail.replace(/^\d+\s*/, '') };
    }
    const status = mapPayStat(trim(result.trans_stat));
    if (status === 'paid') {
      return { ok: true, status: 'paid', providerRef, paidAt: this.now() };
    }
    if (status === 'processing' || status === 'pending') {
      return { ok: true, status: 'processing', providerRef };
    }
    return {
      ok: false,
      status: 'failed',
      providerRef,
      error: trim(result.bank_message) || trim(result.bank_desc) || trim(result.resp_desc) || '顾客付款码扣款失败'
    };
  }

  async query(request: PaymentQueryRequest): Promise<PaymentQueryResult> {
    const ready = this.credentials();
    if (!ready.ok) return { ok: false, status: 'pending', error: ready.error };
    const merchant = this.merchantFor(request.storeId);
    if (!merchant) return { ok: false, status: 'pending', error: '汇付子商户号未配置' };

    const result = await this.call(
      '/v4/trade/payment/scanpay/query',
      {
        huifu_id: merchant,
        req_date: ymd(request.requestedAt || this.now()),
        req_seq_id: toSeqId(request.orderId)
      },
      ready.keys
    );
    const status = mapPayStat(trim(result.trans_stat));
    const providerRef = trim(result.hf_seq_id) || undefined;
    return {
      ok: true,
      status,
      providerRef,
      paidAt: status === 'paid' ? this.now() : undefined
    };
  }

  async refund(request: RefundRequest): Promise<PaymentRefundResult> {
    const ready = this.credentials();
    if (!ready.ok) return { ok: false, error: ready.error };
    const paymentRef = trim(request.paymentRef);
    if (!paymentRef) {
      return { ok: false, error: '订单缺少汇付交易流水号，无法原路退款' };
    }
    const merchant = this.merchantFor(request.storeId || 'sh');
    if (!merchant) return { ok: false, error: '汇付子商户号未配置，无法退款' };

    const data: HuifuData = {
      req_date: ymd(this.now()),
      req_seq_id: toSeqId(request.reference),
      huifu_id: merchant,
      ord_amt: yuan(request.amountCents),
      org_hf_seq_id: paymentRef,
      // 汇付退款必须带原交易请求日期，且要与原下单 req_date 一致，否则拒绝整笔退款。
      org_req_date: ymd(request.requestedAt || this.now()),
      notify_url: this.options.notifyUrl
    };
    const result = await this.call('/v2/trade/payment/scanpay/refund', data, ready.keys, {
      tolerateBusinessError: true
    });
    const respCode = trim(result.resp_code);
    // 渠道明确拒绝（如原交易日期不对、可退金额不足）是确定性失败：回失败原文让业务层释放占用，
    // 不能抛错被当成「结果未知」而长期占着可退额度。
    if (respCode && respCode !== '00000000' && respCode !== '00000100') {
      // 重复交易说明同号退款单此前可能已被受理（例如超时重试）：资金状态不明，
      // 必须抛成「结果未知」保留占用，等查询/人工收敛，绝不能当成失败释放额度。
      if (respCode === '20000000') {
        throw new Error(
          `汇付退款重复提交（${respCode}）：${trim(result.resp_desc) || '重复交易'}，结果未知`
        );
      }
      return {
        ok: false,
        error: trim(result.resp_desc) || trim(result.bank_message) || `汇付退款失败（${respCode}）`
      };
    }
    const status = mapPayStat(trim(result.trans_stat));
    const providerRef = trim(result.hf_seq_id) || undefined;
    if (status === 'paid') {
      return { ok: true, status: 'succeeded', providerRef, paidAt: this.now() };
    }
    if (status === 'processing' || status === 'pending') {
      return { ok: true, status: 'processing', providerRef };
    }
    return {
      ok: false,
      providerRef,
      error: trim(result.bank_message) || trim(result.resp_desc) || '汇付退款失败'
    };
  }

  async handleCallback(request: PaymentCallback): Promise<PaymentCallbackResult> {
    const ready = this.credentials();
    if (!ready.ok) return { ok: false, error: ready.error };

    const params = new URLSearchParams(trim(request.rawBody));
    if (!params.get('resp_data') && request.body && typeof request.body === 'object') {
      for (const [key, value] of Object.entries(request.body as Record<string, unknown>)) {
        if (typeof value === 'string') params.set(key, value);
      }
    }
    const respData = params.get('resp_data') || params.get('data') || '';
    const sign = trim(params.get('sign'));
    if (!respData || !sign) {
      return { ok: false, error: '汇付回调缺少 resp_data 或 sign' };
    }

    let verified = this.verifyText(ready.keys, respData, sign);
    let data: HuifuData | null = null;
    if (!verified) {
      try {
        const parsed = JSON.parse(respData) as HuifuData;
        data = parsed;
        verified = this.verifyText(ready.keys, huifuCanonicalForVerify(parsed), sign);
      } catch {
        verified = false;
      }
    }
    if (!verified && ready.keys.webhookKey) {
      // 少数旧接入使用「JSON + 回调密钥」的 MD5 方案；仅在 RSA 失败后尝试。
      const candidates = [respData];
      if (data) candidates.push(JSON.stringify(data), huifuCanonicalForVerify(data));
      verified = candidates.some((text) => this.md5(text, ready.keys.webhookKey!) === sign.toLowerCase());
    }
    if (!verified) return { ok: false, error: '汇付回调验签失败' };
    if (!data) {
      try {
        data = JSON.parse(respData) as HuifuData;
      } catch {
        return { ok: false, error: '汇付回调内容无法解析' };
      }
    }

    const respCode = trim(data.resp_code);
    const respDesc = trim(data.resp_desc);
    const seq = trim(data.req_seq_id) || trim(data.org_req_seq_id);
    const reference = seq ? fromSeqId(seq) : undefined;
    const providerRef = trim(data.hf_seq_id) || trim(data.party_order_id) || undefined;
    const merchantId = trim(data.huifu_id) || undefined;
    const amountCents = centsFromYuan(
      data.trans_amt ?? data.ord_amt ?? data.actual_ref_amt ?? data.org_ord_amt
    );
    const kind = reference?.startsWith('RF-') || data.actual_ref_amt !== undefined ? 'refund' : 'payment';

    if (kind === 'refund') {
      const stat = mapPayStat(trim(data.trans_stat));
      return {
        ok: true,
        kind,
        reference,
        providerRef,
        amountCents,
        merchantId,
        refundStatus: stat === 'paid' ? 'succeeded' : stat === 'processing' ? 'processing' : 'failed',
        error: respCode && respCode !== '00000000' ? respDesc || `汇付回调失败（${respCode}）` : undefined
      };
    }

    const stat = mapPayStat(trim(data.trans_stat));
    const failedByCode = Boolean(respCode && respCode !== '00000000');
    return {
      ok: true,
      kind: 'payment',
      reference,
      providerRef,
      amountCents,
      merchantId,
      method: methodOfTradeType(trim(data.trade_type)),
      status: failedByCode && stat !== 'paid' ? 'failed' : stat,
      paidAt: stat === 'paid' ? this.now() : undefined,
      error: failedByCode ? respDesc || `汇付回调失败（${respCode}）` : undefined
    };
  }

  private baseTradeData(input: {
    orderId: string;
    merchant: string;
    amountCents: number;
    description: string;
    notifyUrl?: string;
  }): HuifuData {
    return {
      req_date: ymd(this.now()),
      req_seq_id: toSeqId(input.orderId),
      huifu_id: input.merchant,
      goods_desc: trim(input.description).slice(0, 128) || '时叙茶饮',
      trans_amt: yuan(input.amountCents),
      notify_url: trim(input.notifyUrl) || this.options.notifyUrl
    };
  }

  private nativePayError(respCode: string, result: HuifuData): string {
    if (respCode === '23000004') return '当前商户暂不支持生成收款码，请让伙伴扫顾客付款码收款';
    if (respCode === '20000000') return '该订单已发起过收款，请刷新页面后重新操作';
    return (
      trim(result.resp_desc) || trim(result.bank_message) || `汇付未能生成收款码（${respCode || '未知错误'}）`
    );
  }

  private parsePayInfo(value: unknown): {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
  } | null {
    let source: unknown = value;
    if (typeof value === 'string') {
      try {
        source = JSON.parse(value);
      } catch {
        return null;
      }
    }
    if (!source || typeof source !== 'object') return null;
    const raw = source as Record<string, unknown>;
    const timeStamp = trim(raw.timestamp ?? raw.timeStamp);
    const nonceStr = trim(raw.nonceStr ?? raw.nonce_str);
    const packageValue = trim(raw.package);
    const paySign = trim(raw.paySign ?? raw.pay_sign);
    const signType = trim(raw.signType ?? raw.sign_type) || 'RSA';
    if (!timeStamp || !nonceStr || !packageValue || !paySign) return null;
    return { timeStamp, nonceStr, package: packageValue, signType, paySign };
  }

  private credentials(): { ok: true; keys: HuifuKeys } | { ok: false; error: string } {
    if (!trim(this.options.sysId)) {
      return { ok: false, error: '汇付系统号（sys_id）未配置，请检查 HUIFU_SYS_ID' };
    }
    if (!trim(this.options.huifuId) && !Object.keys(this.options.storeMerchants || {}).length) {
      return { ok: false, error: '汇付子商户号未配置，请检查 HUIFU_HUIFU_ID 或 HUIFU_STORE_MERCHANTS' };
    }
    if (this.keys) return { ok: true, keys: this.keys };
    if (this.keysError) return { ok: false, error: this.keysError };
    try {
      const privatePem =
        this.options.privateKey ||
        readFileSync(trim(this.options.privateKeyPath) || '/nonexistent/huifu/merchant_private_key.pem', 'utf8');
      const publicPem =
        this.options.publicKey ||
        readFileSync(trim(this.options.publicKeyPath) || '/nonexistent/huifu/huifu_public_key.pem', 'utf8');
      let webhookKey = trim(this.options.webhookKey);
      if (!webhookKey && this.options.webhookKeyPath) {
        try {
          webhookKey = trim(readFileSync(this.options.webhookKeyPath, 'utf8'));
        } catch {
          webhookKey = '';
        }
      }
      this.keys = {
        privateKey: createPrivateKey({ key: privatePem, format: 'pem' }),
        publicKey: createPublicKey({ key: publicPem, format: 'pem' }),
        webhookKey: webhookKey && !isPlaceholderSecret(webhookKey) ? webhookKey : undefined
      };
      return { ok: true, keys: this.keys };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.keysError = `汇付商户私钥/汇付公钥不可用：请检查 /etc/teahour/huifu 下的凭证文件（${message}）`;
      return { ok: false, error: this.keysError };
    }
  }

  private sign(keys: HuifuKeys, text: string): string {
    return createSign('RSA-SHA256').update(text, 'utf8').sign(keys.privateKey, 'base64');
  }

  private verifyText(keys: HuifuKeys, text: string, sign: string): boolean {
    try {
      return createVerify('RSA-SHA256').update(text, 'utf8').verify(keys.publicKey, sign, 'base64');
    } catch {
      return false;
    }
  }

  private md5(text: string, key: string): string {
    return createHash('md5').update(`${text}${key}`, 'utf8').digest('hex');
  }

  private async call(
    path: string,
    data: HuifuData,
    keys: HuifuKeys,
    options: { tolerateBusinessError?: boolean } = {}
  ): Promise<HuifuData> {
    const payloadText = huifuCanonical(data);
    const body = JSON.stringify({
      sys_id: trim(this.options.sysId),
      product_id: trim(this.options.productId) || 'PAYUN',
      sign: this.sign(keys, payloadText),
      data
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs || 15_000);
    let text: string;
    try {
      const response = await this.fetchImpl(`${this.options.apiBase.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json;charset=utf-8' },
        body,
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`汇付接口返回 HTTP ${response.status}`);
      text = await response.text();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('汇付接口请求超时，结果未知，请稍后查询');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    let parsed: { data?: HuifuData; sign?: string };
    try {
      parsed = JSON.parse(text) as { data?: HuifuData; sign?: string };
    } catch {
      throw new Error('汇付接口返回内容无法解析');
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
      throw new Error('汇付接口返回格式不正确');
    }
    if (!parsed.sign) throw new Error('汇付返回数据缺少签名，已拒绝采用');
    if (!this.verifyText(keys, huifuCanonicalForVerify(parsed.data), parsed.sign)) {
      throw new Error('汇付返回数据验签失败，已拒绝采用');
    }

    const result = parsed.data;
    const respCode = trim(result.resp_code);
    // 汇付下单接口成功时返回 00000100「下单成功」（2026-11-01 实测），其余接口为 00000000。
    if (respCode && respCode !== '00000000' && respCode !== '00000100') {
      if (options.tolerateBusinessError) return result;
      throw new Error(`汇付接口失败（${respCode}）：${trim(result.resp_desc) || '未知错误'}`);
    }
    return result;
  }
}
