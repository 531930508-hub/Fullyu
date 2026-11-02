import type {
  DeviceStatus,
  MiniProgramAuthProvider,
  MiniProgramSession,
  PhoneNumberRequest,
  PhoneNumberResult,
  PrepayRequest,
  PrepayResult,
  ShareCodeRequest,
  ShareCodeResult
} from '../../contracts';
import { MockMiniProgramAuth } from '../mock/wechat';

/**
 * 微信小程序真实适配：登录态（jscode2session）与手机号（getuserphonenumber）。
 *
 * 支付不在这里冒充：prepay 只按 paymentMode 决定，支付渠道仍是 mock 时走模拟回执，
 * 并在 prepayMode 上如实标注；支付渠道为 live/disabled 时诚实失败，不返回假支付参数。
 *
 * 凭证只从环境变量注入，任何日志、状态与错误信息都不包含 AppSecret。
 */
export type WechatLiveOptions = {
  appId: string;
  appSecret?: string;
  /** 支付渠道模式（INTEGRATIONS_PAYMENT_MODE / 全局模式）。 */
  paymentMode?: string;
  /** 默认 https://api.weixin.qq.com，测试可注入。 */
  apiBase?: string;
  fetchImpl?: typeof fetch;
  /** 45011 退避时长，测试可置 0。 */
  quotaRetryDelayMs?: number;
};

type WechatJson = {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
  openid?: string;
  unionid?: string;
  session_key?: string;
  phone_info?: {
    phoneNumber?: string;
    purePhoneNumber?: string;
    countryCode?: string;
  };
};

/** access_token 失效类错误：刷新后重试一次。 */
const TOKEN_ERROR_CODES = new Set([40001, 40014, 42001, 40003]);

/**
 * 微信分钟级频率限制（45011）：多为瞬时抖动，退避一次通常即可恢复。
 * 只重试一次；持续限流仍如实抛出，由上层映射为 429。
 */
const QUOTA_ERROR_CODES = new Set([45011]);
const DEFAULT_QUOTA_RETRY_DELAY_MS = 400;

/** 小程序码 scene 上限 32 个可见字符；分享只需要一个轻量标识。 */
const SCENE_MAX = 32;
/** 小程序码默认页面：时叙只有一个入口页。 */
const DEFAULT_SHARE_PAGE = 'pages/index/index';
/** 页面路径只允许小程序内部路径，避免把任意地址交给微信生成。 */
const PAGE_PATTERN = /^pages\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

const trim = (value: string | undefined | null): string => String(value ?? '').trim();

export class WechatMiniProgramAuth implements MiniProgramAuthProvider {
  readonly name = 'weixin-miniprogram-live';
  readonly mode = 'live';
  readonly appId: string;
  readonly prepayMode: string;

  private readonly appSecret: string;
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;
  private readonly quotaRetryDelayMs: number;
  private readonly mockPrepay: MockMiniProgramAuth;

  private tokenPromise: Promise<string> | null = null;
  private tokenExpiresAt = 0;

  constructor(options: WechatLiveOptions) {
    const appId = trim(options.appId);
    const appSecret = trim(options.appSecret);
    if (!appId) {
      throw new Error('[integrations] 微信 live 模式缺少 WECHAT_APPID：无法调用微信开放接口');
    }
    if (!appSecret) {
      throw new Error('[integrations] 微信 live 模式缺少 WECHAT_APPSECRET：请在部署环境配置小程序密钥');
    }
    this.appId = appId;
    this.appSecret = appSecret;
    this.prepayMode = trim(options.paymentMode) || 'mock';
    this.apiBase = (options.apiBase || 'https://api.weixin.qq.com').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl || fetch;
    this.quotaRetryDelayMs = Math.max(0, Number(options.quotaRetryDelayMs ?? DEFAULT_QUOTA_RETRY_DELAY_MS));
    this.mockPrepay = new MockMiniProgramAuth({ appId });
  }

