/**
 * 会员卡自助购卡：金额只认 CRM 报价、按单号落账、只开一次卡。
 *
 * 这里盯的是运营里最容易出事的四件事：
 * - 客户端改不了价格：下单金额必须来自服务端向 CRM 的实时报价；
 * - 重复点击/重复回调不会产生第二笔财务分录，也不会重复开卡（渠道重试是常态）；
 * - 金额或子商户对不上就拒绝落账，留给人工核对；
 * - 钱到账但 CRM 开卡失败 → issueStatus=unknown，随后按退避自动重开，直到开成为止：
 *   不提示顾客成功，也不留人工对账；只有 CRM 明确拒绝或调价才停下来留痕。
 */
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { ApiError } from '../common/errors';
import { HardwareService } from '../hardware/hardware.module';
import { BrandMemberClient, type BrandIssueInput, type BrandQuote } from './brand-member.client';
import { BrandCardPaymentService } from './brand-card-payment.service';

const PRODUCT = 'FY_ANNUAL';
const PRICE_CENTS = 39900;

type PrepayCall = { orderId: string; amountCents: number; openId: string; storeId?: string };

describe('会员卡购卡：报价、落账与开卡幂等', () => {
  let h: Harness;
  let quotes: BrandQuote[];
  let issueCalls: BrandIssueInput[];
  let issueFails: Error | null;
  let prepayCalls: PrepayCall[];
  /** CRM 报价单价：默认与 PRICE_CENTS 一致，调价用例单独改。 */
  let quoteCents: number;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(() => {
    prepayCalls = [];
    issueCalls = [];
    issueFails = null;
    quotes = [];
    quoteCents = PRICE_CENTS;

    const brand = h.app.get(BrandMemberClient);
    brand.products = async () => ({
      products: [
        {
          code: PRODUCT,
          name: 'Full愈大会员',
          priceCents: PRICE_CENTS,
          validDays: 365,
          benefits: [],
          pointsSpend: {},
          gameEnabled: true
        }
      ]
    });
    brand.quote = async (_localUserId, productCode) => {
      const quote: BrandQuote = {
        quoteId: `Q-${quotes.length + 1}`,
        productCode,
        priceCents: quoteCents,
        validDays: 365,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString()
      };
      quotes.push(quote);
      return quote;
    };
    brand.issue = async (input) => {
      if (issueFails) throw issueFails;
      issueCalls.push(input);
      return {
        card: {
          cardId: `C-${issueCalls.length}`,
          state: 'ACTIVE',
          productCode: PRODUCT,
          validFrom: new Date().toISOString(),
          validUntil: new Date(Date.now() + 365 * 86_400_000).toISOString()
        }
      };
    };

    // 渠道替身：预下单永远成功，回调由用例手工注入（模拟渠道重试）。
    const gateway = h.app.get(HardwareService).payment as unknown as Record<string, unknown> & {
      prepay?: (req: PrepayCall) => Promise<unknown>;
    };
    gateway.asyncPayments = true;
    gateway.prepay = async (req) => {
      prepayCalls.push({ ...req });
      return {
        ok: true,
        payment: { timeStamp: '1', nonceStr: 'n', package: 'prepay_id=x', signType: 'RSA', paySign: 's' }
      };
    };
  });

  const service = () => h.app.get(BrandCardPaymentService);

  const member = async (openId: string): Promise<{ id: string; token: string }> => {
    const customer = await h.customer('购卡茶客');
    await h.prisma.customer.update({ where: { id: customer.id }, data: { openId } });
    return { id: customer.id, token: customer.token };
  };

  it('下单金额取 CRM 报价，客户端传不了价，重复点击复用同一张待付单', async () => {
    const me = await member(`o-${Date.now()}`);

    const first = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT, priceCents: 1 })
      .expect(201);
    expect(first.body.order.amountCents).toBe(PRICE_CENTS);
    expect(first.body.order.payStatus).toBe('pending');
    expect(first.body.prepayMode).toBe('live');
    expect(first.body.payment.package).toBe('prepay_id=x');
    expect(prepayCalls[0]).toMatchObject({
      amountCents: PRICE_CENTS,
      storeId: 'brand'
    });

    const second = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    // 同一张待付单、同一笔渠道预下单单号：不会因为连点产生两张待付款单。
    expect(second.body.order.id).toBe(first.body.order.id);

    const rows = await h.prisma.brandCardOrder.findMany({ where: { customerId: me.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(PRICE_CENTS);
  });

  it('回调落账只记一次，重复回调不会多记财务分录、也不会重复开卡', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;
    expect(orderId.startsWith('MB-')).toBe(true);

    const first = await service().settle({
      reference: orderId,
      providerRef: 'HF-1',
      amountCents: PRICE_CENTS,
      status: 'paid'
    });
    expect(first).toBe('applied');

    const again = await service().settle({
      reference: orderId,
      providerRef: 'HF-1',
      amountCents: PRICE_CENTS,
      status: 'paid'
    });
    expect(again).toBe('duplicate');

    const entries = await h.prisma.financeEntry.findMany({ where: { dedupeKey: `brand-card:${orderId}` } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ storeId: 'brand', type: 'SALE', amountCents: PRICE_CENTS });
    expect(issueCalls).toHaveLength(1);
    expect(issueCalls[0].idempotencyKey).toBe(`MB-ISSUE-${orderId}`);

    const row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row).toMatchObject({ payStatus: 'paid', issueStatus: 'issued', crmCardId: 'C-1' });

    // 顾客侧看到的最终状态：已支付且已开卡。
    const latest = await h.api('get', '/customer/brand-member/orders/latest', me.token).expect(200);
    expect(latest.body.order).toMatchObject({ id: orderId, payStatus: 'paid', issueStatus: 'issued' });
  });

  it('回调金额不一致：拒绝落账，订单保持待支付，不留财务分录', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;

    await expect(
      service().settle({ reference: orderId, amountCents: 1, status: 'paid' })
    ).rejects.toMatchObject({ statusCode: 400 });

    const row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row?.payStatus).toBe('pending');
    expect(await h.prisma.financeEntry.count({ where: { dedupeKey: `brand-card:${orderId}` } })).toBe(0);
    expect(issueCalls).toHaveLength(0);
  });

  it('钱到账但 CRM 开卡失败：先落 unknown 并排重试，到点自动开成', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;

    issueFails = new Error('CRM 超时');
    const outcome = await service().settle({ reference: orderId, status: 'paid', amountCents: PRICE_CENTS });
    expect(outcome).toBe('applied');

    let row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row).toMatchObject({ payStatus: 'paid', issueStatus: 'unknown', issueAttempts: 1 });
    expect(row?.issueError).toContain('CRM 超时');
    // 第一次失败只等 5 秒就重开：顾客自己那次轮询就能等到结果。
    expect((row?.issueNextAt?.getTime() || 0) - Date.now()).toBeLessThanOrEqual(6_000);
    expect(issueCalls).toHaveLength(0);

    // 没到重试时间：重复回调仍是 duplicate，也不会去打 CRM。
    issueFails = null;
    const again = await service().settle({ reference: orderId, status: 'paid', amountCents: PRICE_CENTS });
    expect(again).toBe('duplicate');
    expect(issueCalls).toHaveLength(0);

    // 到点后由后台巡检自动重开，不需要谁去后台点「补开卡」。
    await h.prisma.brandCardOrder.update({
      where: { id: orderId },
      data: { issueNextAt: new Date(Date.now() - 1_000) }
    });
    const sweep = await service().sweepIssues();
    expect(sweep).toMatchObject({ attempted: 1, issued: 1 });

    row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row).toMatchObject({ payStatus: 'paid', issueStatus: 'issued', issueAttempts: 1 });
    expect(row?.issueNextAt).toBeNull();
    expect(issueCalls).toHaveLength(1);
    // 重试用的还是同一把幂等键：CRM 侧只可能认这一张卡，不会续第二遍。
    expect(issueCalls[0].idempotencyKey).toBe(`MB-ISSUE-${orderId}`);
  });

  it('顾客轮询自己就把待重开的卡开出来，不用等巡检', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;

    issueFails = new Error('CRM 503');
    await service().settle({ reference: orderId, status: 'paid', amountCents: PRICE_CENTS });
    issueFails = null;
    await h.prisma.brandCardOrder.update({
      where: { id: orderId },
      data: { issueNextAt: new Date(Date.now() - 1_000) }
    });

    const view = await h.api('get', `/customer/brand-member/orders/${orderId}`, me.token).expect(200);
    expect(view.body.order).toMatchObject({ payStatus: 'paid', issueStatus: 'issued' });
    expect(issueCalls).toHaveLength(1);
  });

  it('报价过期后再开卡：重新报价、价格一致才开，且不重复记账', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;
    const paidQuoteId = quotes[0].quoteId;

    issueFails = new Error('CRM 502');
    await service().settle({ reference: orderId, status: 'paid', amountCents: PRICE_CENTS });
    issueFails = null;
    // 报价在重试期间过期（CRM 报价 TTL 30 分钟，网络抖动可能拖这么久）。
    await h.prisma.brandCardOrder.update({
      where: { id: orderId },
      data: { quoteExpiresAt: new Date(Date.now() - 60_000), issueNextAt: new Date(Date.now() - 1_000) }
    });

    const before = quotes.length;
    const sweep = await service().sweepIssues();
    expect(sweep).toMatchObject({ attempted: 1, issued: 1 });
    expect(quotes).toHaveLength(before + 1);
    expect(quotes[before].quoteId).not.toBe(paidQuoteId);

    const row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row).toMatchObject({ issueStatus: 'issued', quoteId: quotes[before].quoteId });
    expect(await h.prisma.financeEntry.count({ where: { dedupeKey: `brand-card:${orderId}` } })).toBe(1);
  });

  it('CRM 调价后不再硬开：实付与现价不符就停下留痕，不重复开卡', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;

    issueFails = new Error('CRM 502');
    await service().settle({ reference: orderId, status: 'paid', amountCents: PRICE_CENTS });
    issueFails = null;

    // 重试窗口内 CRM 调价 + 原报价过期：不能按旧价硬开，也不能装作没事。
    quoteCents = PRICE_CENTS + 10_000;
    await h.prisma.brandCardOrder.update({
      where: { id: orderId },
      data: { quoteExpiresAt: new Date(Date.now() - 60_000), issueNextAt: new Date(Date.now() - 1_000) }
    });

    const sweep = await service().sweepIssues();
    expect(sweep.issued).toBe(0);
    expect(issueCalls).toHaveLength(0);

    const row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row).toMatchObject({ payStatus: 'paid', issueStatus: 'unknown' });
    expect(row?.issueError).toContain('不一致');
    // 这种错重试再密也没用：退回 6 小时一次的长间隔，不刷日志。
    expect((row?.issueNextAt?.getTime() || 0) - Date.now()).toBeGreaterThan(5 * 60 * 60_000);
  });

  it('CRM 判报价失效：清掉旧报价重新报价再开，不会拿同一个 quoteId 一直撞', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;

    issueFails = new ApiError(409, '报价已失效，请重新发起支付', { code: 'QUOTE_EXPIRED' });
    await service().settle({ reference: orderId, status: 'paid', amountCents: PRICE_CENTS });

    const failed = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(failed).toMatchObject({ payStatus: 'paid', issueStatus: 'unknown', issueAttempts: 1 });
    // 旧报价标成已过期：下一轮必须先重新报价，而不是复用它。
    expect(failed?.quoteExpiresAt?.getTime()).toBe(0);

    issueFails = null;
    await h.prisma.brandCardOrder.update({
      where: { id: orderId },
      data: { issueNextAt: new Date(Date.now() - 1_000) }
    });
    const before = quotes.length;
    const sweep = await service().sweepIssues();
    expect(sweep).toMatchObject({ attempted: 1, issued: 1 });
    expect(quotes).toHaveLength(before + 1);

    const row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row?.issueStatus).toBe('issued');
    expect(await h.prisma.financeEntry.count({ where: { dedupeKey: `brand-card:${orderId}` } })).toBe(1);
  });

  it('报价连续失效：快重试三次后退到 6 小时，不每分钟空转', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;

    issueFails = new ApiError(409, '报价已失效，请重新发起支付', { code: 'QUOTE_EXPIRED' });
    await service().settle({ reference: orderId, status: 'paid', amountCents: PRICE_CENTS });
    for (let i = 0; i < 3; i += 1) {
      await h.prisma.brandCardOrder.update({
        where: { id: orderId },
        data: { issueNextAt: new Date(Date.now() - 1_000) }
      });
      await service().sweepIssues();
    }

    const row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row).toMatchObject({ payStatus: 'paid', issueStatus: 'unknown', issueAttempts: 4 });
    expect((row?.issueNextAt?.getTime() || 0) - Date.now()).toBeGreaterThan(5 * 60 * 60_000);
  });

  it('顾客放弃支付后待付单关闭，重启购卡会拿到新单', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;

    await h.api('post', `/customer/brand-member/orders/${orderId}/close`, me.token).expect(200);
    const closed = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(closed?.payStatus).toBe('closed');

    const next = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    expect(next.body.order.id).not.toBe(orderId);
    expect(next.body.order.payStatus).toBe('pending');
  });

  it('本地已关闭的单收到迟到回调：照样落账开卡，钱不能白收', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;
    await h.api('post', `/customer/brand-member/orders/${orderId}/close`, me.token).expect(200);

    const outcome = await service().settle({
      reference: orderId,
      status: 'paid',
      amountCents: PRICE_CENTS,
      providerRef: 'HF-late'
    });
    expect(outcome).toBe('applied');

    const row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row).toMatchObject({ payStatus: 'paid', issueStatus: 'issued' });
    expect(await h.prisma.financeEntry.count({ where: { dedupeKey: `brand-card:${orderId}` } })).toBe(1);
  });

  it('渠道回调经 /api/hooks/payment 落到会员卡单，并按会员卡应答', async () => {
    const me = await member(`o-${Date.now()}`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', me.token, { productCode: PRODUCT })
      .expect(201);
    const orderId = res.body.order.id as string;

    const gateway = h.app.get(HardwareService).payment as unknown as {
      handleCallback: (request: unknown) => Promise<unknown>;
    };
    gateway.handleCallback = async () => ({
      ok: true,
      reference: orderId,
      providerRef: 'HF-hook-1',
      amountCents: PRICE_CENTS,
      status: 'paid',
      paidAt: Date.now()
    });

    const hook = await h.api('post', '/hooks/payment/mock-payment', null, { out_trade_no: orderId });
    expect(hook.status).toBe(200);
    expect(hook.body).toMatchObject({ ok: true, kind: 'member-card', status: 'applied' });

    const row = await h.prisma.brandCardOrder.findUnique({ where: { id: orderId } });
    expect(row).toMatchObject({ payStatus: 'paid', issueStatus: 'issued' });
    expect(issueCalls).toHaveLength(1);
  });

  it('未绑定微信的会话不能发起购卡支付', async () => {
    const customer = await h.customer('无微信茶客');
    const res = await h
      .api('post', '/customer/brand-member/purchase', customer.token, { productCode: PRODUCT })
      .expect(400);
    expect(res.body.message || res.body.error?.message || '').toContain('微信登录');
    expect(await h.prisma.brandCardOrder.count({ where: { customerId: customer.id } })).toBe(0);
  });

  it('管理端账号也走不到别人的购卡单', async () => {
    const mine = await member(`o-${Date.now()}`);
    const other = await member(`o-${Date.now()}-2`);
    const res = await h
      .api('post', '/customer/brand-member/purchase', mine.token, { productCode: PRODUCT })
      .expect(201);

    await h
      .api('get', `/customer/brand-member/orders/${res.body.order.id}`, other.token)
      .expect(404);
    // 后台账号没有顾客上下文，同样拿不到这张单。
    const token = await h.login(ACCOUNTS.managerSh);
    await h.api('get', `/customer/brand-member/orders/${res.body.order.id}`, token).expect(401);
  });
});