/**
 * 微信小程序 live 登录适配：只接真实登录与手机号，支付仍由独立支付渠道决定。
 *
 * 这些测试用注入的 fetch 模拟微信开放接口，不发真实网络请求，也不需要真实 AppSecret。
 */
import {
  WechatMiniProgramAuth,
  createIntegrations,
  loadIntegrationsConfig,
  type IntegrationsMode
} from '@teahour/integrations';

type QueuedResponse = {
  body?: unknown;
  /** 小程序码接口成功时返回 PNG 字节而不是 JSON。 */
  png?: Uint8Array;
  urlIncludes?: string;
};

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const pngResponse = (bytes: Uint8Array): Response =>
  // Node 的 fetch 接受 TypedArray；显式收窄类型以兼容不同 TS lib 定义。
  new Response(bytes as unknown as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } });

function fakeFetch(queue: QueuedResponse[]) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = async (url: string, init: any) => {
    calls.push({ url: String(url), init });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected fetch: ${String(url)}`);
    if (next.urlIncludes && !String(url).includes(next.urlIncludes)) {
      throw new Error(`unexpected url: ${String(url)}`);
    }
    return next.png ? pngResponse(next.png) : jsonResponse(next.body);
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

const build = (
  fetchImpl: typeof fetch,
  options: { paymentMode?: IntegrationsMode } = {}
) =>
  new WechatMiniProgramAuth({
    appId: 'wx-test-appid',
    appSecret: 'test-secret',
    paymentMode: options.paymentMode || 'mock',
    apiBase: 'https://api.test',
    fetchImpl
  });

const prepayRequest = {
  openId: 'openid-1',
  orderId: 'order-1',
  orderNumber: 'TH-1',
  amountCents: 100,
  description: '时叙 TH-1'
};

describe('微信小程序 live 登录适配', () => {
  it('code2Session 用 js_code 换 openId', async () => {
    const fake = fakeFetch([
      { urlIncludes: '/sns/jscode2session', body: { openid: 'o-1', unionid: 'u-1', session_key: 'sk-1' } }
    ]);
    const auth = build(fake.impl);

    const session = await auth.code2Session(' code-1 ');

    expect(session).toEqual({ openId: 'o-1', unionId: 'u-1', sessionKey: 'sk-1' });
    const url = new URL(fake.calls[0].url);
    expect(url.searchParams.get('appid')).toBe('wx-test-appid');
    expect(url.searchParams.get('secret')).toBe('test-secret');
    expect(url.searchParams.get('js_code')).toBe('code-1');
    expect(url.searchParams.get('grant_type')).toBe('authorization_code');
  });

  it('code2Session 被微信拒绝时带 errcode，绝不返回假身份', async () => {
    const fake = fakeFetch([{ body: { errcode: 40029, errmsg: 'invalid code' } }]);
    const auth = build(fake.impl);

    await expect(auth.code2Session('bad-code')).rejects.toThrow(/40029/);
  });

  it('手机号走 getuserphonenumber，并复用 access_token', async () => {
    const fake = fakeFetch([
      { urlIncludes: '/cgi-bin/stable_token', body: { access_token: 'token-1', expires_in: 7200 } },
      {
        urlIncludes: '/wxa/business/getuserphonenumber',
        body: { errcode: 0, errmsg: 'ok', phone_info: { phoneNumber: '+8613800000000', purePhoneNumber: '13800000000', countryCode: '86' } }
      },
      {
        urlIncludes: '/wxa/business/getuserphonenumber',
        body: { errcode: 0, errmsg: 'ok', phone_info: { purePhoneNumber: '13800000001', countryCode: '86' } }
      }
    ]);
    const auth = build(fake.impl);

    const first = await auth.phoneNumber({ openId: 'o-1', code: 'phone-code-1' });
    const second = await auth.phoneNumber({ openId: 'o-1', code: 'phone-code-2' });

    expect(first).toEqual({ phone: '13800000000', countryCode: '86' });
    expect(second).toEqual({ phone: '13800000001', countryCode: '86' });
    expect(fake.calls.filter((call) => call.url.includes('/cgi-bin/stable_token'))).toHaveLength(1);
    expect(JSON.parse(fake.calls[1].init.body)).toEqual({ code: 'phone-code-1' });
    expect(fake.calls[2].url).toContain('access_token=token-1');
  });

  it('access_token 失效时刷新一次再重试', async () => {
    const fake = fakeFetch([
      { urlIncludes: '/cgi-bin/stable_token', body: { access_token: 'token-1', expires_in: 7200 } },
      { urlIncludes: '/wxa/business/getuserphonenumber', body: { errcode: 42001, errmsg: 'access_token expired' } },
      { urlIncludes: '/cgi-bin/stable_token', body: { access_token: 'token-2', expires_in: 7200 } },
      {
        urlIncludes: '/wxa/business/getuserphonenumber',
        body: { errcode: 0, errmsg: 'ok', phone_info: { purePhoneNumber: '13900000000', countryCode: '86' } }
      }
    ]);
    const auth = build(fake.impl);

    const result = await auth.phoneNumber({ openId: 'o-1', code: 'phone-code' });

    expect(result.phone).toBe('13900000000');
    expect(fake.calls.filter((call) => call.url.includes('/cgi-bin/stable_token'))).toHaveLength(2);
    expect(fake.calls[3].url).toContain('access_token=token-2');
  });

  it('缺少手机号授权 code 时明确报错，不请求微信', async () => {
    const fake = fakeFetch([]);
    const auth = build(fake.impl);

    await expect(auth.phoneNumber({ openId: 'o-1' })).rejects.toThrow(/手机号授权 code/);
    expect(fake.calls).toHaveLength(0);
  });

  it('缺少 AppSecret 时启动即失败', () => {
    expect(
      () =>
        new WechatMiniProgramAuth({
          appId: 'wx-test-appid',
          paymentMode: 'mock'
        })
    ).toThrow(/WECHAT_APPSECRET/);
  });

  it('支付渠道仍为 mock 时 prepay 走模拟回执，并单独报告 prepayMode', async () => {
    const auth = build(fakeFetch([]).impl);
    expect(auth.mode).toBe('live');
    expect(auth.prepayMode).toBe('mock');

    const result = await auth.prepay(prepayRequest);
    expect(result.ok).toBe(true);
  });

  it('支付渠道为 live 但未接商户时诚实失败，不返回假支付参数', async () => {
    const auth = build(fakeFetch([]).impl, { paymentMode: 'live' });
    expect(auth.prepayMode).toBe('live');

    const result = await auth.prepay(prepayRequest);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/未接入|未扣款/);
  });

  it('分享小程序码走 getwxacodeunlimit，返回 PNG base64 并复用 access_token', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const fake = fakeFetch([
      { urlIncludes: '/cgi-bin/stable_token', body: { access_token: 'token-1', expires_in: 7200 } },
      { urlIncludes: '/wxa/getwxacodeunlimit', png }
    ]);
    const auth = build(fake.impl);

    const code = await auth.shareCode({ page: 'pages/index/index', scene: 'share' });

    expect(code).toMatchObject({ contentType: 'image/png', page: 'pages/index/index', scene: 'share' });
    expect(Buffer.from(code.base64, 'base64')).toEqual(Buffer.from(png));
    const url = new URL(fake.calls[1].url);
    expect(url.pathname).toBe('/wxa/getwxacodeunlimit');
    expect(url.searchParams.get('access_token')).toBe('token-1');
    expect(JSON.parse(fake.calls[1].init.body)).toMatchObject({
      page: 'pages/index/index',
      scene: 'share',
      check_path: true,
      env_version: 'release'
    });
  });

  it('分享小程序码默认指向首页，scene 超长会被截断', async () => {
    const fake = fakeFetch([
      { urlIncludes: '/cgi-bin/stable_token', body: { access_token: 'token-1', expires_in: 7200 } },
      { urlIncludes: '/wxa/getwxacodeunlimit', png: new Uint8Array([1]) }
    ]);
    const auth = build(fake.impl);

    const code = await auth.shareCode({ scene: 'x'.repeat(80) });

    expect(code.page).toBe('pages/index/index');
    expect(code.scene).toHaveLength(32);
    expect(JSON.parse(fake.calls[1].init.body).scene).toHaveLength(32);
  });

  it('微信返回错误 JSON 时不冒充图片', async () => {
    const fake = fakeFetch([
      { urlIncludes: '/cgi-bin/stable_token', body: { access_token: 'token-1', expires_in: 7200 } },
      { urlIncludes: '/wxa/getwxacodeunlimit', body: { errcode: 41030, errmsg: 'invalid page' } }
    ]);
    const auth = build(fake.impl);

    await expect(auth.shareCode({ page: 'pages/index/index' })).rejects.toThrow(/41030/);
  });

  it('分享小程序码遇 access_token 失效时刷新后重试一次', async () => {
    const fake = fakeFetch([
      { urlIncludes: '/cgi-bin/stable_token', body: { access_token: 'token-1', expires_in: 7200 } },
      { urlIncludes: '/wxa/getwxacodeunlimit', body: { errcode: 42001, errmsg: 'expired' } },
      { urlIncludes: '/cgi-bin/stable_token', body: { access_token: 'token-2', expires_in: 7200 } },
      { urlIncludes: '/wxa/getwxacodeunlimit', png: new Uint8Array([9, 9]) }
    ]);
    const auth = build(fake.impl);

    const code = await auth.shareCode({});

    expect(Buffer.from(code.base64, 'base64')).toEqual(Buffer.from([9, 9]));
    expect(fake.calls[3].url).toContain('access_token=token-2');
  });

  it('不合法的页面路径直接拒绝，不请求微信', async () => {
    const fake = fakeFetch([]);
    const auth = build(fake.impl);

    await expect(auth.shareCode({ page: 'https://evil.example.com' })).rejects.toThrow(/页面路径/);
    expect(fake.calls).toHaveLength(0);
  });

  it('工厂只在显式声明 live 时启用真实登录，支付保持 mock', () => {
    const config = loadIntegrationsConfig({
      uploadRoot: '/tmp/teahour-wechat-live-test',
      assetUrl: (key) => `https://cdn.test/${key}`,
      env: {
        INTEGRATIONS_WECHAT_MODE: 'live',
        WECHAT_APPSECRET: 'test-secret'
      }
    });
    const integrations = createIntegrations(config);

    expect(integrations.wechat.mode).toBe('live');
    expect(integrations.wechat.prepayMode).toBe('mock');
    expect(integrations.payment.mode).toBe('mock');
  });

  it('live 微信缺少 AppSecret 时工厂抛错，不允许带病启动', () => {
    const config = loadIntegrationsConfig({
      uploadRoot: '/tmp/teahour-wechat-live-test',
      assetUrl: (key) => `https://cdn.test/${key}`,
      env: { INTEGRATIONS_WECHAT_MODE: 'live' }
    });

    expect(() => createIntegrations(config)).toThrow(/WECHAT_APPSECRET/);
  });
});
