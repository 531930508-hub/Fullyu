/**
 * 异步支付渠道（汇付模式）订单链路。
 *
 * 与 mock 同步扣款不同，真实渠道必须走「先建未支付单 → 预下单/收款码/付款码 → 回调或查询落账」。
 * 这里用一个可编排的异步网关替换 payment 实现，验证订单层不会把「已发起」当成「已支付」：
 * - 小程序：建单只返回预支付意图，wx.requestPayment 参数由 prepay 提供，回调才落账；
 * - 营业台：顾客扫码（nativePay）等待回调/查询，扫顾客付款码（micropay）可即时成功/处理中/失败；
 * - 现金：不经过渠道扣款；
 * - 回调：金额/子商户不符必须拒绝落账；重复回调不重复记账；
 * - 退款：渠道返回 processing 时保持占用，退款回调成功后才落账。
 */
import { ACCOUNTS, createHarness, freshOrderBody, type Harness } from '../testing/harness';
import { HardwareService } from '../hardware/hardware.module';
import { OrdersService } from './orders.service';
import type {
  DeviceStatus,
  PaymentCallbackResult,
  PaymentGateway,
  PaymentQueryResult,
  PaymentRefundResult,
  PaymentRequest,
  PaymentResult
} from '@teahour/integrations';

type FakeGateway = PaymentGateway & {
  charge: jest.Mock<Promise<PaymentResult>, [PaymentRequest]>;
  refund: jest.Mock<Promise<PaymentRefundResult>, [unknown]>;
  prepay: jest.Mock<Promise<{ ok: boolean; payment?: PrepayParams; error?: string }>, [unknown]>;
  nativePay: jest.Mock;
  micropay: jest.Mock;
  query: jest.Mock<Promise<PaymentQueryResult>, [unknown]>;
  handleCallback: jest.Mock<Promise<PaymentCallbackResult>, [unknown]>;
};

type PrepayParams = { timeStamp: string; nonceStr: string; package: string; signType: 'RSA'; paySign: string };

const PREPAY: PrepayParams = {
  timeStamp: '1730000000',
  nonceStr: 'nonce-test',
  package: 'prepay_id=wx-test-prepay',
  signType: 'RSA',
  paySign: 'sign-test'
};

function fakeGateway(): FakeGateway {
  return {
    name: 'fake-async-payment',
    mode: 'live',
    displayName: '汇付天下（测试）',
    asyncPayments: true,
    charge: jest.fn(async () => ({ ok: false, error: '异步渠道不应调用同步扣款' })),
    refund: jest.fn(async () => ({ ok: true, providerRef: 'REF-TEST', status: 'succeeded' as const })),
    status: async (): Promise<DeviceStatus> => ({ online: true, mode: 'live' }),
    prepay: jest.fn(async () => ({ ok: true, payment: PREPAY })),
    nativePay: jest.fn(async () => ({
      ok: true,
      qrCode: 'weixin://wxpay/bizpayurl?pr=async-test',
      providerRef: 'HF-NATIVE-1'
    })),
    micropay: jest.fn(async () => ({ ok: true, status: 'paid' as const, providerRef: 'HF-MICRO-1' })),
    query: jest.fn(async () => ({ ok: true, status: 'pending' as const })),
    handleCallback: jest.fn(async () => ({ ok: true })),
    merchantFor: (storeId: string) => (storeId === 'sh' ? 'MER-SH' : '')
  } as unknown as FakeGateway;
}

