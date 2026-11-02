/**
 * 汇付天下（斗拱 v2）支付适配。
 *
 * 全程使用进程内生成的一次性 RSA 密钥与假 fetch：不访问真实汇付、不使用真实商户凭证。
 * 重点验证三件事：请求签名可被汇付公钥验过、返回数据必须验签后才认、异步通知按原始
 * resp_data 验签并映射到我们自己的订单/退款单号。
 */
import { createHash, createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { HuifuPaymentGateway } from '@teahour/integrations';

const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
};

const merchant = pair();
const huifu = pair();

const canonical = (value: any): string => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined && value[key] !== null && value[key] !== '')
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const signWith = (privateKey: string, text: string): string =>
  createSign('RSA-SHA256').update(text, 'utf8').sign(privateKey, 'base64');

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function fakeFetch(queue: Array<{ data: unknown; sign?: string | null; urlIncludes?: string }>) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = async (url: string, init: any) => {
    calls.push({ url: String(url), init });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected fetch: ${String(url)}`);
    if (next.urlIncludes && !String(url).includes(next.urlIncludes)) {
      throw new Error(`unexpected url: ${String(url)}`);
    }
    const sign =
      next.sign === null
        ? undefined
        : next.sign || signWith(huifu.privateKey, canonical(next.data));
    return jsonResponse(sign ? { data: next.data, sign } : { data: next.data });
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

const build = (
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof HuifuPaymentGateway>[0]> = {}
) =>
  new HuifuPaymentGateway({
    sysId: 'SYS-TEST',
    productId: 'PAYUN',
    huifuId: '666600000001',
    subAppId: 'wx-sub-appid',
    privateKey: merchant.privateKey,
    publicKey: huifu.publicKey,
    notifyUrl: 'https://example.test/api/hooks/payment/huifu-payment',
    apiBase: 'https://api.huifu.test',
    fetchImpl,
    ...overrides
  });

const requestBody = (call: { init: any }) => JSON.parse(String(call.init.body));

describe('汇付天下支付适配', () => {
  it('小程序预下单：RSA 签名、T_MINIAPP 与 wx_data 符合斗拱 v2 口径', async () => {
    const fake = fakeFetch([
      {
        urlIncludes: '/v2/trade/payment/jspay',
        data: {
          resp_code: '00000000',
          resp_desc: '成功',
          trans_stat: 'P',
          req_seq_id: 'SO_abc',
          hf_seq_id: 'HF-1',
          pay_info: JSON.stringify({
            appId: 'wx-sub-appid',
            timestamp: '1700000000',
            nonceStr: 'nonce',
            package: 'prepay_id=wx1',
            signType: 'RSA',
            paySign: 'pay-sign'
          })
        }
      }
    ]);
    const gateway = build(fake.impl);

    const result = await gateway.prepay!({
      openId: 'openid-1',
      orderId: 'SO-abc',
      orderNumber: 'A001',
      amountCents: 1230,
      description: '时叙 A001',
      storeId: 'sh',
      clientIp: '1.2.3.4'
    });

    expect(result.ok).toBe(true);
    expect(result.payment).toEqual({
      timeStamp: '1700000000',
      nonceStr: 'nonce',
      package: 'prepay_id=wx1',
      signType: 'RSA',
      paySign: 'pay-sign'
    });

    const body = requestBody(fake.calls[0]);
    expect(fake.calls[0].url).toBe('https://api.huifu.test/v2/trade/payment/jspay');
    expect(body.sys_id).toBe('SYS-TEST');
    expect(body.product_id).toBe('PAYUN');
    expect(body.data.req_seq_id).toBe('SO_abc');
    expect(body.data.req_date).toMatch(/^\d{8}$/);
    expect(body.data.trade_type).toBe('T_MINIAPP');
    expect(body.data.trans_amt).toBe('12.30');
    expect(body.data.huifu_id).toBe('666600000001');
    expect(body.data.notify_url).toBe('https://example.test/api/hooks/payment/huifu-payment');
    expect(JSON.parse(body.data.wx_data)).toEqual({ sub_appid: 'wx-sub-appid', sub_openid: 'openid-1' });
    expect(
      createVerify('RSA-SHA256').update(canonical(body.data), 'utf8').verify(merchant.publicKey, body.sign, 'base64')
    ).toBe(true);
  });

  it('小程序预下单：汇付返回 00000100「下单成功」时同样视为成功', async () => {
    const fake = fakeFetch([
      {
        urlIncludes: '/v2/trade/payment/jspay',
        data: {
          resp_code: '00000100',
          resp_desc: '下单成功',
          trans_stat: 'P',
          req_seq_id: 'SO_abc',
          hf_seq_id: 'HF-100',
          pay_info: JSON.stringify({
            appId: 'wx-sub-appid',
            timestamp: '1700000001',
            nonceStr: 'nonce-100',
            package: 'prepay_id=wx100',
            signType: 'RSA',
            paySign: 'pay-sign-100'
          })
        }
      }
    ]);
    const gateway = build(fake.impl);

    const result = await gateway.prepay!({
      openId: 'openid-1',
      orderId: 'SO-abc',
      amountCents: 1,
      description: '时叙 A001',
      storeId: 'sh'
    });

    expect(result.ok).toBe(true);
    expect(result.payment?.package).toBe('prepay_id=wx100');
  });

  it('交易查询使用斗拱 v4 接口，并按原流水号与请求日期查询', async () => {
    const fake = fakeFetch([
      { urlIncludes: '/v4/trade/payment/scanpay/query', data: { resp_code: '00000000', trans_stat: 'P', req_seq_id: 'SO_abc' } }
    ]);
    const gateway = build(fake.impl);

    const result = await gateway.query!({
      orderId: 'SO-abc',
      storeId: 'sh',
      requestedAt: new Date('2026-11-01T10:00:00+08:00').getTime()
    });

    expect(result).toMatchObject({ ok: true, status: 'processing' });
    expect(fake.calls[0].url).toBe('https://api.huifu.test/v4/trade/payment/scanpay/query');
    const body = requestBody(fake.calls[0]);
    expect(body.data).toMatchObject({ req_seq_id: 'SO_abc' });
    expect(body.data.req_date).toMatch(/^\d{8}$/);
  });

  it('返回数据验签失败时拒绝采用，绝不把未验签结果当成支付参数', async () => {
    const fake = fakeFetch([
      {
        data: {
          resp_code: '00000000',
          trans_stat: 'P',
          pay_info: JSON.stringify({ appId: 'wx', timestamp: '1', nonceStr: 'n', package: 'p', signType: 'RSA', paySign: 's' })
        },
        sign: signWith(merchant.privateKey, '{"tampered":true}')
      }
    ]);
    const gateway = build(fake.impl);

    await expect(
      gateway.prepay!({
        openId: 'openid-1',
        orderId: 'SO-abc',
        orderNumber: 'A001',
        amountCents: 100,
        description: '时叙 A001',
        storeId: 'sh'
      })
    ).rejects.toThrow(/验签/);
  });

  it('异步通知按原始 resp_data 验签并映射订单号与金额', async () => {
    const gateway = build(fakeFetch([]).impl);
    const data = {
      resp_code: '00000000',
      resp_desc: '成功',
      huifu_id: '666600000001',
      req_seq_id: 'SO-abc',
      hf_seq_id: 'HF-PAID-1',
      trans_amt: '12.30',
      trans_stat: 'S',
      trade_type: 'T_MINIAPP',
      party_order_id: 'wx-order-1'
    };
    const respData = canonical(data);
    const rawBody = `resp_code=00000000&resp_data=${encodeURIComponent(respData)}&sign=${encodeURIComponent(
      signWith(huifu.privateKey, respData)
    )}`;

    const result = await gateway.handleCallback!({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      rawBody,
      body: Object.fromEntries(new URLSearchParams(rawBody))
    });

    expect(result).toMatchObject({
      ok: true,
      kind: 'payment',
      status: 'paid',
      reference: 'SO-abc',
      providerRef: 'HF-PAID-1',
      amountCents: 1230,
      merchantId: '666600000001',
      method: 'wechat'
    });
  });

  it('回调验签失败时返回 ok:false，不能落账', async () => {
    const gateway = build(fakeFetch([]).impl);
    const respData = canonical({ resp_code: '00000000', req_seq_id: 'SO-abc', trans_amt: '1.00', trans_stat: 'S' });
    const rawBody = `resp_data=${encodeURIComponent(respData)}&sign=${encodeURIComponent(
      signWith(merchant.privateKey, respData)
    )}`;

    const result = await gateway.handleCallback!({ headers: {}, rawBody, body: {} });

    expect(result.ok).toBe(false);
    expect(result.reference).toBeUndefined();
  });

  it('回调密钥仍是占位文本时不启用 MD5 兜底，避免伪造回调落账', async () => {
    const gateway = build(fakeFetch([]).impl, { webhookKey: 'REPLACE_ME_WEBHOOK_KEY' });
    const respData = JSON.stringify({ resp_code: '00000000', req_seq_id: 'SO-abc', trans_amt: '1.00', trans_stat: 'S' });
    const sign = createHash('md5').update(`${respData}REPLACE_ME_WEBHOOK_KEY`, 'utf8').digest('hex');
    const rawBody = `resp_data=${encodeURIComponent(respData)}&sign=${sign}`;

    const result = await gateway.handleCallback!({ headers: {}, rawBody, body: {} });

    expect(result.ok).toBe(false);
  });

  it('退款通知识别为 refund，并映射退款单号与结果', async () => {
    const gateway = build(fakeFetch([]).impl);
    const data = {
      resp_code: '00000000',
      huifu_id: '666600000001',
      req_seq_id: 'RF-1234',
      hf_seq_id: 'HF-REF-1',
      ord_amt: '8.00',
      actual_ref_amt: '8.00',
      trans_stat: 'S'
    };
    const respData = canonical(data);
    const rawBody = `resp_data=${encodeURIComponent(respData)}&sign=${encodeURIComponent(
      signWith(huifu.privateKey, respData)
    )}`;

    const result = await gateway.handleCallback!({ headers: {}, rawBody, body: {} });

    expect(result).toMatchObject({
      ok: true,
      kind: 'refund',
      refundStatus: 'succeeded',
      reference: 'RF-1234',
      amountCents: 800
    });
  });

  it('后台顾客扫店码：微信/支付宝分别使用 T_NATIVE / A_NATIVE 并返回二维码', async () => {
    const fake = fakeFetch([
      { data: { resp_code: '00000000', trans_stat: 'P', qr_code: 'weixin://wxpay/1' } },
      { data: { resp_code: '00000000', trans_stat: 'P', qr_code: 'https://qr.alipay.com/1' } }
    ]);
    const gateway = build(fake.impl);

    const wechat = await gateway.nativePay!({
      orderId: 'SO-1',
      amountCents: 2000,
      description: '时叙 A002',
      storeId: 'sh',
      method: 'wechat'
    });
    const alipay = await gateway.nativePay!({
      orderId: 'SO-2',
      amountCents: 3000,
      description: '时叙 A003',
      storeId: 'sh',
      method: 'alipay'
    });

    expect(wechat).toMatchObject({ ok: true, status: 'pending', qrCode: 'weixin://wxpay/1' });
    expect(alipay).toMatchObject({ ok: true, status: 'pending', qrCode: 'https://qr.alipay.com/1' });
    expect(requestBody(fake.calls[0]).data.trade_type).toBe('T_NATIVE');
    expect(requestBody(fake.calls[1]).data.trade_type).toBe('A_NATIVE');
  });

  it('后台扫顾客付款码：S/P/F 如实映射，不把处理中当成已支付', async () => {
    const fake = fakeFetch([
      { data: { resp_code: '00000000', trans_stat: 'S', hf_seq_id: 'HF-S', party_order_id: 'wx-1' } },
      { data: { resp_code: '00000000', trans_stat: 'P', hf_seq_id: 'HF-P' } },
      { data: { resp_code: '00000000', trans_stat: 'F', hf_seq_id: 'HF-F', bank_message: '余额不足' } }
    ]);
    const gateway = build(fake.impl);

    const paid = await gateway.micropay!({
      orderId: 'SO-1',
      amountCents: 100,
      description: '时叙 A004',
      storeId: 'sh',
      method: 'wechat',
      authCode: '134567890123456789'
    });
    const processing = await gateway.micropay!({
      orderId: 'SO-2',
      amountCents: 100,
      description: '时叙 A005',
      storeId: 'sh',
      method: 'wechat',
      authCode: '134567890123456789'
    });
    const failed = await gateway.micropay!({
      orderId: 'SO-3',
      amountCents: 100,
      description: '时叙 A006',
      storeId: 'sh',
      method: 'wechat',
      authCode: '134567890123456789'
    });

    expect(paid).toMatchObject({ ok: true, status: 'paid', providerRef: 'HF-S' });
    expect(processing).toMatchObject({ ok: true, status: 'processing', providerRef: 'HF-P' });
    expect(failed).toMatchObject({ ok: false, status: 'failed' });
    expect(requestBody(fake.calls[0]).data.auth_code).toBe('134567890123456789');
    expect(requestBody(fake.calls[0]).data.trans_amt).toBe('1.00');
  });

  it('付款码被渠道拒绝（过期/无效）时返回失败原文，不抛 500', async () => {
    const fake = fakeFetch([
      { data: { resp_code: '90000000', resp_desc: '业务执行失败[101 付款码无效，请重新扫码]' } }
    ]);
    const gateway = build(fake.impl);

    const failed = await gateway.micropay!({
      orderId: 'SO-4',
      amountCents: 100,
      description: '时叙 A007',
      storeId: 'sh',
      method: 'wechat',
      authCode: '134567890123456789'
    });

    expect(failed).toMatchObject({ ok: false, status: 'failed', error: '付款码无效，请重新扫码' });
  });

  it('退款带上原交易请求日期与汇付流水号，缺一不可', async () => {
    const fake = fakeFetch([
      { data: { resp_code: '00000000', trans_stat: 'S', hf_seq_id: 'HF-RF-1' } }
    ]);
    const gateway = build(fake.impl);

    const result = await gateway.refund({
      paymentRef: '002900TOP3A261102140148P901ac1362c900000',
      amountCents: 2000,
      reference: 'RF-8ab6496b-45ea-42d5-99e9-27a76ff58e6c',
      storeId: 'sh',
      requestedAt: Date.UTC(2026, 10, 1, 12, 0, 0)
    });

    expect(result).toMatchObject({ ok: true, status: 'succeeded', providerRef: 'HF-RF-1' });
    const data = requestBody(fake.calls[0]).data;
    expect(fake.calls[0].url).toBe('https://api.huifu.test/v2/trade/payment/scanpay/refund');
    expect(data.org_hf_seq_id).toBe('002900TOP3A261102140148P901ac1362c900000');
    expect(data.org_req_date).toBe('20261101');
    expect(data.ord_amt).toBe('20.00');
  });

  it('退款被渠道明确拒绝时返回失败原文，不抛出被当成「结果未知」', async () => {
    const fake = fakeFetch([
      { data: { resp_code: '10000000', resp_desc: '原交易请求日期不能为空' } }
    ]);
    const gateway = build(fake.impl);

    const failed = await gateway.refund({
      paymentRef: '0029-REF',
      amountCents: 2000,
      reference: 'RF-2',
      storeId: 'sh',
      requestedAt: Date.UTC(2026, 10, 1, 12, 0, 0)
    });

    expect(failed).toMatchObject({ ok: false, error: '原交易请求日期不能为空' });
  });

  it('退款单重复提交时按结果未知保留占用，不能当成确定失败', async () => {
    const fake = fakeFetch([{ data: { resp_code: '20000000', resp_desc: '重复交易' } }]);
    const gateway = build(fake.impl);

    await expect(
      gateway.refund({
        paymentRef: '0029-REF',
        amountCents: 2000,
        reference: 'RF-3',
        storeId: 'sh',
        requestedAt: Date.UTC(2026, 10, 1, 12, 0, 0)
      })
    ).rejects.toThrow('重复提交');
  });

  it('服务商模式按门店选择子商户号', async () => {
    const gateway = build(fakeFetch([]).impl, {
      storeMerchants: { sh: '666600000002' }
    });
    expect(gateway.merchantFor('sh')).toBe('666600000002');
    expect(gateway.merchantFor('hz')).toBe('666600000001');
  });

  it('缺少凭证时诚实失败，不在启动期崩溃也不假装可用', async () => {
    const gateway = new HuifuPaymentGateway({
      sysId: 'SYS-TEST',
      productId: 'PAYUN',
      huifuId: '666600000001',
      privateKeyPath: '/nonexistent/merchant.pem',
      publicKeyPath: '/nonexistent/huifu.pem',
      notifyUrl: 'https://example.test/hook',
      apiBase: 'https://api.huifu.test'
    });

    const status = await gateway.status();
    expect(status.online).toBe(false);
    const result = await gateway.nativePay!({
      orderId: 'SO-1',
      amountCents: 100,
      description: '时叙',
      storeId: 'sh',
      method: 'wechat'
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/凭证|密钥|私钥/);
  });
});
