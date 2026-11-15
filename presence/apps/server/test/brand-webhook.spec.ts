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
  let links: { findUserId: jest.Mock }
  let perks: { forget: jest.Mock }
  let controller: BrandWebhookController

  beforeEach(() => {
    configure()
    links = { findUserId: jest.fn().mockResolvedValue(null) }
    perks = { forget: jest.fn() }
    controller = new BrandWebhookController(links as never, perks as never)
  })

  afterAll(() => {
    process.env = original
  })

  it('签名正确时确认收到，并按会员号刷新权益缓存', async () => {
    await expect(controller.receive(request())).resolves.toEqual({ ok: true })
    expect(links.findUserId).toHaveBeenCalledWith('FY-1')
    // 未绑定会员号：没有可清的账号，也不该整表清缓存
    expect(perks.forget).not.toHaveBeenCalled()

    links.findUserId.mockResolvedValue('u-1')
    await controller.receive(request())
    expect(perks.forget).toHaveBeenCalledWith('u-1')
  })

  it('反查账号失败不影响确认收到', async () => {
    links.findUserId.mockRejectedValue(new Error('db down'))
    await expect(controller.receive(request())).resolves.toEqual({ ok: true })
    expect(perks.forget).not.toHaveBeenCalled()
  })

  it('签名错误、密钥不匹配、时间戳超窗都拒绝', async () => {
    await expect(controller.receive(request({ signature: 'deadbeef' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    const stale = String(Math.floor(Date.now() / 1000) - 600)
    const body = JSON.stringify({ topic: 'x' })
    await expect(
      controller.receive(
        request({ body, timestamp: stale, signature: signWebhook(SECRET, stale, 'nonce-1', PATH, body) }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    const mismatched = request()
    ;(mismatched as { headers: Record<string, string> }).headers['x-fy-key'] = 'sx-test'
    await expect(controller.receive(mismatched)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('签名按实际请求路径计算，路径不符时拒绝', async () => {
    const body = JSON.stringify({ topic: 'x' })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = signWebhook(SECRET, timestamp, 'nonce-1', '/api/v1/other', body)
    await expect(
      controller.receive(request({ body, timestamp, signature })),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('未配置品牌会员时不接收推送', async () => {
    process.env.BRAND_CRM_ENABLED = '0'
    await expect(controller.receive(request())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })
})