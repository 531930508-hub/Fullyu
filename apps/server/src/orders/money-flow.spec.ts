/**
 * 资金正逆向链路验收：收款 → 退款 → 回调 → 重试/崩溃恢复。
 *
 * 关注的不是 happy path，而是运营中真正会出问题的点：
 * - 用券订单只能退「实付金额」，部分退款累计不能超过实付；
 * - 渠道明确失败释放占用、结果未知保留占用，二者不能混；
 * - 重复回调、迟到回调、并发回调不能重复记账、重复回补库存或把占用扣成负数；
 * - 重试必须复用同一退款单号，成功后再重试保持幂等；
 * - 崩溃在「已占用、未调渠道」时能从持久化状态恢复。
 */
import { ACCOUNTS, createHarness, freshOrderBody, type Harness } from '../testing/harness';
import { HardwareService } from '../hardware/hardware.module';
import { OrdersService } from './orders.service';
import type { PaymentResult } from '@teahour/integrations';

type RefundScript = Array<() => Promise<PaymentResult>>;
type AsyncGateway = Record<string, unknown> & {
  name: string;
  asyncPayments: boolean;
  merchantFor?: (storeId: string) => string;
};

const okRefund = (): Promise<PaymentResult> =>
  Promise.resolve({ ok: true, providerRef: `REF-OK-${Date.now()}`, paidAt: Date.now() });
const failRefund = (reason = '渠道明确拒绝') => (): Promise<PaymentResult> =>
  Promise.resolve({ ok: false, error: reason });
const timeoutRefund = (): Promise<PaymentResult> => Promise.reject(new Error('渠道网络超时'));

