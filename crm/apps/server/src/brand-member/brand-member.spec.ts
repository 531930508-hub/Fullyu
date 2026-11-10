import { createHash, createHmac } from 'node:crypto';
import request from 'supertest';
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

/**
 * 三端品牌会员契约 v1（本地联调）。
 * 签名串：timestamp\nnonce\nMETHOD\n完整路径（含 /api 与查询串）\nsha256hex(rawBody)
 */
const SECRETS = {
  'ql-test': { business: 'ql', secret: 'ql-secret-for-jest-0001' },
  'sx-test': { business: 'sx', secret: 'sx-secret-for-jest-0002' },
  'zc-test': { business: 'zc', secret: 'zc-secret-for-jest-0003' }
} as const;

type KeyName = keyof typeof SECRETS;

process.env.CRM_EXT_KEYS = JSON.stringify(SECRETS);
process.env.CRM_GAME_URL = 'https://game.test/play';

const signFy = (
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  url: string,
  rawBody: string
): string => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${url}\n${bodyHash}`, 'utf8')
    .digest('hex');
};

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('CRM 1C：品牌会员签名接口、卡期与愈行之旅', () => {
  let h: Harness;
  let admin: string;
  let cs: string;
  let finance: string;
  let nonceSeq = 0;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.admin);
    cs = await h.login(ACCOUNTS.cs);
    finance = await h.login(ACCOUNTS.finance);
  });

  afterAll(async () => {
    await h.close();
  });

  const server = () => h.app.getHttpServer();
  const nonce = () => `n-${Date.now()}-${++nonceSeq}`;

  type SignedOptions = {
    body?: unknown;
    key?: KeyName | 'unknown';
    timestamp?: number;
    nonce?: string;
    signature?: string;
    headers?: Record<string, string>;
  };

  const signed = (
    method: 'get' | 'post',
    url: string,
    options: SignedOptions = {}
  ) => {
    const key = options.key || 'sx-test';
    const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
    const nonceValue = options.nonce ?? nonce();
    const raw = options.body === undefined ? '' : JSON.stringify(options.body);
    const secret = key === 'unknown' ? 'unknown-secret-value' : SECRETS[key].secret;
    const signature =
      options.signature ?? signFy(secret, timestamp, nonceValue, method, `/api${url}`, raw);
    let req = request(server())
      [method](`/api${url}`)
      .set('x-fy-key', key)
      .set('x-fy-timestamp', timestamp)
      .set('x-fy-nonce', nonceValue)
      .set('x-fy-signature', signature);
    for (const [name, value] of Object.entries(options.headers || {})) req = req.set(name, value);
    if (options.body !== undefined) {
      req = req.set('Content-Type', 'application/json').send(options.body as object);
    }
    return req;
  };

  const me = (key: KeyName, business: string, localUserId: string) =>
    signed('get', `/v1/brand-member/me?business=${business}&localUserId=${localUserId}`, { key });

  it('签名缺失、错误、过期、未知密钥与 nonce 重放均拒绝', async () => {
    const missing = await request(server()).get(
      '/api/v1/brand-member/me?business=teahour&localUserId=local-m-lin'
    );
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe('INVALID_SIGNATURE');

    const wrong = await signed('get', '/v1/brand-member/me?business=teahour&localUserId=local-m-lin', {
      signature: 'deadbeef'
    });
    expect(wrong.status).toBe(401);

    const stale = await signed(
      'get',
      '/v1/brand-member/me?business=teahour&localUserId=local-m-lin',
      { timestamp: Math.floor(Date.now() / 1000) - 600 }
    );
    expect(stale.status).toBe(401);

    const unknown = await signed(
      'get',
      '/v1/brand-member/me?business=teahour&localUserId=local-m-lin',
      { key: 'unknown' }
    );
    expect(unknown.status).toBe(401);

    const reused = nonce();
    const first = await signed(
      'get',
      '/v1/brand-member/me?business=teahour&localUserId=local-m-lin',
      { nonce: reused }
    );
    expect(first.status).toBe(200);
    const replay = await signed(
      'get',
      '/v1/brand-member/me?business=teahour&localUserId=local-m-lin',
      { nonce: reused }
    );
    expect(replay.status).toBe(409);
    expect(replay.body.error).toBe('REPLAYED');
  });

  it('me 返回脱敏身份、年卡、积分、权益与一次性游戏票据', async () => {
    const res = await me('sx-test', 'teahour', 'local-m-lin');
    expect(res.status).toBe(200);
    expect(res.body.member.memberNo).toBe('FY-2602-008812');
    expect(res.body.member.name).toBe('林小满');
    expect(res.body.member.phoneMasked).toBe('138****6620');

    expect(res.body.card.state).toBe('ACTIVE');
    expect(res.body.card.productCode).toBe('FY_ANNUAL');
    expect(res.body.card.productName).toBe('Full愈年卡');
    expect(res.body.card.priceCents).toBe(29900);
    expect(res.body.card.soldBy).toBe('retreat');
    expect(res.body.card.soldByName).toBe('轻疗');
    expect(res.body.card.remainingDays).toBeGreaterThan(300);
    expect(res.body.card.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.card.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(res.body.points.balance).toBe(500);
    expect(res.body.points.spend.retreat).toBe('1_point_1_yuan');
    expect(res.body.points.spend.teahour).toBe('display_only');
    expect(res.body.points.spend.presence).toBe('display_only');

    expect(res.body.dice).toMatchObject({ balance: 12, station: 8, monthlyEarned: 12 });
    // 种子累计 12000 分，距下一颗还差 ¥180，落在第二档 → 建议去在场上一节课。
    expect(res.body.dice.progress).toMatchObject({
      perDieCents: 30000,
      progressCents: 12000,
      remainingCents: 18000
    });
    expect(res.body.dice.progress.headline).toContain('180');
    expect(res.body.dice.progress.tip.business).toBe('zc');
    expect(res.body.prizes).toEqual({ pending: 0 });
    // 节省金额来自消费账本：6000 + 0 + 2000。
    expect(res.body.savedCents).toBe(8000);
    expect(res.body.renewal).toEqual({ show: false });
    expect(res.body.vouchers.map((v: { code: string }) => v.code)).toContain('FYG8K2QM');
    expect(res.body.perks.presence.prioritySeat).toBe(true);
    expect(res.body.benefits).toHaveLength(3);
    expect(res.body.benefits.map((b: { business: string }) => b.business).sort()).toEqual([
      'presence',
      'retreat',
      'teahour'
    ]);
    expect(res.body.businessCards).toEqual([]);
    expect(res.body.game.enabled).toBe(true);
    expect(res.body.game.dice).toBe(12);
    expect(res.body.game.url).toContain('https://game.test/play');
    expect(res.body.game.url).toContain('host=teahour');
    expect(res.body.game.url).toContain('ticket=');
    expect(res.body.stale).toBe(false);
    expect(res.body.updatedAt).toMatch(/\+08:00$/);

    const ticket = new URL(res.body.game.url).searchParams.get('ticket') || '';
    expect(ticket.length).toBeGreaterThan(20);
    const stored = await h.prisma.gameTicket.findFirst({
      where: { tokenHash: sha256(ticket) }
    });
    expect(stored).not.toBeNull();
    expect(stored!.tokenHash).not.toBe(ticket);
  });

  it('密钥与业务绑定：跨业务读取、跨业务本地用户均拒绝', async () => {
    const mismatch = await me('zc-test', 'teahour', 'local-m-su');
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.error).toBe('BUSINESS_MISMATCH');

    const crossUser = await me('zc-test', 'presence', 'local-m-lin');
    expect(crossUser.status).toBe(404);
    expect(crossUser.body.error).toBe('MEMBER_NOT_FOUND');

    const badBusiness = await me('zc-test', 'nope', 'local-m-su');
    expect(badBusiness.status).toBe(400);
  });

  it('无品牌卡会员返回 NONE，不伪造权益与游戏资格', async () => {
    const res = await me('ql-test', 'retreat', 'local-m-tang');
    expect(res.status).toBe(200);
    expect(res.body.card).toEqual({ state: 'NONE' });
    expect(res.body.points.balance).toBe(0);
    expect(res.body.benefits).toEqual([]);
    expect(res.body.businessCards).toEqual([]);
    expect(res.body.game.enabled).toBe(false);
    expect(res.body.game.url).toBeNull();
  });

  it('产品目录由 CRM 当前生效版本给出，不信任前端价格', async () => {
    const res = await signed('get', '/v1/brand-member/products', { key: 'zc-test' });
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
    const annual = res.body.products.find((p: { code: string }) => p.code === 'FY_ANNUAL');
    expect(annual).toMatchObject({ name: 'Full愈年卡', priceCents: 29900, validDays: 365 });
    expect(annual.benefits).toHaveLength(3);
    expect(annual.pointsSpend.presence).toBe('display_only');
    expect(annual.gameEnabled).toBe(true);
  });

  it('报价校验：未知会员、未知产品与非法业务均拒绝', async () => {
    const unknownMember = await signed('post', '/v1/brand-member/quote', {
      key: 'zc-test',
      body: { business: 'presence', localUserId: 'zc-nobody', productCode: 'FY_ANNUAL' }
    });
    expect(unknownMember.status).toBe(404);
    expect(unknownMember.body.error).toBe('MEMBER_NOT_FOUND');

    const unknownProduct = await signed('post', '/v1/brand-member/quote', {
      key: 'zc-test',
      body: { business: 'presence', localUserId: 'local-m-su', productCode: 'FY_FOREVER' }
    });
    expect(unknownProduct.status).toBe(404);
    expect(unknownProduct.body.error).toBe('PRODUCT_NOT_FOUND');

    const mismatch = await signed('post', '/v1/brand-member/quote', {
      key: 'zc-test',
      body: { business: 'teahour', localUserId: 'local-m-su', productCode: 'FY_ANNUAL' }
    });
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.error).toBe('BUSINESS_MISMATCH');
  });

  it('开卡：金额不一致拒绝、成功后幂等重放、写卡期与审计', async () => {
    const quote = await signed('post', '/v1/brand-member/quote', {
      key: 'zc-test',
      body: { business: 'presence', localUserId: 'local-m-su', productCode: 'FY_ANNUAL' }
    });
    expect(quote.status).toBe(201);
    expect(quote.body.priceCents).toBe(29900);
    expect(quote.body.validDays).toBe(365);
    const expiresIn = new Date(quote.body.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(25 * 60 * 1000);
    expect(expiresIn).toBeLessThanOrEqual(31 * 60 * 1000);

    const paidAt = '2026-11-08T10:42:00+08:00';
    const mismatch = await signed('post', '/v1/brand-member/issue', {
      key: 'zc-test',
      headers: { 'Idempotency-Key': 'idem-zc-1' },
      body: { quoteId: quote.body.quoteId, orderRef: 'presence:order:1', paidCents: 29000, paidAt }
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toBe('AMOUNT_MISMATCH');

    const body = {
      quoteId: quote.body.quoteId,
      orderRef: 'presence:order:1',
      paidCents: 29900,
      paidAt
    };
    const issued = await signed('post', '/v1/brand-member/issue', {
      key: 'zc-test',
      headers: { 'Idempotency-Key': 'idem-zc-1' },
      body
    });
    expect(issued.status).toBe(201);
    expect(issued.body.card.state).toBe('ACTIVE');
    expect(issued.body.card.productCode).toBe('FY_ANNUAL');
    expect(issued.body.card.soldBy).toBe('presence');
    expect(issued.body.card.soldByName).toBe('在场');
    expect(issued.body.card.validFrom).toBe('2026-11-08');
    expect(issued.body.card.validUntil).toBe('2027-11-07');
    expect(issued.body.card.remainingDays).toBeGreaterThan(360);

    const replay = await signed('post', '/v1/brand-member/issue', {
      key: 'zc-test',
      headers: { 'Idempotency-Key': 'idem-zc-1' },
      body
    });
    expect(replay.status).toBe(201);
    expect(replay.body.card.cardId).toBe(issued.body.card.cardId);
    expect(await h.prisma.memberBrandCard.count({ where: { memberId: 'm-su' } })).toBe(1);
    expect(await h.prisma.brandCardQuote.count({ where: { usedAt: { not: null } } })).toBe(1);

    const quoteAgain = await signed('post', '/v1/brand-member/issue', {
      key: 'zc-test',
      body: { ...body, orderRef: 'presence:order:2' }
    });
    expect(quoteAgain.status).toBe(409);
    expect(quoteAgain.body.error).toBe('QUOTE_EXPIRED');

    const after = await me('zc-test', 'presence', 'local-m-su');
    expect(after.body.card.state).toBe('ACTIVE');
    expect(after.body.benefits).toHaveLength(3);
    const audit = await h.api('get', '/audit?action=' + encodeURIComponent('外部开卡'), admin);
    expect(audit.body.logs.length).toBeGreaterThan(0);
  });

  it('续费进入 PENDING：新卡期接在旧卡结束次日，me 同时返回当前与待生效', async () => {
    const current = await h.prisma.memberBrandCard.findFirst({
      where: { memberId: 'm-lin', state: 'ACTIVE' }
    });
    expect(current).not.toBeNull();
    const quote = await signed('post', '/v1/brand-member/quote', {
      key: 'sx-test',
      body: { business: 'teahour', localUserId: 'local-m-lin', productCode: 'FY_MONTH' }
    });
    expect(quote.status).toBe(201);

    const issued = await signed('post', '/v1/brand-member/issue', {
      key: 'sx-test',
      body: {
        quoteId: quote.body.quoteId,
        orderRef: 'teahour:order:renew-1',
        paidCents: 4500,
        paidAt: '2026-11-08T10:30:00+08:00'
      }
    });
    expect(issued.status).toBe(201);
    expect(issued.body.card.state).toBe('PENDING');
    const oldEnd = new Date(current!.validUntil);
    const nextStart = new Date(oldEnd.getTime() + 86400000 + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(issued.body.card.validFrom).toBe(nextStart);

    const res = await me('sx-test', 'teahour', 'local-m-lin');
    expect(res.body.card.cardId).toBe(current!.id);
    expect(res.body.card.state).toBe('ACTIVE');
    expect(res.body.pendingCard.productCode).toBe('FY_MONTH');
    expect(res.body.pendingCard.state).toBe('PENDING');
  });

  it('报价过期后不可开卡', async () => {
    const quote = await signed('post', '/v1/brand-member/quote', {
      key: 'ql-test',
      body: { business: 'retreat', localUserId: 'local-m-tang', productCode: 'FY_MONTH' }
    });
    expect(quote.status).toBe(201);
    await h.prisma.brandCardQuote.update({
      where: { id: quote.body.quoteId },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    const res = await signed('post', '/v1/brand-member/issue', {
      key: 'ql-test',
      body: {
        quoteId: quote.body.quoteId,
        orderRef: 'retreat:order:late',
        paidCents: 4500,
        paidAt: new Date().toISOString()
      }
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('QUOTE_EXPIRED');
  });

  it('退卡：7 天内全额、重复退款幂等、超额与跨业务拒绝，me 不再展示已退卡', async () => {
    const quote = await signed('post', '/v1/brand-member/quote', {
      key: 'ql-test',
      body: { business: 'retreat', localUserId: 'local-m-tang', productCode: 'FY_MONTH' }
    });
    expect(quote.status).toBe(201);
    const orderRef = 'retreat:order:refund-1';
    const paidAt = new Date().toISOString();
    const issued = await signed('post', '/v1/brand-member/issue', {
      key: 'ql-test',
      body: { quoteId: quote.body.quoteId, orderRef, paidCents: 4500, paidAt }
    });
    expect(issued.status).toBe(201);
    const cardId = issued.body.card.cardId as string;

    const over = await signed('post', '/v1/brand-member/refund', {
      key: 'ql-test',
      headers: { 'Idempotency-Key': 'idem-refund-over' },
      body: { orderRef, refundCents: 4600, refundType: 'WITHIN_7D', refundedAt: paidAt }
    });
    expect(over.status).toBe(400);

    const body = {
      orderRef,
      cardId,
      refundCents: 4500,
      refundType: 'WITHIN_7D',
      reason: '7 天内无理由退卡',
      refundedAt: paidAt
    };
    const refunded = await signed('post', '/v1/brand-member/refund', {
      key: 'ql-test',
      headers: { 'Idempotency-Key': 'idem-refund-1' },
      body
    });
    expect(refunded.status).toBe(201);
    expect(refunded.body.card.cardId).toBe(cardId);
    expect(refunded.body.card.state).toBe('REFUNDED');
    expect(refunded.body.refund).toMatchObject({
      refundType: 'WITHIN_7D',
      refundCents: 4500,
      reason: '7 天内无理由退卡'
    });
    expect(refunded.body.replayed).toBe(false);

    const replay = await signed('post', '/v1/brand-member/refund', {
      key: 'ql-test',
      headers: { 'Idempotency-Key': 'idem-refund-1' },
      body
    });
    expect(replay.status).toBe(201);
    expect(replay.body.card.cardId).toBe(cardId);
    expect(replay.body.card.state).toBe('REFUNDED');
    expect(await h.prisma.memberBrandCard.count({ where: { id: cardId, state: 'REFUNDED' } })).toBe(1);

    const crossBusiness = await signed('post', '/v1/brand-member/refund', {
      key: 'zc-test',
      body: { orderRef, refundCents: 4500, refundType: 'WITHIN_7D', refundedAt: paidAt }
    });
    expect(crossBusiness.status).toBe(404);

    const after = await me('ql-test', 'retreat', 'local-m-tang');
    expect(after.body.card.state).toBe('NONE');
    const audit = await h.api('get', '/audit?action=' + encodeURIComponent('外部退卡'), admin);
    expect(audit.body.logs.length).toBeGreaterThan(0);
    expect(
      await h.prisma.outboxEvent.count({ where: { topic: 'brand_card.refunded' } })
    ).toBeGreaterThan(0);
  });

  it('退卡：超过 7 天按实付 − 已享优惠退，金额须与 CRM 报价一致；PRORATED 兼容为 AFTER_7D', async () => {
    const quote = await signed('post', '/v1/brand-member/quote', {
      key: 'zc-test',
      body: { business: 'presence', localUserId: 'local-m-su', productCode: 'FY_MONTH' }
    });
    expect(quote.status).toBe(201);
    const orderRef = 'presence:order:refund-prorated';
    const issued = await signed('post', '/v1/brand-member/issue', {
      key: 'zc-test',
      body: { quoteId: quote.body.quoteId, orderRef, paidCents: 4500, paidAt: new Date().toISOString() }
    });
    expect(issued.status).toBe(201);
    const cardId = issued.body.card.cardId as string;
    await h.prisma.memberBrandCard.update({
      where: { id: cardId },
      data: { paidAt: new Date(Date.now() - 10 * 86400000) }
    });
    await h.prisma.memberOrder.create({
      data: {
        id: 'mo-refund-after-7d',
        memberId: 'm-su',
        business: 'zc',
        orderRef: 'ZC-SAVED-1',
        paidCents: 9000,
        savedCents: 1000,
        cardId,
        occurredAt: new Date()
      }
    });

    const preview = await signed('get', `/v1/brand-member/refund-quote?orderRef=${orderRef}`, {
      key: 'zc-test'
    });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      window: 'AFTER_7D',
      refundType: 'AFTER_7D',
      paidCents: 4500,
      savedCents: 1000,
      refundableCents: 3500,
      allowed: true
    });

    const now = new Date().toISOString();
    const fullAmount = await signed('post', '/v1/brand-member/refund', {
      key: 'zc-test',
      body: { orderRef, refundCents: 4500, refundType: 'WITHIN_7D', refundedAt: now }
    });
    expect(fullAmount.status).toBe(409);
    expect(fullAmount.body.error).toBe('REFUND_AMOUNT_MISMATCH');

    const refund = await signed('post', '/v1/brand-member/refund', {
      key: 'zc-test',
      headers: { 'Idempotency-Key': 'idem-refund-prorated' },
      body: { orderRef, refundCents: 3500, refundType: 'PRORATED', refundedAt: now }
    });
    expect(refund.status).toBe(201);
    expect(refund.body.card.state).toBe('REFUNDED');
    expect(refund.body.refund.refundCents).toBe(3500);
    expect(refund.body.refund.refundType).toBe('AFTER_7D');

    const differentAmount = await signed('post', '/v1/brand-member/refund', {
      key: 'zc-test',
      body: { orderRef, refundCents: 1000, refundType: 'AFTER_7D', refundedAt: now }
    });
    expect(differentAmount.status).toBe(409);
    expect(differentAmount.body.error).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('退卡：已享优惠超过实付时拒绝并给挽留文案；仅协商退款权限可在后台强制退款', async () => {
    const quote = await signed('post', '/v1/brand-member/quote', {
      key: 'ql-test',
      body: { business: 'retreat', localUserId: 'local-m-tang', productCode: 'FY_MONTH' }
    });
    const orderRef = 'retreat:order:refund-blocked';
    const issued = await signed('post', '/v1/brand-member/issue', {
      key: 'ql-test',
      body: { quoteId: quote.body.quoteId, orderRef, paidCents: 4500, paidAt: new Date().toISOString() }
    });
    expect(issued.status).toBe(201);
    const cardId = issued.body.card.cardId as string;
    await h.prisma.memberBrandCard.update({
      where: { id: cardId },
      data: { paidAt: new Date(Date.now() - 20 * 86400000) }
    });
    await h.prisma.memberOrder.create({
      data: {
        id: 'mo-refund-blocked',
        memberId: 'm-tang',
        business: 'ql',
        orderRef: 'QL-SAVED-1',
        paidCents: 39800,
        savedCents: 6000,
        cardId,
        occurredAt: new Date()
      }
    });

    const preview = await signed('get', `/v1/brand-member/refund-quote?orderRef=${orderRef}`, {
      key: 'ql-test'
    });
    expect(preview.body.allowed).toBe(false);
    expect(preview.body.reasonCode).toBe('REFUND_NOT_ALLOWED');
    expect(preview.body.message).toContain('享受的优惠已超出，不能退款');
    expect(preview.body.message).toContain('¥60');

    const blocked = await signed('post', '/v1/brand-member/refund', {
      key: 'ql-test',
      body: { orderRef, refundCents: 0, refundType: 'AFTER_7D', refundedAt: new Date().toISOString() }
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('REFUND_NOT_ALLOWED');

    const adminQuote = await h.api('get', `/member-cards/${cardId}/refund-quote`, cs);
    expect(adminQuote.status).toBe(200);
    expect(adminQuote.body.allowed).toBe(false);

    const deniedForce = await h.api('post', `/member-cards/${cardId}/force-refund`, cs, {
      reason: '客诉协商一致',
      refundCents: 2000
    });
    expect(deniedForce.status).toBe(403);

    const tooShort = await h.api('post', `/member-cards/${cardId}/force-refund`, finance, {
      reason: '好',
      refundCents: 2000
    });
    expect(tooShort.status).toBe(400);

    const forced = await h.api('post', `/member-cards/${cardId}/force-refund`, finance, {
      reason: '客诉协商一致，退一半',
      refundCents: 2000
    });
    expect(forced.status).toBe(200);
    const card = await h.prisma.memberBrandCard.findUniqueOrThrow({ where: { id: cardId } });
    expect(card.state).toBe('REFUNDED');
    expect(card.refundType).toBe('NEGOTIATED');
    expect(card.refundCents).toBe(2000);

    const again = await h.api('post', `/member-cards/${cardId}/force-refund`, finance, {
      reason: '客诉协商一致，退一半',
      refundCents: 2000
    });
    expect(again.status).toBe(409);
    const audit = await h.api('get', '/audit?action=' + encodeURIComponent('协商退款'), admin);
    expect(audit.body.logs.length).toBeGreaterThan(0);
  });

  it('游戏票据：仅有效品牌卡可换，库里只存哈希；未开卡拒绝', async () => {
    const ticket = await signed('post', '/v1/brand-member/game/ticket', {
      key: 'zc-test',
      body: { business: 'presence', localUserId: 'local-m-su' }
    });
    expect(ticket.status).toBe(201);
    expect(ticket.body.ticket.length).toBeGreaterThan(20);
    expect(ticket.body.url).toContain('host=presence');
    const stored = await h.prisma.gameTicket.findFirst({
      where: { tokenHash: sha256(ticket.body.ticket) }
    });
    expect(stored).not.toBeNull();
    expect(new Date(ticket.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const denied = await signed('post', '/v1/brand-member/game/ticket', {
      key: 'ql-test',
      body: { business: 'retreat', localUserId: 'local-m-tang' }
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('GAME_UNAVAILABLE');
  });

  it('票据 token 随机且不同请求不同', async () => {
    const a = await signed('post', '/v1/brand-member/game/ticket', {
      key: 'zc-test',
      body: { business: 'presence', localUserId: 'local-m-su' }
    });
    const b = await signed('post', '/v1/brand-member/game/ticket', {
      key: 'zc-test',
      body: { business: 'presence', localUserId: 'local-m-su' }
    });
    expect(a.body.ticket).not.toBe(b.body.ticket);
  });

  it('游戏票据换取短期会话：可读状态、掷骰扣骰并幂等重放，失效票据拒绝', async () => {
    const ticket = await signed('post', '/v1/brand-member/game/ticket', {
      key: 'sx-test',
      body: { business: 'teahour', localUserId: 'local-m-lin' }
    });
    expect(ticket.status).toBe(201);

    const exchanged = await request(server())
      .post('/api/v1/brand-member/game/exchange')
      .send({ ticket: ticket.body.ticket });
    expect(exchanged.status).toBe(201);
    expect(typeof exchanged.body.token).toBe('string');
    expect(exchanged.body.token.length).toBeGreaterThan(20);
    expect(exchanged.body.session.dice.station).toBe(8);
    const auth = { Authorization: `Bearer ${exchanged.body.token}` };

    const session = await request(server())
      .get('/api/v1/brand-member/game/session')
      .set(auth);
    expect(session.status).toBe(200);
    expect(session.body.dice.balance).toBe(12);
    expect(session.body.board.lapLength).toBe(12);

    const roll = await request(server())
      .post('/api/v1/brand-member/game/session/roll')
      .set(auth)
      .set('Idempotency-Key', 'live-roll-1')
      .send({});
    expect(roll.status).toBe(201);
    expect(roll.body.dice).toBeGreaterThanOrEqual(1);
    expect(roll.body.dice).toBeLessThanOrEqual(6);
    expect(roll.body.balance).toBe(11);

    const replay = await request(server())
      .post('/api/v1/brand-member/game/session/roll')
      .set(auth)
      .set('Idempotency-Key', 'live-roll-1')
      .send({});
    expect(replay.status).toBe(201);
    expect(replay.body.rollId).toBe(roll.body.rollId);
    expect(replay.body.balance).toBe(11);

    const expired = await request(server())
      .post('/api/v1/brand-member/game/exchange')
      .send({ ticket: 'not-a-real-ticket' });
    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe('GAME_TICKET_INVALID');

    const noToken = await request(server()).get('/api/v1/brand-member/game/session');
    expect(noToken.status).toBe(401);
  });
});
