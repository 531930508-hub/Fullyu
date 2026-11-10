import { ApiError } from '../common/errors';
import { startFakeBrandCrm, type FakeBrandCrm } from '../testing/brand-crm-fake';
import { BrandMemberClient } from './brand-member.client';

const ENV_KEYS = [
  'BRAND_CRM_ENABLED',
  'BRAND_CRM_BASE_URL',
  'BRAND_CRM_KEY_ID',
  'BRAND_CRM_SECRET',
  'BRAND_CRM_TIMEOUT_MS'
] as const;

const saved: Record<string, string | undefined> = {};

describe('BrandMemberClient', () => {
  let fake: FakeBrandCrm;

  beforeAll(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  beforeEach(async () => {
    fake = await startFakeBrandCrm({ keyId: 'sx-test', secret: 'brand-secret-0123456789' });
    process.env.BRAND_CRM_ENABLED = '1';
    process.env.BRAND_CRM_BASE_URL = fake.url;
    process.env.BRAND_CRM_KEY_ID = 'sx-test';
    process.env.BRAND_CRM_SECRET = 'brand-secret-0123456789';
    process.env.BRAND_CRM_TIMEOUT_MS = '800';
  });

  afterEach(async () => {
    await fake.close();
  });

  it('未开启时不发请求，明确返回功能未开启', async () => {
    delete process.env.BRAND_CRM_BASE_URL;
    process.env.BRAND_CRM_ENABLED = '0';
    const client = new BrandMemberClient();
    expect(client.enabled).toBe(false);
    await expect(client.me('C1')).rejects.toMatchObject({
      statusCode: 503,
      code: 'BRAND_MEMBER_DISABLED'
    });
    expect(fake.requests).toHaveLength(0);
  });

  it('me 按 X-Fy 契约签名，绑定登录顾客的本地 id，且每次换新 nonce', async () => {
    const client = new BrandMemberClient();
    const first = await client.me('CUST-100');
    expect(first.card.state).toBe('ACTIVE');
    expect(first.points.balance).toBe(500);
    expect(first.game.enabled).toBe(true);

    await client.me('CUST-100');
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests.every((item) => item.signatureOk)).toBe(true);
    expect(fake.requests[0].path).toBe(
      '/api/v1/brand-member/me?business=teahour&localUserId=CUST-100'
    );
    expect(fake.requests[0].nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(new Set(fake.requests.map((item) => item.nonce)).size).toBe(2);
  });

  it('产品目录与报价只读 CRM 价格，不信任前端传入金额', async () => {
    const client = new BrandMemberClient();
    const products = await client.products();
    expect(products.products.map((item) => item.code)).toEqual(['FY_MONTH', 'FY_ANNUAL']);

    const quote = await client.quote('CUST-200', 'FY_ANNUAL');
    expect(quote.priceCents).toBe(29900);
    const body = JSON.parse(fake.requests[1].body) as Record<string, unknown>;
    expect(body).toMatchObject({
      business: 'teahour',
      localUserId: 'CUST-200',
      productCode: 'FY_ANNUAL'
    });
    expect(body).not.toHaveProperty('priceCents');
  });

  it('开卡带上订单幂等键与支付时间，金额以报价为准', async () => {
    const client = new BrandMemberClient();
    const result = await client.issue({
      quoteId: 'BCQ-TEST-9',
      orderRef: 'teahour:order:9',
      paidCents: 29900,
      paidAt: '2026-11-08T10:42:00+08:00',
      idempotencyKey: 'teahour:order:9'
    });
    expect(result.card.state).toBe('ACTIVE');
    expect(result.card.orderRef).toBe('teahour:order:9');
  });

  it('游戏票据透传；无有效卡时返回 403 GAME_UNAVAILABLE', async () => {
    const client = new BrandMemberClient();
    const ticket = await client.gameTicket('CUST-300');
    expect(ticket.url).toContain('ticket=');

    fake.cardState = 'NONE';
    await expect(client.gameTicket('CUST-300')).rejects.toMatchObject({
      statusCode: 403,
      code: 'GAME_UNAVAILABLE'
    });
  });

  it('尚未同步的会员返回 404，不伪造空卡', async () => {
    const client = new BrandMemberClient();
    await expect(client.me('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'MEMBER_NOT_FOUND'
    });
  });

  it('CRM 故障与超时收敛为 503，不把内部错误甩给顾客', async () => {
    const client = new BrandMemberClient();
    fake.failNext = { status: 500, body: { error: 'SERVER_ERROR', message: 'stacktrace' } };
    const failure = await client.me('CUST-400').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ statusCode: 503, code: 'BRAND_MEMBER_UNAVAILABLE' });
    expect((failure as Error).message).not.toMatch(/stacktrace/);

    fake.delayMs = 1200;
    await expect(client.me('CUST-401')).rejects.toMatchObject({
      statusCode: 503,
      code: 'BRAND_MEMBER_UNAVAILABLE'
    });
  });
});
