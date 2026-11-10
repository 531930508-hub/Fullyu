import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { CrmWebhookController, signWebhook } from './crm-webhook.controller';

const PATH = '/api/hooks/brand-card';
const SECRET = 'test-secret-at-least-16-chars';

const configure = () => {
  process.env.BRAND_CRM_ENABLED = '1';
  process.env.BRAND_CRM_BASE_URL = 'https://crm.example.com';
  process.env.BRAND_CRM_KEY_ID = 'sx-test';
  process.env.BRAND_CRM_SECRET = SECRET;
};

const request = (options: { path?: string; body?: string; signature?: string; timestamp?: string } = {}) => {
  const body = options.body ?? JSON.stringify({ topic: 'brand_card.issued', cardId: 'MBC-1', memberNo: 'FY-1' });
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = 'nonce-1';
  return {
    headers: {
      'x-fy-key': 'sx-test',
      'x-fy-timestamp': timestamp,
      'x-fy-nonce': nonce,
      'x-fy-signature': options.signature ?? signWebhook(SECRET, timestamp, nonce, options.path ?? PATH, body)
    },
    rawBody: body,
    originalUrl: options.path ?? PATH
  } as never;
};

describe('CRM 品牌卡推送接收', () => {
  const original = { ...process.env };
  let controller: CrmWebhookController;

  beforeEach(() => {
    configure();
    controller = new CrmWebhookController();
  });

  afterAll(() => {
    process.env = original;
  });

  it('签名正确时确认收到', () => {
    expect(controller.receive(request())).toEqual({ ok: true });
  });

  it('签名错误、密钥不匹配、时间戳超窗都拒绝', () => {
    expect(() => controller.receive(request({ signature: 'deadbeef' }))).toThrow(UnauthorizedException);
    const stale = String(Math.floor(Date.now() / 1000) - 600);
    expect(() =>
      controller.receive(
        request({ timestamp: stale, signature: signWebhook(SECRET, stale, 'nonce-1', PATH, JSON.stringify({ topic: 'x' })) })
      )
    ).toThrow(UnauthorizedException);
    const mismatched = request();
    (mismatched as { headers: Record<string, string> }).headers['x-fy-key'] = 'zc-test';
    expect(() => controller.receive(mismatched)).toThrow(UnauthorizedException);
  });

  it('签名按实际请求路径计算，路径不符时拒绝', () => {
    // 用另一个路径签名，模拟被代理改写路径的情况。
    const body = JSON.stringify({ topic: 'x' });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signWebhook(SECRET, timestamp, 'nonce-1', '/api/other', body);
    expect(() => controller.receive(request({ body, timestamp, signature }))).toThrow(
      UnauthorizedException
    );
  });

  it('未配置品牌会员时不接收推送', () => {
    process.env.BRAND_CRM_ENABLED = '0';
    expect(() => controller.receive(request())).toThrow(ServiceUnavailableException);
  });
});