describe('资金正逆向链路：金额、防重与重试', () => {
  let h: Harness;
  let managerToken: string;
  let financeToken: string;
  let refundCalls: Array<{ reference: string; amountCents: number }>;
  let script: RefundScript;

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
    financeToken = await h.login(ACCOUNTS.finance);
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(() => {
    script = [];
    refundCalls = [];
    const gateway = h.app.get(HardwareService).payment as unknown as {
      refund: (req: { reference: string; amountCents: number }) => Promise<PaymentResult>;
    };
    gateway.refund = async (req) => {
      refundCalls.push({ reference: req.reference, amountCents: req.amountCents });
      if (!script.length) {
        return { ok: true, providerRef: `REF-${refundCalls.length}`, paidAt: Date.now() };
      }
      const action = script[Math.min(refundCalls.length - 1, script.length - 1)];
      return action();
    };
  });

  const service = () => h.app.get(OrdersService);

  const placePaid = async (
    overrides: Record<string, unknown> = {},
    token?: string
  ): Promise<{
    id: string;
    number: string;
    status: string;
    totalCents: number;
    refundedCents: number;
    items: Array<{ id: string; name: string; qty: number }>;
  }> => {
    const t = token || (await h.customer('资金茶客')).token;
    const res = await h.api('post', '/customer/orders', t, {
      ...freshOrderBody(),
      type: 'takeaway',
      seat: null,
      ...overrides
    });
    if (res.status !== 201) throw new Error(`下单失败 ${res.status} ${res.text}`);
    return res.body.order;
  };

  const refund = (orderId: string, body: Record<string, unknown> = {}) =>
    h.api('post', `/store/orders/${orderId}/refund`, managerToken, body);

  let couponSeq = 0;
  const issueCoupon = async (
    customerId: string,
    overrides: { amountCents?: number; scope?: string; categoryId?: string | null } = {}
  ): Promise<string> => {
    couponSeq += 1;
    const now = Date.now();
    const coupon = await h.prisma.coupon.create({
      data: {
        id: `CP-MF-${process.pid}-${couponSeq}`,
        title: '资金测试券',
        scope: overrides.scope || 'all',
        categoryId: overrides.categoryId || null,
        amountCents: overrides.amountCents ?? 500,
        minSpendCents: 0,
        validFrom: new Date(now - 60_000),
        validTo: new Date(now + 86_400_000)
      }
    });
    const held = await h.prisma.customerCoupon.create({
      data: {
        id: `CC-MF-${process.pid}-${couponSeq}`,
        couponId: coupon.id,
        customerId,
        status: 'available'
      }
    });
    return held.id;
  };

  const stockOf = () =>
    h.prisma.stock
      .findUnique({ where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } } })
      .then((row) => row?.grams ?? 0);

  /** 用异步网关建一笔「已扣库存、未支付」的订单，返回订单与还原函数。 */
  const placeUnpaidAsync = async (): Promise<{
    orderId: string;
    totalCents: number;
    restore: () => void;
  }> => {
    const integrations = h.app.get(HardwareService).integrations as unknown as {
      payment: AsyncGateway;
    };
    const previous = integrations.payment;
    integrations.payment = {
      name: 'fake-async-payment',
      mode: 'live',
      displayName: '异步测试渠道',
      asyncPayments: true,
      charge: async () => ({ ok: false, error: '异步渠道不走同步扣款' }),
      refund: async () => ({ ok: true, providerRef: 'REF-A', status: 'succeeded' }),
      status: async () => ({ online: true, mode: 'live' }),
      prepay: async () => ({ ok: true, payment: {} }),
      nativePay: async () => ({ ok: true, qrCode: 'weixin://x', providerRef: 'HF-N' }),
      micropay: async () => ({ ok: true, status: 'paid', providerRef: 'HF-M' }),
      query: async () => ({ ok: true, status: 'pending' }),
      handleCallback: async () => ({ ok: true }),
      merchantFor: (storeId: string) => (storeId === 'sh' ? 'MER-SH' : '')
    } as unknown as AsyncGateway;
    const customer = await h.customer('异步回调客');
    const res = await h.api('post', '/customer/orders', customer.token, {
      ...freshOrderBody(),
      idempotencyKey: `mf-async-${Date.now()}`
    });
    if (res.status !== 201) throw new Error(`异步下单失败 ${res.status} ${res.text}`);
    return {
      orderId: res.body.order.id as string,
      totalCents: res.body.order.totalCents as number,
      restore: () => {
        integrations.payment = previous;
      }
    };
  };

  describe('退款金额（优惠券与实付口径）', () => {
    it('用券订单全额退款只退实付金额，退款后不能重复退', async () => {
      const customer = await h.customer('用券退款客');
      const couponId = await issueCoupon(customer.id, { amountCents: 500 });
      const order = await placePaid({ couponId }, customer.token);
      expect(order.totalCents).toBe(1500);

      const res = await refund(order.id, { reason: '整单退' });
      expect(res.status).toBe(201);
      expect(res.body.refundedCents).toBe(1500);

      const row = await h.prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.refundedCents).toBe(1500);
      expect(row?.status).toBe('refunded');

      const entries = await h.prisma.financeEntry.findMany({ where: { orderId: order.id } });
      expect(entries.find((x) => x.type === 'SALE')?.amountCents).toBe(1500);
      expect(entries.find((x) => x.type === 'REFUND')?.amountCents).toBe(-1500);
      expect(entries.reduce((sum, x) => sum + x.amountCents, 0)).toBe(0);

      const again = await refund(order.id, { reason: '重复退' });
      expect(again.status).toBe(409);
    });

    it('用券订单分两次退款，累计等于实付且第二次即可退完', async () => {
      const customer = await h.customer('分次退款客');
      const couponId = await issueCoupon(customer.id, { amountCents: 500 });
      const order = await placePaid(
        { couponId, items: [{ productId: 'xing-0', qty: 2, temp: '热' }] },
        customer.token
      );
      expect(order.totalCents).toBe(3500);

      const first = await refund(order.id, {
        items: [{ itemId: order.items[0].id, qty: 1 }],
        reason: '退一杯'
      });
      expect(first.status).toBe(201);
      expect(first.body.refundedCents).toBe(1750);

      const second = await refund(order.id, {
        items: [{ itemId: order.items[0].id, qty: 1 }],
        reason: '退第二杯'
      });
      expect(second.status).toBe(201);
      expect(second.body.refundedCents).toBe(1750);

      const row = await h.prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.refundedCents).toBe(3500);
      expect(row?.status).toBe('refunded');
      const refundEntries = await h.prisma.financeEntry.findMany({
        where: { orderId: order.id, type: 'REFUND' }
      });
      expect(refundEntries).toHaveLength(2);
      expect(refundEntries.reduce((sum, x) => sum + x.amountCents, 0)).toBe(-3500);
    });

    it('品类券只分摊到适用商品，退不适用商品按原价退', async () => {
      const customer = await h.customer('品类券退款客');
      const couponId = await issueCoupon(customer.id, {
        amountCents: 500,
        scope: 'category',
        categoryId: 'fresh'
      });
      const order = await placePaid(
        {
          couponId,
          items: [
            { productId: 'xing-0', qty: 1, temp: '热' },
            { productId: 'xing-5', qty: 1, temp: '冰' }
          ]
        },
        customer.token
      );
      expect(order.totalCents).toBe(3900);
      const kombucha = order.items.find((x) => x.name.includes('菠萝'))!;
      const fresh = order.items.find((x) => x.name.includes('蜜香'))!;

      // 不适用券的康普茶按 2400 原价退，不承担券的折扣。
      const first = await refund(order.id, {
        items: [{ itemId: kombucha.id, qty: 1 }],
        reason: '退康普茶'
      });
      expect(first.status).toBe(201);
      expect(first.body.refundedCents).toBe(2400);

      // 适用券的鲜酿行只退 2000 - 500 = 1500，两笔合计正好等于实付。
      const second = await refund(order.id, {
        items: [{ itemId: fresh.id, qty: 1 }],
        reason: '退鲜酿'
      });
      expect(second.status).toBe(201);
      expect(second.body.refundedCents).toBe(1500);

      const row = await h.prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.refundedCents).toBe(3900);
      expect(row?.status).toBe('refunded');
    });
  });

  describe('退款防重与占用', () => {
    it('结果未知时保留占用，再次整单退款被拒而不是叠加占用', async () => {
      script = [timeoutRefund];
      const order = await placePaid({ idempotencyKey: `mf-unknown-${Date.now()}` });
      const first = await refund(order.id, { reason: '超时' });
      expect(first.status).toBe(409);

      const second = await refund(order.id, { reason: '再退一次' });
      expect(second.status).toBe(409);
      expect(String(second.body.message)).toMatch(/处理中|剩余可退/);

      const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(item?.pendingRefundQty).toBe(1);
      expect(item?.refundedQty).toBe(0);
      expect(await h.prisma.refundIntent.count({ where: { orderId: order.id } })).toBe(1);
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(0);
    });

    it('并发重试同一未知退款只落账一次', async () => {
      script = [timeoutRefund, okRefund, okRefund];
      const order = await placePaid({ idempotencyKey: `mf-concurrent-retry-${Date.now()}` });
      const first = await refund(order.id, { reason: '超时后重试' });
      expect(first.status).toBe(409);
      const intent = await h.prisma.refundIntent.findFirst({ where: { orderId: order.id } });

      const [a, b] = await Promise.all([
        h.api('post', `/store/refunds/${intent?.id}/retry`, managerToken, {}),
        h.api('post', `/store/refunds/${intent?.id}/retry`, managerToken, {})
      ]);
      expect([a.status, b.status].every((status) => status === 201)).toBe(true);

      const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(item?.refundedQty).toBe(1);
      expect(item?.pendingRefundQty).toBe(0);
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(1);
      const row = await h.prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.refundedCents).toBe(2000);
    });

    it('已成功的退款单重试保持幂等，不再调用渠道', async () => {
      const order = await placePaid({ idempotencyKey: `mf-idempotent-${Date.now()}` });
      const res = await refund(order.id, { reason: '正常退' });
      expect(res.status).toBe(201);
      const intent = await h.prisma.refundIntent.findFirst({ where: { orderId: order.id } });
      const callsBefore = refundCalls.length;

      const retry = await h.api('post', `/store/refunds/${intent?.id}/retry`, managerToken, {});
      expect(retry.status).toBe(201);
      expect(retry.body.ok).toBe(true);
      expect(retry.body.status).toBe('succeeded');
      expect(refundCalls.length).toBe(callsBefore);
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(1);
    });

    it('非审批的确定失败退款单必须重新发起，不能直接重试', async () => {
      script = [failRefund('余额不足')];
      const order = await placePaid({ idempotencyKey: `mf-failed-retry-${Date.now()}` });
      const first = await refund(order.id, { reason: '渠道失败' });
      expect(first.status).toBe(409);
      const intent = await h.prisma.refundIntent.findFirst({ where: { orderId: order.id } });
      expect(intent?.status).toBe('failed');

      const retry = await h.api('post', `/store/refunds/${intent?.id}/retry`, managerToken, {});
      expect(retry.status).toBe(409);
      expect(String(retry.body.message)).toMatch(/重新发起/);
    });

    it('进程中断后停在「已占用」的退款单可重试收敛', async () => {
      const order = await placePaid({ idempotencyKey: `mf-crash-${Date.now()}` });
      const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      const intentId = `RF-MF-CRASH-${Date.now()}`;
      const now = new Date();
      // 模拟「已占用、尚未调用渠道」时进程退出。
      await h.prisma.$transaction(async (tx) => {
        await tx.orderItem.update({
          where: { id: item!.id },
          data: { pendingRefundQty: { increment: 1 } }
        });
        await tx.refundIntent.create({
          data: {
            id: intentId,
            orderId: order.id,
            status: 'occupied',
            amountCents: 2000,
            linesJson: JSON.stringify([{ itemId: item!.id, qty: 1, amountCents: 2000, costCents: 600 }]),
            reason: '崩溃恢复',
            decidedBy: '测试',
            createdAt: now,
            updatedAt: now
          }
        });
      });

      const retry = await h.api('post', `/store/refunds/${intentId}/retry`, managerToken, {});
      expect(retry.status).toBe(201);
      expect(retry.body.status).toBe('succeeded');
      expect(refundCalls[0].reference).toBe(intentId);
      const after = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(after?.refundedQty).toBe(1);
      expect(after?.pendingRefundQty).toBe(0);
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(1);
    });
  });

  describe('退款回调状态机', () => {
    const unknownIntent = async (unique: string) => {
      script = [timeoutRefund];
      const order = await placePaid({ idempotencyKey: `mf-cb-${unique}-${Date.now()}` });
      const res = await refund(order.id, { reason: '制造未知退款' });
      expect(res.status).toBe(409);
      const intent = await h.prisma.refundIntent.findFirst({ where: { orderId: order.id } });
      expect(intent?.status).toBe('unknown');
      script = [];
      return { order, intent: intent! };
    };

    it('重复的失败回调只释放一次占用，不出现负数', async () => {
      const { order, intent } = await unknownIntent('fail-twice');
      const payload = {
        reference: intent.id,
        status: 'failed' as const,
        error: '渠道退款失败'
      };
      expect(await service().applyRefundCallback(payload)).toBe('failed');
      expect(await service().applyRefundCallback(payload)).toBe('failed');

      const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(item?.pendingRefundQty).toBe(0);
      expect(item?.refundedQty).toBe(0);
      const fresh = await h.prisma.refundIntent.findUnique({ where: { id: intent.id } });
      expect(fresh?.status).toBe('failed');
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(0);
    });

    it('确定失败后迟到的成功回调不静默落账，留痕待人工核对', async () => {
      const { order, intent } = await unknownIntent('late-success');
      expect(await service().applyRefundCallback({ reference: intent.id, status: 'failed', error: '拒绝' })).toBe('failed');

      const outcome = await service().applyRefundCallback({
        reference: intent.id,
        providerRef: 'LATE-REF',
        amountCents: 2000,
        status: 'succeeded'
      });
      expect(outcome).toBe('ignored');

      const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(item?.pendingRefundQty).toBe(0);
      expect(item?.refundedQty).toBe(0);
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(0);
      const fresh = await h.prisma.refundIntent.findUnique({ where: { id: intent.id } });
      expect(fresh?.status).toBe('failed');
      const log = await h.prisma.log.findFirst({
        where: { orderId: order.id, action: { contains: '退款' }, detail: { contains: '人工' } }
      });
      expect(log).toBeTruthy();
    });

    it('退款回调金额多于应退被拒绝，不落账也不释放占用', async () => {
      const { order, intent } = await unknownIntent('over-amount');
      await expect(
        service().applyRefundCallback({
          reference: intent.id,
          providerRef: 'OVER-REF',
          amountCents: intent.amountCents + 100,
          status: 'succeeded'
        })
      ).rejects.toThrow(/金额/);

      const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(item?.pendingRefundQty).toBe(1);
      expect(item?.refundedQty).toBe(0);
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(0);
    });

    it('退款回调金额少于应退被拒绝', async () => {
      const { intent } = await unknownIntent('under-amount');
      await expect(
        service().applyRefundCallback({
          reference: intent.id,
          providerRef: 'UNDER-REF',
          amountCents: intent.amountCents - 100,
          status: 'succeeded'
        })
      ).rejects.toThrow(/金额/);
    });

    it('退款回调子商户与订单门店不一致被拒绝', async () => {
      const { intent } = await unknownIntent('merchant');
      const gateway = h.app.get(HardwareService).payment as unknown as {
        merchantFor?: (storeId: string) => string;
      };
      const previous = gateway.merchantFor;
      gateway.merchantFor = (storeId: string) => (storeId === 'sh' ? 'MER-SH' : '');
      try {
        await expect(
          service().applyRefundCallback({
            reference: intent.id,
            providerRef: 'OTHER-MER',
            amountCents: intent.amountCents,
            merchantId: 'MER-OTHER',
            status: 'succeeded'
          })
        ).rejects.toThrow(/子商户/);
      } finally {
        gateway.merchantFor = previous;
      }
    });

    it('重复的成功回调只记一笔退款', async () => {
      const { order, intent } = await unknownIntent('success-twice');
      const payload = {
        reference: intent.id,
        providerRef: 'OK-REF',
        amountCents: intent.amountCents,
        status: 'succeeded' as const
      };
      expect(await service().applyRefundCallback(payload)).toBe('succeeded');
      expect(await service().applyRefundCallback(payload)).toBe('succeeded');

      const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(item?.refundedQty).toBe(1);
      expect(item?.pendingRefundQty).toBe(0);
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(1);
    });

    it('已失败退款单收到「处理中」回调不会复活占用', async () => {
      const { order, intent } = await unknownIntent('resurrect');
      expect(await service().applyRefundCallback({ reference: intent.id, status: 'failed', error: '拒绝' })).toBe('failed');

      const outcome = await service().applyRefundCallback({
        reference: intent.id,
        providerRef: 'PROC-REF',
        status: 'processing'
      });
      expect(outcome).toBe('ignored');
      const fresh = await h.prisma.refundIntent.findUnique({ where: { id: intent.id } });
      expect(fresh?.status).toBe('failed');
      const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(item?.pendingRefundQty).toBe(0);
    });

    it('找不到退款单的回调被忽略并留痕', async () => {
      const outcome = await service().applyRefundCallback({
        reference: 'RF-MF-NOT-EXIST',
        status: 'succeeded',
        amountCents: 100
      });
      expect(outcome).toBe('ignored');
      const log = await h.prisma.log.findFirst({
        where: { action: '退款回调找不到退款单', detail: { contains: 'RF-MF-NOT-EXIST' } }
      });
      expect(log).toBeTruthy();
    });
  });

  describe('支付回调防重与迟到通知', () => {
    it('已退款订单再收到支付成功回调，不新增销售、不复活订单', async () => {
      const order = await placePaid({ idempotencyKey: `mf-late-paid-${Date.now()}` });
      const refunded = await refund(order.id, { reason: '退款后再回调' });
      expect(refunded.status).toBe(201);

      const outcome = await service().settlePaymentCallback({
        reference: order.id,
        providerRef: 'HF-DUP',
        amountCents: order.totalCents,
        status: 'paid'
      });
      expect(outcome).toBe('duplicate');
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'SALE' } })).toBe(1);
      const row = await h.prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.status).toBe('refunded');
    });

    it('并发的重复支付成功回调只记一次销售、不重复出杯', async () => {
      const { orderId, totalCents, restore } = await placeUnpaidAsync();
      try {
        const payload = {
          reference: orderId,
          providerRef: 'HF-CONCURRENT',
          amountCents: totalCents,
          merchantId: 'MER-SH',
          status: 'paid' as const
        };
        const outcomes = await Promise.all([
          service().settlePaymentCallback(payload),
          service().settlePaymentCallback(payload)
        ]);
        expect(outcomes.sort()).toEqual(['applied', 'duplicate']);
        expect(await h.prisma.financeEntry.count({ where: { orderId, type: 'SALE' } })).toBe(1);
        expect(await h.prisma.orderUnit.count({ where: { orderId } })).toBe(1);
      } finally {
        restore();
      }
    });

    it('并发的重复支付失败回调只回补一次库存', async () => {
      const before = await stockOf();
      const { orderId, restore } = await placeUnpaidAsync();
      const afterOrder = await stockOf();
      expect(afterOrder).toBeCloseTo(before - 3.5, 6);
      try {
        const markFailed = (
          service() as unknown as {
            markPaymentFailed: (id: string, reason: string) => Promise<void>;
          }
        ).markPaymentFailed.bind(service());
        await Promise.all([
          markFailed(orderId, '渠道失败通知 A'),
          markFailed(orderId, '渠道失败通知 B')
        ]);
        expect(await stockOf()).toBeCloseTo(before, 6);
        const row = await h.prisma.order.findUnique({ where: { id: orderId } });
        expect(row?.status).toBe('cancelled');
        expect(row?.paymentStatus).toBe('failed');
      } finally {
        restore();
      }
    });

    it('顾客取消已支付订单被拒绝', async () => {
      const customer = await h.customer('取消已支付');
      const order = await placePaid({ idempotencyKey: `mf-cancel-paid-${Date.now()}` }, customer.token);
      const res = await h.api('post', `/customer/orders/${order.id}/cancel`, customer.token);
      expect(res.status).toBe(409);
      const row = await h.prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.paymentStatus).toBe('paid');
    });

    it('找不到订单的支付回调被忽略并留痕', async () => {
      const outcome = await service().settlePaymentCallback({
        reference: 'SO-MF-NOT-EXIST',
        status: 'paid',
        amountCents: 100
      });
      expect(outcome).toBe('ignored');
      const log = await h.prisma.log.findFirst({
        where: { action: '支付回调找不到订单', detail: { contains: 'SO-MF-NOT-EXIST' } }
      });
      expect(log).toBeTruthy();
    });
  });

  describe('审批退款并发', () => {
    it('同一退款审批并发批准只有一个生效，钱只退一次', async () => {
      const order = await placePaid({
        items: [{ productId: 'xing-0', qty: 3, temp: '热' }],
        idempotencyKey: `mf-approve-${Date.now()}`
      });
      expect(order.totalCents).toBe(6000);
      const request = await refund(order.id, { reason: '整单售后' });
      expect(request.body.mode).toBe('approval');
      const approvalId = request.body.approval.id as string;

      const [a, b] = await Promise.all([
        h.api('post', `/admin/approvals/${approvalId}/decide`, financeToken, {
          decision: 'approve',
          comment: '同意'
        }),
        h.api('post', `/admin/approvals/${approvalId}/decide`, financeToken, {
          decision: 'approve',
          comment: '同意'
        })
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);

      const row = await h.prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.refundedCents).toBe(6000);
      expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(1);
      const items = await h.prisma.orderItem.findMany({ where: { orderId: order.id } });
      expect(items[0].refundedQty).toBe(3);
      expect(items[0].pendingRefundQty).toBe(0);
    });

    it('退款申请被驳回后释放待办标记，可重新申请', async () => {
      const order = await placePaid({
        items: [{ productId: 'xing-0', qty: 3, temp: '热' }],
        idempotencyKey: `mf-reject-${Date.now()}`
      });
      const request = await refund(order.id, { reason: '先申请' });
      expect(request.body.mode).toBe('approval');

      const rejected = await h.api(
        'post',
        `/admin/approvals/${request.body.approval.id}/decide`,
        financeToken,
        { decision: 'reject', comment: '资料不全' }
      );
      expect(rejected.status).toBe(201);
      const row = await h.prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.refundPending).toBe(false);

      const again = await refund(order.id, { reason: '补充后重新申请' });
      expect(again.status).toBe(201);
      expect(again.body.mode).toBe('approval');
    });
  });
});
