/**
 * 支付回调入口：验签交给对接包，落账由业务层统一处理。
 * 这里验证三件事：未接的渠道不假装成功、回调能标单为已支付、重复回调不重复记账。
 */
import type { PaymentCallback, PaymentCallbackResult } from '@teahour/integrations';
import { HardwareService } from '../hardware/hardware.module';
import { createHarness, freshOrderBody, type Harness } from '../testing/harness';

describe('支付回调 /api/hooks/payment', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('未实现的渠道返回 501，未注册的渠道返回 404', async () => {
    const notImplemented = await h.api('post', '/hooks/payment/mock-payment', null, { ping: 1 });
    expect(notImplemented.status).toBe(501);
    expect(notImplemented.body.error).toBe('NOT_IMPLEMENTED');

    const unknown = await h.api('post', '/hooks/payment/wechat-v9', null, { ping: 1 });
    expect(unknown.status).toBe(404);
  });

  it('真实实现的回调：校验通过后把订单标为已支付，重复通知不重复记账', async () => {
    const customer = await h.customer('回调茶客');
    const created = await h.api('post', '/customer/orders', customer.token, freshOrderBody());
    expect(created.status).toBe(201);
    const orderId = created.body.order.id as string;

    // 模拟「已下单未支付」，等渠道异步通知再落账。
    // 顾客下单会即时落账，这里把杯子、流水与支付状态一起回滚，才等价于真实的待支付订单。
    await h.prisma.$transaction([
      h.prisma.orderUnit.deleteMany({ where: { orderId } }),
      h.prisma.financeEntry.deleteMany({ where: { orderId } }),
      h.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'unpaid', paidAt: null, paymentRef: null }
      })
    ]);

    const gateway = h.app.get(HardwareService).payment as unknown as {
      handleCallback?: (request: PaymentCallback) => Promise<PaymentCallbackResult>;
    };
    const received: PaymentCallback[] = [];
    gateway.handleCallback = async (request) => {
      received.push(request);
      return { ok: true, reference: orderId, providerRef: 'TEST-PAY-0001', paidAt: Date.now() };
    };

    const first = await h.api('post', '/hooks/payment/mock-payment', null, { out_trade_no: orderId });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, applied: true });

    // 验签必须拿到原始请求体，而不是重新序列化后的对象。
    expect(received).toHaveLength(1);
    expect(received[0].rawBody).toContain(orderId);

    const paid = await h.prisma.order.findUnique({ where: { id: orderId } });
    expect(paid?.paymentStatus).toBe('paid');
    expect(paid?.paymentRef).toBe('TEST-PAY-0001');
    const entriesAfterFirst = await h.prisma.financeEntry.count({ where: { orderId } });
    expect(entriesAfterFirst).toBeGreaterThan(0);

    const again = await h.api('post', '/hooks/payment/mock-payment', null, { out_trade_no: orderId });
    expect(again.status).toBe(200);
    expect(again.body.applied).toBe(true);
    expect(await h.prisma.financeEntry.count({ where: { orderId } })).toBe(entriesAfterFirst);
  });

  it('验签失败返回 400，不改动订单', async () => {
    const customer = await h.customer('失败茶客');
    const created = await h.api('post', '/customer/orders', customer.token, freshOrderBody());
    const orderId = created.body.order.id as string;
    await h.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'unpaid', paidAt: null }
    });

    const gateway = h.app.get(HardwareService).payment as unknown as {
      handleCallback?: (request: PaymentCallback) => Promise<PaymentCallbackResult>;
    };
    gateway.handleCallback = async () => ({ ok: false, error: '签名校验失败' });

    const res = await h.api('post', '/hooks/payment/mock-payment', null, { out_trade_no: orderId });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('签名校验失败');

    const order = await h.prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.paymentStatus).toBe('unpaid');
  });

  it('通知类回调（无待落账订单）只回执，不改任何订单', async () => {
    const gateway = h.app.get(HardwareService).payment as unknown as {
      handleCallback?: (request: PaymentCallback) => Promise<PaymentCallbackResult>;
    };
    gateway.handleCallback = async () => ({ ok: true });

    const res = await h.api('post', '/hooks/payment/mock-payment', null, { event: 'refund.notify' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, applied: false });
  });
});
