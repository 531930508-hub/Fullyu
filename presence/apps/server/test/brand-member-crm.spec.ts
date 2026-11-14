import { HttpStatus } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { BrandMemberClient } from '../src/common/crm/brand-member.client'
import { readBrandMemberConfig } from '../src/common/crm/brand-member.config'
import { BusinessException } from '../src/common/exceptions/business.exception'
import { BrandMemberController } from '../src/modules/member/brand-member.controller'
import { startFakeBrandCrm, type FakeBrandCrm } from './mocks/brand-crm-fake'

/**
 * 在场接入品牌会员（CRM）的单元测试：
 * - 不连数据库、不连真实 CRM；
 * - 只覆盖配置、签名客户端与顾客端接口层逻辑。
 */

const baseEnv = {
  BRAND_CRM_ENABLED: '1',
  BRAND_CRM_KEY_ID: 'presence-test',
  BRAND_CRM_SECRET: 'brand-secret-0123456789',
}

const configOf = (env: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService

describe('品牌会员配置与客户端（在场）', () => {
  let fake: FakeBrandCrm

  beforeEach(async () => {
    fake = await startFakeBrandCrm({ keyId: 'presence-test', secret: 'brand-secret-0123456789' })
  })

  afterEach(async () => {
    await fake.close()
  })

  it('默认关闭；显式开关优先；缺地址/短密钥/非 HTTPS 生产地址启动即报错', () => {
    expect(readBrandMemberConfig({})).toBeNull()
    expect(
      readBrandMemberConfig({ BRAND_CRM_ENABLED: '0', BRAND_CRM_BASE_URL: fake.url }),
    ).toBeNull()
    // 未写开关但有地址与密钥时视为开启，避免沿用旧部署少配一个变量就静默降级
    expect(
      readBrandMemberConfig({
        BRAND_CRM_BASE_URL: fake.url,
        BRAND_CRM_KEY_ID: 'presence-test',
        BRAND_CRM_SECRET: 'brand-secret-0123456789',
      }),
    ).toMatchObject({ baseUrl: fake.url, timeoutMs: 3000 })
    expect(() =>
      readBrandMemberConfig({ ...baseEnv, BRAND_CRM_BASE_URL: '' }),
    ).toThrow(/BRAND_CRM_BASE_URL/)
    expect(() =>
      readBrandMemberConfig({ ...baseEnv, BRAND_CRM_BASE_URL: fake.url, BRAND_CRM_SECRET: 'short' }),
    ).toThrow(/BRAND_CRM_SECRET/)
    expect(() =>
      readBrandMemberConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        BRAND_CRM_BASE_URL: 'http://crm.example.com',
      }),
    ).toThrow(/HTTPS/)
    expect(
      readBrandMemberConfig({
        ...baseEnv,
        BRAND_CRM_BASE_URL: `${fake.url}/`,
        BRAND_CRM_TIMEOUT_MS: '900',
      }),
    ).toEqual({
      baseUrl: fake.url,
      keyId: 'presence-test',
      secret: 'brand-secret-0123456789',
      timeoutMs: 900,
    })
  })

  it('me 按契约签名、带本地用户与业务标识，且每次 nonce 不同', async () => {
    const client = new BrandMemberClient(configOf({ ...baseEnv, BRAND_CRM_BASE_URL: fake.url }))
    const first = await client.me('u-1')
    const second = await client.me('u-1')

    expect(first.member.memberNo).toBe('FY-TEST-000002')
    expect(first.card.state).toBe('ACTIVE')
    expect(first.points.balance).toBe(500)
    expect(second.card.state).toBe('ACTIVE')

    expect(fake.requests).toHaveLength(2)
    expect(fake.requests.every((item) => item.signatureOk)).toBe(true)
    expect(fake.requests[0].path).toBe(
      '/api/v1/brand-member/me?business=presence&localUserId=u-1',
    )
    expect(fake.requests[0].nonce).not.toBe(fake.requests[1].nonce)
    expect(fake.requests[0].nonce.length).toBeGreaterThanOrEqual(8)
  })

  it('商品与报价由 CRM 定价；报价请求不携带金额', async () => {
    const client = new BrandMemberClient(configOf({ ...baseEnv, BRAND_CRM_BASE_URL: fake.url }))
    const products = await client.products()
    expect(products.products.map((item) => item.code)).toEqual(['FY_MONTH', 'FY_ANNUAL'])

    const quote = await client.quote('u-1', 'FY_ANNUAL')
    expect(quote.priceCents).toBe(29900)
    const sent = JSON.parse(fake.requests[1].body) as Record<string, unknown>
    expect(sent).toEqual({ business: 'presence', localUserId: 'u-1', productCode: 'FY_ANNUAL' })
  })

  it('下单开通只允许服务端调用，并带幂等键与实付金额', async () => {
    const client = new BrandMemberClient(configOf({ ...baseEnv, BRAND_CRM_BASE_URL: fake.url }))
    const result = await client.issue({
      quoteId: 'BCQ-TEST-1',
      orderRef: 'presence:brand:ORDER-1',
      paidCents: 29900,
      paidAt: '2026-11-08T10:00:00+08:00',
    })
    expect(result.card.state).toBe('ACTIVE')
    const sent = JSON.parse(fake.requests[0].body) as Record<string, unknown>
    expect(sent).toMatchObject({ quoteId: 'BCQ-TEST-1', orderRef: 'presence:brand:ORDER-1', paidCents: 29900 })
  })

  it('未开卡时游戏票据返回 403 业务码；档案未同步返回 404；CRM 故障收敛为 503', async () => {
    const client = new BrandMemberClient(configOf({ ...baseEnv, BRAND_CRM_BASE_URL: fake.url }))
    fake.cardState = 'NONE'
    const game = await client.gameTicket('u-1').catch((error) => error)
    expect(game).toBeInstanceOf(BusinessException)
    expect(game).toMatchObject({ bizCode: 4036 })
    expect((game as BusinessException).getStatus()).toBe(HttpStatus.FORBIDDEN)

    const missing = await client.me('missing').catch((error) => error)
    expect(missing).toBeInstanceOf(BusinessException)
    expect(missing).toMatchObject({ bizCode: 4041 })
    expect((missing as BusinessException).getStatus()).toBe(HttpStatus.NOT_FOUND)

    fake.failNext = { status: 500, body: { message: '内部堆栈 /secret' } }
    const failure = await client.me('u-1').catch((error) => error)
    expect(failure).toMatchObject({ bizCode: 5030 })
    expect((failure as Error).message).not.toMatch(/secret/)
  })

  it('关闭时拒绝请求且不访问 CRM', async () => {
    const client = new BrandMemberClient(configOf({}))
    expect(client.enabled).toBe(false)
    const failure = await client.me('u-1').catch((error) => error)
    expect(failure).toMatchObject({ bizCode: 5031 })
    expect((failure as BusinessException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
    expect(fake.requests).toHaveLength(0)
  })
})

describe('在场会员页接口：品牌身份', () => {
  let fake: FakeBrandCrm
  let client: BrandMemberClient

  beforeEach(async () => {
    fake = await startFakeBrandCrm({ keyId: 'presence-test', secret: 'brand-secret-0123456789' })
    client = new BrandMemberClient(configOf({ ...baseEnv, BRAND_CRM_BASE_URL: fake.url }))
  })

  afterEach(async () => {
    await fake.close()
  })

  const controllerOf = () =>
    new BrandMemberController(
      client,
      { forget: jest.fn() } as any,
      {} as any,
      { withLock: (_key: string, fn: () => Promise<unknown>) => fn() } as any,
    )

  it('购买接口如实返回未接入，不生成订单、不调用 CRM', async () => {
    const controller = controllerOf()
    const failure = await controller.purchase({ productCode: 'FY_ANNUAL' }).catch(
      (error) => error,
    )
    expect(failure).toBeInstanceOf(BusinessException)
    expect(failure).toMatchObject({ bizCode: 5034 })
    expect((failure as BusinessException).getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED)
    expect(fake.requests).toHaveLength(0)
  })

  it('商品、报价走 CRM；游戏票据按需换新', async () => {
    const controller = controllerOf()
    const products = await controller.products()
    expect(products.products).toHaveLength(2)

    const quote = await controller.quote({ user: { userId: 'u-1' } }, { productCode: 'FY_MONTH' })
    expect(quote).toMatchObject({ productCode: 'FY_MONTH', priceCents: 4500 })

    const ticket = await controller.gameTicket({ user: { userId: 'u-1' } })
    expect(ticket.url).toContain('crm.test/game')
    expect(fake.requests.map((item) => item.path.split('?')[0])).toEqual([
      '/api/v1/brand-member/products',
      '/api/v1/brand-member/quote',
      '/api/v1/brand-member/game/ticket',
    ])
  })
})