  async code2Session(code: string): Promise<MiniProgramSession> {
    const jsCode = trim(code);
    if (!jsCode) throw new Error('微信登录失败：缺少 wx.login 返回的 code');

    const url = new URL(`${this.apiBase}/sns/jscode2session`);
    url.searchParams.set('appid', this.appId);
    url.searchParams.set('secret', this.appSecret);
    url.searchParams.set('js_code', jsCode);
    url.searchParams.set('grant_type', 'authorization_code');

    let data = await this.readJson(await this.request(url.toString(), { method: 'GET' }), '微信登录');
    if (data.errcode && QUOTA_ERROR_CODES.has(data.errcode)) {
      // 被配额拒绝的 code 并未被消费，退避后用同一 code 重试一次。
      await this.waitQuota();
      data = await this.readJson(await this.request(url.toString(), { method: 'GET' }), '微信登录');
    }
    if (data.errcode) throw new Error(`微信登录失败（${data.errcode}）：${data.errmsg || '未知错误'}`);
    const openId = trim(data.openid);
    if (!openId) throw new Error('微信登录失败：微信未返回 openId');

    return {
      openId,
      unionId: trim(data.unionid) || undefined,
      sessionKey: trim(data.session_key) || undefined
    };
  }

  async phoneNumber(request: PhoneNumberRequest): Promise<PhoneNumberResult> {
    const phoneCode = trim(request.code);
    if (!phoneCode) {
      throw new Error('缺少手机号授权 code：请在小程序内使用 getPhoneNumber 授权后登录');
    }

    const payload = JSON.stringify({ code: phoneCode });
    let data = await this.requestPhone(payload);
    if (data.errcode && QUOTA_ERROR_CODES.has(data.errcode)) {
      await this.waitQuota();
      data = await this.requestPhone(payload);
    }
    if (data.errcode && TOKEN_ERROR_CODES.has(data.errcode)) {
      await this.accessToken(true);
      data = await this.requestPhone(payload);
    }
    if (data.errcode) {
      throw new Error(`微信手机号获取失败（${data.errcode}）：${data.errmsg || '未知错误'}`);
    }

    const info = data.phone_info || {};
    const phone = trim(info.purePhoneNumber) || trim(info.phoneNumber).replace(/^\+?86/, '');
    if (!phone) throw new Error('微信手机号获取失败：微信未返回手机号');

    return { phone, countryCode: trim(info.countryCode) || undefined };
  }

  /**
   * 分享海报用小程序码（getUnlimited）：返回 PNG 字节，前端自己合成海报。
   * 页面必须是已发布页面，否则微信返回 41030；错误如实抛出，不拿普通二维码顶替。
   */
  async shareCode(request: ShareCodeRequest): Promise<ShareCodeResult> {
    const page = trim(request.page) || DEFAULT_SHARE_PAGE;
    if (!PAGE_PATTERN.test(page)) throw new Error('分享页面路径不合法：请填写小程序内页面路径，如 pages/index/index');

    const scene = (trim(request.scene) || 'share').slice(0, SCENE_MAX);
    const width = Math.min(Math.max(Math.round(Number(request.width) || 430), 280), 1280);
    const payload = JSON.stringify({
      scene,
      page,
      check_path: true,
      env_version: 'release',
      width,
      auto_color: false,
      // 与品牌棕一致，避免默认纯黑。
      line_color: { r: 88, g: 65, b: 25 },
      is_hyaline: false
    });

    let result = await this.requestShareCode(payload);
    if (result.errcode && TOKEN_ERROR_CODES.has(result.errcode)) {
      await this.accessToken(true);
      result = await this.requestShareCode(payload);
    }
    if (result.errcode) {
      throw new Error(`微信小程序码生成失败（${result.errcode}）：${result.errmsg || '未知错误'}`);
    }
    if (!result.png || result.png.length === 0) {
      throw new Error('微信小程序码生成失败：微信未返回图片');
    }

    return { contentType: 'image/png', base64: result.png.toString('base64'), page, scene };
  }

