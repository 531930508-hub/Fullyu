import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { BrandWebhookController, signWebhook } from '../src/modules/member/brand-webhook.controller'

const PATH = '/api/v1/hooks/brand-card'
const SECRET = 'test-secret-at-least-16-chars'

const configure = () => {
  process.env.BRAND_CRM_ENABLED = '1'
  process.env.BRAND_CRM_BASE_URL = 'https://crm.example.com'
  process.env.BRAND_CRM_KEY_ID = 'zc-test'
  process.env.BRAND_CRM_SECRET = SECRET
}

const request = (
  options: { path?: string; body?: string; signature?: string; timestamp?: string } = {},
) => {
  const body =
    options.body ??
    JSON.stringify({ topic: 'brand_card.issued', cardId: 'MBC-1', memberNo: 'FY-1' })
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000))
  const nonce = 'nonce-1'
  return {
    headers: {
      'x-fy-key': 'zc-test',
      'x-fy-timestamp': timestamp,
      'x-fy-nonce': nonce,
      'x-fy-signature':
        options.signature ?? signWebhook(SECRET, timestamp, nonce, options.path ?? PATH, body),
    },
    rawBody: Buffer.from(body, 'utf8'),
    originalUrl: options.path ?? PATH,
  } as never
}

describe('CRM 品牌卡推送接收（在场）', () => {
  const original = { ...process.env }
  let controller: BrandWebhookController

  beforeEach(() => {
    configure()
    controller = new BrandWebhookController()
  })

  afterAll(() => {
    process.env = original
  })

  it('签名正确时确认收到', () => {
    expect(controller.receive(request())).toEqual({ ok: true })
  })

  it('签名错误、密钥不匹配、时间戳超窗都拒绝', () => {
    expect(() => controller.receive(request({ signature: 'deadbeef' }))).toThrow(
      UnauthorizedException,
    )
    const stale = String(Math.floor(Date.now() / 1000) - 600)
    const body = JSON.stringify({ topic: 'x' })
    expect(() =>
      controller.receive(
        request({ body, timestamp: stale, signature: signWebhook(SECRET, stale, 'nonce-1', PATH, body) }),
      ),
    ).toThrow(UnauthorizedException)
    const mismatched = request()
    ;(mismatched as { headers: Record<string, string> }).headers['x-fy-key'] = 'sx-test'
    expect(() => controller.receive(mismatched)).toThrow(UnauthorizedException)
  })

  it('签名按实际请求路径计算，路径不符时拒绝', () => {
    const body = JSON.stringify({ topic: 'x' })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = signWebhook(SECRET, timestamp, 'nonce-1', '/api/v1/other', body)
    expect(() => controller.receive(request({ body, timestamp, signature }))).toThrow(
      UnauthorizedException,
    )
  })

  it('未配置品牌会员时不接收推送', () => {
    process.env.BRAND_CRM_ENABLED = '0'
    expect(() => controller.receive(request())).toThrow(ServiceUnavailableException)
  })
})