describe('异步支付渠道订单链路（汇付模式）', () => {
  let h: Harness;
  let gateway: FakeGateway;
  let managerToken: string;
  let customerToken: string;

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
    const wechat = await h.api('post', '/customer/wechat/login', null, {
      code: 'async-pay-openid',
      phone: '13700000123'
    });
    if (wechat.status !== 201 && wechat.status !== 200) {
      throw new Error(`微信登录失败 ${wechat.status} ${wechat.text}`);
    }
    customerToken = wechat.body.token as string;
  });

  beforeEach(() => {
    gateway = fakeGateway();
    // 装配层只读取 HardwareService.integrations，替换 payment 即模拟真实异步渠道。
    (h.app.get(HardwareService).integrations as unknown as { payment: FakeGateway }).payment = gateway;
  });

  afterAll(async () => {
    await h.close();
  });

  const stockOf = () =>
    h.prisma.stock
      .findUnique({ where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } } })
      .then((row) => row?.grams ?? 0);

  const deliver = (extra: Record<string, unknown> = {}) =>
    h.api('post', '/store/orders', managerToken, { ...freshOrderBody(), ...extra });

  const payCallback = (body: unknown) => h.api('post', `/hooks/payment/${gateway.name}`, null, body);

  it('小程序建单保持未支付，prepay 返回渠道参数，回调后才落账且重复回调不重复记账', async () => {
    const created = await h.api('post', '/customer/orders', customerToken, freshOrderBody());
    expect(created.status).toBe(201);
    const orderId = created.body.order.id as string;
    expect(created.body.order.paymentStatus).toBe('unpaid');
    expect(created.body.payment).toEqual({ kind: 'prepay', method: 'wechat' });
    // 建单阶段绝不调用渠道扣款/下单。
    expect(gateway.charge).not.toHaveBeenCalled();
    expect(gateway.prepay).not.toHaveBeenCalled();
    expect(gateway.nativePay).not.toHaveBeenCalled();

    const prepay = await h.api('post', `/customer/orders/${orderId}/prepay`, customerToken);
    expect(prepay.status).toBe(201);
    expect(prepay.body.paid).toBe(false);
    expect(prepay.body.prepayMode).toBe('live');
    expect(prepay.body.payment.package).toBe(PREPAY.package);
    expect(gateway.prepay).toHaveBeenCalledWith(
      expect.objectContaining({ orderId, amountCents: 2000, openId: expect.stringContaining('mock_') })
    );

    gateway.handleCallback.mockResolvedValue({
      ok: true,
      reference: orderId,
      providerRef: 'HF-PAY-1',
      amountCents: 2000,
      merchantId: 'MER-SH',
      status: 'paid'
    });
    const callback = await payCallback({ resp_data: '{}', sign: 'sig' });
    expect(callback.status).toBe(200);
    expect(callback.body.applied).toBe(true);

    const paid = await h.prisma.order.findUnique({ where: { id: orderId } });
    expect(paid?.paymentStatus).toBe('paid');
    expect(paid?.paymentRef).toBe('HF-PAY-1');
    const intent = await h.prisma.paymentIntent.findMany({ where: { orderId } });
    expect(intent).toHaveLength(1);
    expect(intent[0].status).toBe('succeeded');
    expect(await h.prisma.financeEntry.count({ where: { orderId, type: 'SALE' } })).toBe(1);

    // 渠道重复通知：幂等，不重复记账。
    const again = await payCallback({ resp_data: '{}', sign: 'sig' });
    expect(again.status).toBe(200);
    expect(again.body.applied).toBe(true);
    expect(await h.prisma.financeEntry.count({ where: { orderId, type: 'SALE' } })).toBe(1);
  });

  it('回调金额与订单应付不一致：拒绝落账、订单保持未支付并留痕', async () => {
    const created = await h.api('post', '/customer/orders', customerToken, freshOrderBody());
    const orderId = created.body.order.id as string;
    gateway.handleCallback.mockResolvedValueOnce({
      ok: true,
      reference: orderId,
      providerRef: 'HF-PAY-BAD',
      amountCents: 1,
      merchantId: 'MER-SH',
      status: 'paid'
    });
    const callback = await payCallback({ resp_data: '{}', sign: 'sig' });
    expect(callback.status).toBe(400);
    expect(String(callback.body.message)).toMatch(/金额/);

    const order = await h.prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.paymentStatus).toBe('unpaid');
    expect(await h.prisma.financeEntry.count({ where: { orderId, type: 'SALE' } })).toBe(0);
    const audit = await h.prisma.log.findFirst({
      where: { orderId, action: { contains: '金额不一致拦截' } }
    });
    expect(audit).toBeTruthy();
  });

  it('营业台顾客扫码：返回收款码、订单未支付，查询到渠道已付后收敛落账', async () => {
    const created = await deliver({ payMode: 'qr' });
    expect(created.status).toBe(201);
    const orderId = created.body.order.id as string;
    expect(created.body.order.paymentStatus).toBe('unpaid');
    expect(created.body.payment).toMatchObject({
      kind: 'qr',
      method: 'wechat',
      qrCode: 'weixin://wxpay/bizpayurl?pr=async-test'
    });
    expect(gateway.nativePay).toHaveBeenCalledWith(
      expect.objectContaining({ orderId, amountCents: 2000, method: 'wechat', storeId: 'sh' })
    );

    const waiting = await h.api('get', `/store/orders/${orderId}/payment`, managerToken);
    expect(waiting.status).toBe(200);
    expect(waiting.body.paymentStatus).toBe('unpaid');

    gateway.query.mockResolvedValueOnce({ ok: true, status: 'paid', providerRef: 'HF-QR-PAID' });
    // 轮询有 2.5 秒节流：这里直接走服务层强制刷新，验证查询收敛逻辑本身。
    const orders = h.app.get(OrdersService);
    const row = await orders.getOrderRow(orderId);
    const status = await orders.refreshPaymentStatus(row, true);
    expect(status.paymentStatus).toBe('paid');

    const paid = await h.prisma.order.findUnique({ where: { id: orderId } });
    expect(paid?.paymentStatus).toBe('paid');
    expect(paid?.paymentRef).toBe('HF-QR-PAID');
    expect(await h.prisma.financeEntry.count({ where: { orderId, type: 'SALE' } })).toBe(1);
  });

  it('收款码不受渠道支持：返回可读原因并释放库存，不冒 500', async () => {
    const before = await stockOf();
    const previous = await h.prisma.order.findFirst({ orderBy: { createdAt: 'desc' } });
    gateway.nativePay.mockResolvedValueOnce({
      ok: false,
      status: 'failed',
      error: '当前商户暂不支持生成收款码，请让伙伴扫顾客付款码收款'
    });
    const created = await deliver({ payMode: 'qr' });
    // 旧版营业台缓存的页面仍会走二维码；这里必须回可读的 409，而不是笼统的 503。
    expect(created.status).toBe(409);
    expect(String(created.body.message)).toContain('扫顾客付款码');

    const order = await h.prisma.order.findFirst({
      where: previous ? { id: { not: previous.id } } : undefined,
      orderBy: { createdAt: 'desc' }
    });
    expect(order?.status).toBe('cancelled');
    expect(order?.paymentStatus).toBe('failed');
    expect(await stockOf()).toBeCloseTo(before, 6);
  });

  it('营业台顾客扫码后渠道关闭交易：查询确认未收款，取消订单并释放库存', async () => {
    const before = await stockOf();
    const created = await deliver({ payMode: 'qr' });
    const orderId = created.body.order.id as string;

    gateway.query.mockResolvedValueOnce({ ok: true, status: 'closed', error: '交易已关闭' });
    const waiting = await h.api('get', `/store/orders/${orderId}/payment`, managerToken);
    expect(waiting.status).toBe(200);
    expect(waiting.body.paymentStatus).toBe('cancelled');

    const order = await h.prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('cancelled');
    expect(order?.paymentStatus).toBe('failed');
    expect(await stockOf()).toBeCloseTo(before, 6);
    expect(await h.prisma.financeEntry.count({ where: { orderId, type: 'SALE' } })).toBe(0);
    const intent = await h.prisma.paymentIntent.findFirst({ where: { orderId } });
    expect(intent?.status).toBe('failed');
  });

  it('营业台取消未支付代点单：释放库存；已支付订单拒绝取消', async () => {
    const before = await stockOf();
    const created = await deliver({ payMode: 'qr' });
    const orderId = created.body.order.id as string;

    const cancelled = await h.api('post', `/store/orders/${orderId}/cancel`, managerToken);
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.order.status).toBe('cancelled');
    expect(await stockOf()).toBeCloseTo(before, 6);

    const paidOrder = await deliver({ payMode: 'scan', authCode: '134567890123456782' });
    const refused = await h.api('post', `/store/orders/${paidOrder.body.order.id}/cancel`, managerToken);
    expect(refused.status).toBe(409);
    expect(String(refused.body.message)).toMatch(/退款/);
  });

  it('营业台扫顾客付款码：渠道即时成功则当场落账', async () => {
    const created = await deliver({ payMode: 'scan', authCode: '134567890123456789' });
    expect(created.status).toBe(201);
    expect(created.body.payment).toMatchObject({ kind: 'scan', status: 'paid' });
    expect(created.body.order.paymentStatus).toBe('paid');
    expect(gateway.micropay).toHaveBeenCalledWith(
      expect.objectContaining({ authCode: '134567890123456789', amountCents: 2000, method: 'wechat' })
    );
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('营业台扫顾客付款码失败：订单取消、库存回补、返回冲突', async () => {
    const before = await stockOf();
    gateway.micropay.mockResolvedValueOnce({ ok: true, status: 'failed', error: '余额不足' });
    const created = await deliver({ payMode: 'scan', authCode: '134567890123456780' });
    expect(created.status).toBe(409);
    expect(String(created.body.message)).toContain('余额不足');

    const after = await stockOf();
    expect(after).toBeCloseTo(before, 6);
    const orders = await h.prisma.order.findMany({ where: { paymentStatus: 'failed' } });
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0].status).toBe('cancelled');
  });

  it('现金收款：不经过渠道扣款，订单直接已支付', async () => {
    const created = await deliver({ paymentMethod: 'cash' });
    expect(created.status).toBe(201);
    expect(created.body.payment).toEqual({ kind: 'cash', status: 'paid' });
    expect(created.body.order.paymentStatus).toBe('paid');
    expect(gateway.charge).not.toHaveBeenCalled();
    expect(gateway.nativePay).not.toHaveBeenCalled();
  });

  it('退款渠道处理中：保持占用，退款回调成功后才落账', async () => {
    const created = await deliver({ payMode: 'scan', authCode: '134567890123456781' });
    const orderId = created.body.order.id as string;
    gateway.refund.mockResolvedValueOnce({ ok: true, status: 'processing', providerRef: 'HF-REF-1' });

    const refund = await h.api('post', `/store/orders/${orderId}/refund`, managerToken, { reason: '顾客改单' });
    expect(refund.status).toBe(201);
    expect(refund.body.pending).toBe(true);

    const processing = await h.prisma.refundIntent.findFirst({ where: { orderId } });
    expect(processing?.status).toBe('processing');
    expect(processing?.providerRef).toBe('HF-REF-1');
    const item = await h.prisma.orderItem.findFirst({ where: { orderId } });
    expect(item?.pendingRefundQty).toBe(1);
    expect(item?.refundedQty).toBe(0);
    expect(await h.prisma.financeEntry.count({ where: { orderId, type: 'REFUND' } })).toBe(0);

    gateway.handleCallback.mockResolvedValueOnce({
      ok: true,
      kind: 'refund',
      reference: processing!.id,
      providerRef: 'HF-REF-1',
      amountCents: 2000,
      merchantId: 'MER-SH',
      refundStatus: 'succeeded'
    });
    const callback = await payCallback({ resp_data: '{}', sign: 'sig' });
    expect(callback.status).toBe(200);
    expect(callback.body.status).toBe('succeeded');

    const settled = await h.prisma.refundIntent.findUnique({ where: { id: processing!.id } });
    expect(settled?.status).toBe('succeeded');
    const fresh = await h.prisma.order.findUnique({ where: { id: orderId } });
    expect(fresh?.refundedCents).toBe(2000);
    const line = await h.prisma.orderItem.findFirst({ where: { orderId } });
    expect(line?.refundedQty).toBe(1);
    expect(line?.pendingRefundQty).toBe(0);
    expect(await h.prisma.financeEntry.count({ where: { orderId, type: 'REFUND' } })).toBe(1);
  });
});