  async prepay(request: PrepayRequest): Promise<PrepayResult> {
    if (this.prepayMode === 'mock') return this.mockPrepay.prepay(request);
    if (this.prepayMode === 'disabled') {
      return { ok: false, error: '微信支付未启用（disabled），本次未扣款' };
    }
    return { ok: false, error: '微信支付尚未接入：live 模式需完成商户号与证书配置，本次未扣款' };
  }

  async status(): Promise<DeviceStatus> {
    return {
      online: true,
      mode: this.mode,
      detail:
        this.prepayMode === 'mock'
          ? `AppID ${this.appId} 已启用真实微信登录与手机号；支付仍为 mock，不产生真实扣款`
          : `AppID ${this.appId} 已启用真实微信登录与手机号；支付渠道为 ${this.prepayMode}`
    };
  }

  /**
   * 微信在小程序码接口成功时直接返回 PNG 字节，出错时仍返回 JSON。
   * 这里按首字节区分，错误 JSON 绝不当成图片返回。
   */
  private async requestShareCode(
    payload: string
  ): Promise<{ errcode?: number; errmsg?: string; png?: Buffer }> {
    const token = await this.accessToken();
    const url = `${this.apiBase}/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`;
    const response = await this.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return {};
    if (buffer[0] === 0x7b) {
      try {
        return JSON.parse(buffer.toString('utf8')) as { errcode?: number; errmsg?: string };
      } catch (error) {
        return {};
      }
    }
    return { png: buffer };
  }

  /** 45011 退避：等待时间很短，顾客无感知，只用于吸收分钟级配额的瞬时抖动。 */
  private waitQuota(): Promise<void> {
    if (this.quotaRetryDelayMs <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, this.quotaRetryDelayMs));
  }

  private async requestPhone(payload: string): Promise<WechatJson> {
    const token = await this.accessToken();
    const url = `${this.apiBase}/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`;
    return this.readJson(
      await this.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload }),
      '微信手机号'
    );
  }

  /**
   * 全局接口调用凭证：缓存到过期前 5 分钟，并发请求复用同一个 Promise。
   * force=true 用于 access_token 失效后的强制刷新。
   */
  private async accessToken(force = false): Promise<string> {
    if (force) {
      this.tokenPromise = null;
      this.tokenExpiresAt = 0;
    }
    if (this.tokenPromise && Date.now() < this.tokenExpiresAt) return this.tokenPromise;

    const pending = this.requestToken();
    this.tokenPromise = pending;
    try {
      return await pending;
    } catch (error) {
      if (this.tokenPromise === pending) {
        this.tokenPromise = null;
        this.tokenExpiresAt = 0;
      }
      throw error;
    }
  }

  private async requestToken(): Promise<string> {
    const data = await this.readJson(
      await this.request(`${this.apiBase}/cgi-bin/stable_token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ grant_type: 'client_credential', appid: this.appId, secret: this.appSecret })
      }),
      '微信 access_token'
    );
    if (data.errcode) {
      throw new Error(`微信 access_token 获取失败（${data.errcode}）：${data.errmsg || '未知错误'}`);
    }
    const token = trim(data.access_token);
    if (!token) throw new Error('微信 access_token 获取失败：微信未返回凭证');

    const expiresIn = Number(data.expires_in);
    const ttlMs = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 7200 * 1000;
    this.tokenExpiresAt = Date.now() + Math.max(ttlMs - 300 * 1000, 60 * 1000);
    return token;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (error) {
      throw new Error(`微信接口连接失败：${(error as Error).message || '网络异常'}`);
    }
    if (!response.ok) throw new Error(`微信接口返回 HTTP ${response.status}`);
    return response;
  }

  private async readJson(response: Response, label: string): Promise<WechatJson> {
    try {
      return (await response.json()) as WechatJson;
    } catch (error) {
      throw new Error(`${label}失败：微信返回内容无法解析`);
    }
  }
}
