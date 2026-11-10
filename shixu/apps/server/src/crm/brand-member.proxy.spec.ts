import { createHarness, type Harness } from '../testing/harness';
import { startFakeBrandCrm, type FakeBrandCrm } from '../testing/brand-crm-fake';
import { BrandOrderReporter } from './brand-order.reporter';

const ENV_KEYS = [
  'CRM_ENABLED',
  'BRAND_CRM_ENABLED',
  'BRAND_CRM_BASE_URL',
  'BRAND_CRM_KEY_ID',
  'BRAND_CRM_SECRET',
  'BRAND_CRM_TIMEOUT_MS'
] as const;

const saved: Record<string, string | undefined> = {};

/**
 * 时叙 × 品牌会员 CRM 代理（E1 本地）：
 * 小程序只访问本服务；签名密钥留在服务端，身份固定取当前登录顾客。
 */
describe('顾客品牌会员代理', () => {
  let h: Harness;
  let fake: FakeBrandCrm;

  beforeAll(async () => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    fake = await startFakeBrandCrm({ keyId: 'sx-test', secret: 'brand-secret-0123456789' });
    process.env.CRM_ENABLED = '0';
    process.env.BRAND_CRM_ENABLED = '1';
    process.env.BRAND_CRM_BASE_URL = fake.url;
    process.env.BRAND_CRM_KEY_ID = 'sx-test';
    process.env.BRAND_CRM_SECRET = 'brand-secret-0123456789';
    process.env.BRAND_CRM_TIMEOUT_MS = '800';
    h = await createHarness();
  });

  afterAll(async () => {
    await h?.close();
    await fake?.close();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('未登录不能读取品牌会员身份', async () => {
    const res = await h.api('get', '/customer/brand-member/me');
    expect(res.status).toBe(401);
    expect(fake.requests).toHaveLength(0);
  });

  it('身份页使用登录顾客的本地 id，不把手机号或密钥带到前端', async () => {
    const customer = await h.customer('品牌会员茶客');
    const res = await h.api('get', '/customer/brand-member/me', customer.token);
    expect(res.status).toBe(200);
    expect(res.body.card.state).toBe('ACTIVE');
    expect(res.body.member.memberNo).toBe('FY-TEST-000001');
    expect(res.body.points.balance).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/brand-secret|sx-test|139/);

    const last = fake.requests[fake.requests.length - 1];
    expect(last.signatureOk).toBe(true);
    expect(last.path).toBe(
      `/api/v1/brand-member/me?business=teahour&localUserId=${encodeURIComponent(customer.id)}`
    );
  });

  it('产品目录价格来自 CRM，报价不接收前端金额', async () => {
    const customer = await h.customer('报价茶客');
    const products = await h.api('get', '/customer/brand-member/products', customer.token);
    expect(products.status).toBe(200);
    expect(products.body.products[1]).toMatchObject({ code: 'FY_ANNUAL', priceCents: 29900 });

    const quote = await h.api('post', '/customer/brand-member/quote', customer.token, {
      productCode: 'FY_ANNUAL',
      priceCents: 1
    });
    expect(quote.status).toBe(201);
    expect(quote.body.priceCents).toBe(29900);

    const body = JSON.parse(fake.requests[fake.requests.length - 1].body) as Record<string, unknown>;
    expect(body).toMatchObject({
      business: 'teahour',
      localUserId: customer.id,
      productCode: 'FY_ANNUAL'
    });
    expect(body).not.toHaveProperty('priceCents');
  });

  it('支付通道未接入时明确拒绝开通，不调用 CRM 开卡', async () => {
    const customer = await h.customer('购买茶客');
    const before = fake.requests.length;
    const res = await h.api('post', '/customer/brand-member/purchase', customer.token, {
      productCode: 'FY_ANNUAL'
    });
    expect(res.status).toBe(501);
    expect(res.body.error).toBe('PAYMENT_NOT_ENABLED');
    expect(fake.requests.length).toBe(before);
  });

  it('愈行之旅票据由服务端换取；无有效卡时不伪造可玩', async () => {
    const customer = await h.customer('游戏茶客');
    const ticket = await h.api('post', '/customer/brand-member/game/ticket', customer.token);
    expect(ticket.status).toBe(201);
    expect(ticket.body.url).toContain('ticket=');

    fake.cardState = 'NONE';
    const blocked = await h.api('post', '/customer/brand-member/game/ticket', customer.token);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('GAME_UNAVAILABLE');
  });

  it('身份页透出骰子进度、续费提醒与提货券，权益不再写死每杯立减', async () => {
    fake.cardState = 'ACTIVE';
    const customer = await h.customer('进度茶客');
    const res = await h.api('get', '/customer/brand-member/me', customer.token);
    expect(res.status).toBe(200);
    expect(res.body.dice.progress).toMatchObject({ remainingCents: 6000, percent: 80 });
    expect(res.body.dice.progress.headline).toContain('再消费');
    expect(res.body.vouchers[0]).toMatchObject({ code: 'PV-TEST-0001', status: 'ISSUED' });
    expect(JSON.stringify(res.body.benefits)).not.toMatch(/每杯立减/);
  });

  it('会员码兑换：身份固定为登录顾客，格式先在本服务校验，CRM 文案原样透出', async () => {
    const customer = await h.customer('会员码茶客');
    const bad = await h.api('post', '/customer/brand-member/gift/claim', customer.token, { code: '!!' });
    expect(bad.status).toBe(400);

    const before = fake.requests.length;
    const ok = await h.api('post', '/customer/brand-member/gift/claim', customer.token, {
      code: ' welcome30 ',
      localUserId: 'someone-else'
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ days: 30, replayed: false });
    expect(fake.requests.length).toBe(before + 1);
    const sent = JSON.parse(fake.requests[fake.requests.length - 1].body) as Record<string, unknown>;
    expect(sent).toEqual({ localUserId: customer.id, code: 'WELCOME30' });

    const again = await h.api('post', '/customer/brand-member/gift/claim', customer.token, { code: 'WELCOME30' });
    expect(again.body.replayed).toBe(true);

    const full = await h.api('post', '/customer/brand-member/gift/claim', customer.token, { code: 'FULL0001' });
    expect(full.status).toBe(409);
    expect(full.body.error).toBe('GIFT_CODE_FULL');
    expect(full.body.message).toContain('已满');

    const invalid = await h.api('post', '/customer/brand-member/gift/claim', customer.token, { code: 'NOPE1234' });
    expect(invalid.status).toBe(404);
    expect(invalid.body.error).toBe('GIFT_CODE_INVALID');
  });

  it('意见反馈与会员故事只对会员开放；非会员拿到明确提示', async () => {
    fake.cardState = 'ACTIVE';
    const customer = await h.customer('反馈茶客');
    const short = await h.api('post', '/customer/brand-member/feedback', customer.token, { content: '好' });
    expect(short.status).toBe(400);

    const ok = await h.api('post', '/customer/brand-member/feedback', customer.token, {
      content: '希望周末多开一个晚场',
      allowQuote: true
    });
    expect(ok.status).toBe(201);
    expect(fake.feedback[fake.feedback.length - 1]).toEqual({
      localUserId: customer.id,
      content: '希望周末多开一个晚场',
      allowQuote: true
    });

    const stories = await h.api('get', '/customer/brand-member/stories', customer.token);
    expect(stories.status).toBe(200);
    expect(stories.body.stories[0].title).toBe('下班后的一小时');
    expect(fake.requests[fake.requests.length - 1].path).toBe(
      `/api/v1/brand-member/stories?localUserId=${encodeURIComponent(customer.id)}`
    );

    fake.cardState = 'NONE';
    const blocked = await h.api('get', '/customer/brand-member/stories', customer.token);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('MEMBERS_ONLY');
    fake.cardState = 'ACTIVE';
  });

  it('订单上报：已付款订单报实付、退款报累计；CRM 不可用时不记为已上报', async () => {
    const reporter = h.app.get(BrandOrderReporter);
    const buyer = await h.customer('上报茶客');
    const missing = await h.customer('未建档茶客');
    fake.missingMembers.add(missing.id);
    const now = new Date();
    const base = {
      business: 'fresh',
      storeId: 'brand',
      channel: 'mini',
      type: 'dine',
      status: 'delivered',
      paymentStatus: 'paid',
      createdAt: now,
      paidAt: now
    };
    await h.prisma.order.createMany({
      data: [
        { ...base, id: 'ORD-RPT-1', number: 'RPT-1', totalCents: 18000, customerId: buyer.id },
        { ...base, id: 'ORD-RPT-2', number: 'RPT-2', totalCents: 4200, refundedCents: 1200, customerId: buyer.id },
        { ...base, id: 'ORD-RPT-3', number: 'RPT-3', totalCents: 0, customerId: buyer.id, parentOrderId: 'ORD-RPT-1' },
        { ...base, id: 'ORD-RPT-4', number: 'RPT-4', totalCents: 3000, paymentStatus: 'unpaid', paidAt: null, customerId: buyer.id },
        { ...base, id: 'ORD-RPT-5', number: 'RPT-5', totalCents: 2600, customerId: missing.id }
      ]
    });

    // 首轮 CRM 不可用：一单都不应被视为已上报。
    fake.failNext = { status: 503, body: { error: 'SERVER_ERROR' } };
    const down = await reporter.runOnce(now);
    expect(down.failed).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 6; i += 1) await reporter.runOnce(now);
    expect(fake.orders.get('ORD-RPT-1')).toMatchObject({ localUserId: buyer.id, paidCents: 18000, refundCents: 0 });
    expect(fake.orders.get('ORD-RPT-2')).toMatchObject({ paidCents: 4200, refundCents: 1200 });
    expect(fake.orders.has('ORD-RPT-3')).toBe(false);
    expect(fake.orders.has('ORD-RPT-4')).toBe(false);
    expect(fake.orders.has('ORD-RPT-5')).toBe(false);

    // 无变化不重复请求；退款累加后再报累计值。
    const before = fake.requests.filter((r) => r.body.includes('ORD-RPT')).length;
    await reporter.runOnce(now);
    const after = fake.requests.filter((r) => r.body.includes('ORD-RPT')).length;
    expect(after).toBe(before);

    await h.prisma.order.update({ where: { id: 'ORD-RPT-2' }, data: { refundedCents: 4200, status: 'refunded' } });
    await reporter.runOnce(now);
    expect(fake.orders.get('ORD-RPT-2')).toMatchObject({ refundCents: 4200 });
    const refundCall = fake.requests.filter((r) => r.path === '/api/v1/brand-member/orders/refund').pop();
    expect(JSON.parse(refundCall!.body)).toMatchObject({ orderRef: 'ORD-RPT-2', refundCents: 4200, localUserId: buyer.id });
  });

  it('CRM 故障返回 503，不把内部错误透给顾客', async () => {
    const customer = await h.customer('故障茶客');
    fake.failNext = { status: 500, body: { error: 'SERVER_ERROR', message: '内部堆栈' } };
    const res = await h.api('get', '/customer/brand-member/me', customer.token);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('BRAND_MEMBER_UNAVAILABLE');
    expect(res.body.message).not.toMatch(/内部堆栈/);
  });

  it('未开启品牌会员时返回明确错误，不返回合成身份', async () => {
    const customer = await h.customer('未开启茶客');
    process.env.BRAND_CRM_ENABLED = '0';
    // 配置在应用启动时读取：另起一个应用验证关闭态，避免影响本套件其他用例。
    const off = await createHarness();
    try {
      const login = await off.customer('关闭态茶客');
      const res = await off.api('get', '/customer/brand-member/me', login.token);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('BRAND_MEMBER_DISABLED');
    } finally {
      await off.close();
      process.env.BRAND_CRM_ENABLED = '1';
    }
  });
});
