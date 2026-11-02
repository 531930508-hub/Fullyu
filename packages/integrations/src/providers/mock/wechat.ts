import { createHash, randomBytes } from 'node:crypto';
import type {
  DeviceStatus,
  MiniProgramAuthProvider,
  MiniProgramSession,
  PhoneNumberRequest,
  PhoneNumberResult,
  PrepayRequest,
  PrepayResult
} from '../../contracts';
import { wait } from './util';

export type MockWechatOptions = {
  appId: string;
};

/**
 * 内置微信小程序能力（登录态 / 手机号 / JSAPI 支付）。
 *
 * 真实实现需要：
 * - code2Session：用 AppSecret 调 auth.code2Session 换 openId / unionId / session_key；
 * - phoneNumber：用 session_key 解密 getPhoneNumber 的 encryptedData + iv；
 * - prepay：商户号与商户证书做 JSAPI 下单，返回 wx.requestPayment 参数，回调走 PaymentGateway.handleCallback。
 *
 * 本实现不持有任何真实凭证：openId 由 code 哈希派生，保证同一 code 稳定映射同一顾客。
 */
export class MockMiniProgramAuth implements MiniProgramAuthProvider {
  readonly name = 'mock-weixin-miniprogram';
  readonly mode = 'mock';
  readonly prepayMode = 'mock';
  readonly appId: string;

  constructor(options: MockWechatOptions) {
    this.appId = options.appId;
  }

  async code2Session(code: string): Promise<MiniProgramSession> {
    await wait(10);
    const normalized = String(code || '').trim();
    const digest = createHash('sha256').update(`${this.appId}:${normalized || 'anonymous'}`).digest('hex');
    return {
      openId: `mock_${digest.slice(0, 24)}`,
      unionId: undefined,
      sessionKey: digest.slice(24, 48)
    };
  }

  async phoneNumber(request: PhoneNumberRequest): Promise<PhoneNumberResult> {
    await wait(10);
    const digest = createHash('sha256').update(`phone:${request.openId}`).digest('hex');
    // 11 位模拟号码：3 位号段 + 8 位尾号，同一 openId 稳定复现，但不对应任何真实手机号。
    const prefixes = ['130', '138', '150', '159', '176', '188', '199'];
    const prefix = prefixes[parseInt(digest.slice(0, 2), 16) % prefixes.length];
    const tail = (parseInt(digest.slice(2, 10), 16) % 100000000).toString().padStart(8, '0');
    return { phone: `${prefix}${tail}`, countryCode: '86' };
  }

  async prepay(request: PrepayRequest): Promise<PrepayResult> {
    await wait(15);
    if (request.amountCents <= 0) return { ok: false, error: '支付金额不正确' };
    const nonceStr = randomBytes(8).toString('hex');
    return {
      ok: true,
      payment: {
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr,
        package: `prepay_id=mock_${request.orderNumber}_${nonceStr.slice(0, 6)}`,
        signType: 'RSA',
        paySign: createHash('sha256')
          .update(`${this.appId}:${request.orderId}:${request.amountCents}:${nonceStr}`)
          .digest('base64')
      }
    };
  }

  async status(): Promise<DeviceStatus> {
    return {
      online: true,
      mode: this.mode,
      detail: `AppID ${this.appId} 已写入小程序配置；登录态、手机号与支付待配置 AppSecret 与商户证书后启用`
    };
  }
}
