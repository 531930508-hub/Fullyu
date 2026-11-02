/**
 * TX-01/02/03 支付与订单状态机整改。
 *
 * 审计口径（06-整改台账.csv）：
 * - TX-01 预支付必须读取已验证、属于当前顾客的渠道身份（openId）；未绑定时阻止支付，不把内部 ID 当渠道 ID。
 * - TX-02 支付意图持久化：幂等键 + 请求内容指纹，区分失败/处理中/未知，同键同内容返回同单，同键异内容冲突。
 * - TX-03 订单状态机：迟到支付成功不得复活已取消订单；迟到失败不得取消已支付订单；重复回调不重复记账/回补库存。
 */
import { HardwareService } from '../hardware/hardware.module';
import { OrdersService } from './orders.service';
import { createHarness, freshOrderBody, type Harness } from '../testing/harness';

describe('支付幂等与订单状态机（TX-01/02/03）', () => {
  let h: Harness;
  let customerToken: string;
  let customerId: string;

  const place = (body: unknown, token = customerToken) => h.api('post', '/customer/orders', token, body);

  beforeAll(async () => {
    h = await createHarness();
    const customer = await h.customer('幂等茶客');
    customerToken = customer.token;
    customerId = customer.id;
  });

  afterAll(async () => {
    await h.close();
  });

  const stockOf = () =>
    h.prisma.stock
      .findUnique({ where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } } })
      .then((row) => row?.grams ?? 0);

  it('TX-01 游客会话（未绑定微信 openId）发起预支付被阻止', async () => {
    const guest = await h.customer('未绑微信的游客');
    const created = await place(freshOrderBody(), guest.token);
    expect(created.status).toBe(201);

    const res = await h.api('post', `/customer/orders/${created.body.order.id}/prepay`, guest.token);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/微信/);
  });

  it('TX-01 微信登录顾客预支付成功', async () => {
    const wechat = await h.api('post', '/customer/wechat/login', null, {
      code: 'tx01-openid-bind',
      phone: '13700000012'
    });
    expect(wechat.status).toBe(201);
    const token = wechat.body.token as string;

    const created = await place(freshOrderBody(), token);
    expect(created.status).toBe(201);

    const res = await h.api('post', `/customer/orders/${created.body.order.id}/prepay`, token);
    expect(res.status).toBe(201);
    expect(res.body.payment).toBeTruthy();
  });

  it('TX-02 同键同内容重复提交返回同一订单，不重复扣库存、不重复记账', async () => {
    const before = await stockOf();
    const body = { ...freshOrderBody(), idempotencyKey: 'tx02-dup-0001' };

    const first = await place(body);
    expect(first.status).toBe(201);
    const second = await place(body);
    expect(second.status).toBe(201);
    expect(second.body.order.id).toBe(first.body.order.id);

    const after = await stockOf();
    expect(before - after).toBeCloseTo(3.5, 6);
    expect(await h.prisma.financeEntry.count({ where: { orderId: first.body.order.id, type: 'SALE' } })).toBe(1);
    expect(await h.prisma.order.count({ where: { customerId } })).toBe(1);
  });

  it('TX-02 同键异内容提交冲突，原订单不受影响', async () => {
    const first = await place({ ...freshOrderBody(), idempotencyKey: 'tx02-conflict-01' });
    expect(first.status).toBe(201);

    const clash = await place({
      ...freshOrderBody(),
      idempotencyKey: 'tx02-conflict-01',
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/幂等/);

    const order = await h.prisma.order.findUnique({ where: { id: first.body.order.id } });
    expect(order?.totalCents).toBe(2000);
    expect(await h.prisma.order.count({ where: { customerId } })).toBe(2);
  });

  it('TX-02 支付意图持久化：成功意图记录订单、金额、渠道引用与响应快照', async () => {
    const created = await place({ ...freshOrderBody(), idempotencyKey: 'tx02-intent-001' });
    expect(created.status).toBe(201);

    const intent = await h.prisma.paymentIntent.findUnique({ where: { key: `${customerId}:tx02-intent-001` } });
    expect(intent).toBeTruthy();
    expect(intent?.status).toBe('succeeded');
    expect(intent?.orderId).toBe(created.body.order.id);
    expect(intent?.amountCents).toBe(2000);
    expect(intent?.method).toBe('wechat');
    expect(intent?.providerRef || '').toMatch(/^PAY-/);
    expect(intent?.fingerprint).toMatch(/^[0-9a-f]{16,}$/);
    expect(intent?.responseJson || '').toContain(created.body.order.id);
  });

  it('TX-02 扣款失败：订单取消、库存回补、意图记录失败原因', async () => {
    const before = await stockOf();
    const gateway = h.app.get(HardwareService).payment as unknown as { simulateFailure(): void };
    gateway.simulateFailure();

    const res = await place({ ...freshOrderBody(), idempotencyKey: 'tx02-fail-0001' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/支付未完成|重试/);

    const intent = await h.prisma.paymentIntent.findUnique({ where: { key: `${customerId}:tx02-fail-0001` } });
    expect(intent?.status).toBe('failed');
    expect(intent?.failReason || '').toMatch(/支付未完成/);
    expect(intent?.orderId).toBeTruthy();

    const order = await h.prisma.order.findUnique({ where: { id: intent?.orderId || '' } });
    expect(order?.status).toBe('cancelled');
    expect(order?.paymentStatus).toBe('failed');
    expect(await stockOf()).toBeCloseTo(before, 6);
    expect(await h.prisma.financeEntry.count({ where: { orderId: order?.id } })).toBe(0);
  });

  it('TX-02 同键重试：失败后重试成功收敛到同一订单，库存只扣一次', async () => {
    const before = await stockOf();
    const body = { ...freshOrderBody(), idempotencyKey: 'tx02-retry-001' };

    const gateway = h.app.get(HardwareService).payment as unknown as { simulateFailure(): void };
    gateway.simulateFailure();
    const failed = await place(body);
    expect(failed.status).toBe(409);
    const failedIntent = await h.prisma.paymentIntent.findUnique({ where: { key: `${customerId}:tx02-retry-001` } });
    expect(failedIntent?.status).toBe('failed');
    const firstId = failedIntent?.orderId as string;

    const retried = await place(body);
    expect(retried.status).toBe(201);
    expect(retried.body.order.id).toBe(firstId);
    expect(retried.body.order.paymentStatus).toBe('paid');

    const intent = await h.prisma.paymentIntent.findUnique({ where: { key: `${customerId}:tx02-retry-001` } });
    expect(intent?.status).toBe('succeeded');
    expect(intent?.orderId).toBe(firstId);
    expect(await stockOf()).toBeCloseTo(before - 3.5, 6);
    expect(await h.prisma.financeEntry.count({ where: { orderId: firstId, type: 'SALE' } })).toBe(1);
    expect(await h.prisma.order.count({ where: { customerId } })).toBe(
      5 // dup-1 + conflict-1 + intent-1 + fail-1 + retry（复用同一单）
    );
  });

  it('TX-02 中断恢复：意图卡在 processing 时同键重试通过查询收敛', async () => {
    const created = await place({ ...freshOrderBody(), idempotencyKey: 'tx02-crash-001' });
    expect(created.status).toBe(201);
    const orderId = created.body.order.id;

    // 模拟进程在 markPaid 之后、意图落终态之前崩溃。
    await h.prisma.paymentIntent.update({
      where: { key: `${customerId}:tx02-crash-001` },
      data: { status: 'processing', providerRef: null, responseJson: null }
    });

    const replay = await place({ ...freshOrderBody(), idempotencyKey: 'tx02-crash-001' });
    expect(replay.status).toBe(201);
    expect(replay.body.order.id).toBe(orderId);

    const paidRow = await h.prisma.order.findUnique({ where: { id: orderId } });
    const intent = await h.prisma.paymentIntent.findUnique({ where: { key: `${customerId}:tx02-crash-001` } });
    expect(intent?.status).toBe('succeeded');
    expect(intent?.providerRef).toBe(paidRow?.paymentRef);
    expect(intent?.providerRef || '').toMatch(/^PAY-/);
    expect(await h.prisma.financeEntry.count({ where: { orderId, type: 'SALE' } })).toBe(1);
  });

  it('TX-03 迟到支付成功不能复活已取消订单：拦截、留痕、标记待人工处理', async () => {
    // 先制造一笔取消订单（扣款失败路径）。
    const gateway = h.app.get(HardwareService).payment as unknown as { simulateFailure(): void };
    gateway.simulateFailure();
    const failed = await place({ ...freshOrderBody(), idempotencyKey: 'tx03-late-0001' });
    expect(failed.status).toBe(409);
    const cancelledId = (
      await h.prisma.paymentIntent.findUnique({ where: { key: `${customerId}:tx03-late-0001` } })
    )?.orderId as string;

    const stockAtCancel = await stockOf();

    // 渠道迟到通知「已支付」。
    const hooks = h.app.get(HardwareService).payment as unknown as {
      handleCallback?: (request: unknown) => Promise<{ ok: boolean; reference?: string; providerRef?: string }>;
    };
    hooks.handleCallback = async () => ({ ok: true, reference: cancelledId, providerRef: 'LATE-PAY-0001' });
    const callback = await h.api('post', '/hooks/payment/mock-payment', null, { out_trade_no: cancelledId });
    expect(callback.status).toBe(200);

    const order = await h.prisma.order.findUnique({ where: { id: cancelledId } });
    expect(order?.status).toBe('cancelled');
    expect(order?.paymentStatus).toBe('failed');
    expect(await stockOf()).toBeCloseTo(stockAtCancel, 6);
    expect(await h.prisma.financeEntry.count({ where: { orderId: cancelledId } })).toBe(0);

    const log = await h.prisma.log.findFirst({ where: { orderId: cancelledId, action: { contains: '拦截' } } });
    expect(log).toBeTruthy();
    expect(log?.type).toBe('payment');
  });

  it('TX-03 迟到支付失败不能取消已支付订单，库存不得回补', async () => {
    const created = await place({ ...freshOrderBody(), idempotencyKey: 'tx03-latefail-01' });
    expect(created.status).toBe(201);
    const orderId = created.body.order.id;
    const stockAtPaid = await stockOf();

    await (h.app.get(OrdersService) as unknown as { markPaymentFailed(id: string, r: string): Promise<void> })
      .markPaymentFailed(orderId, '渠道迟到的失败通知');

    const order = await h.prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.status).toBe('pending');
    expect(await stockOf()).toBeCloseTo(stockAtPaid, 6);

    const log = await h.prisma.log.findFirst({ where: { orderId, action: { contains: '迟到' } } });
    expect(log).toBeTruthy();
  });

  it('TX-03 重复失败通知不会二次回补库存', async () => {
    // 复用 tx02-fail-0001 的取消订单，再次触发失败落账应被幂等拒绝。
    const cancelledId = (
      await h.prisma.paymentIntent.findUnique({ where: { key: `${customerId}:tx02-fail-0001` } })
    )?.orderId as string;
    const stockBefore = await stockOf();

    await (h.app.get(OrdersService) as unknown as { markPaymentFailed(id: string, r: string): Promise<void> })
      .markPaymentFailed(cancelledId, '重复的失败通知');

    expect(await stockOf()).toBeCloseTo(stockBefore, 6);
    const order = await h.prisma.order.findUnique({ where: { id: cancelledId } });
    expect(order?.status).toBe('cancelled');
    expect(order?.paymentStatus).toBe('failed');
  });
});
