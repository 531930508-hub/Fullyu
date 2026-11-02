/**
 * TX-04/05 退款链与杯次映射整改。
 *
 * 审计口径（06-整改台账.csv）：
 * - TX-04 退款先持久化意图并原子占用可退数量（稳定退款单号），再调外部网关；
 *   区分确定失败（释放占用）与未知（保留占用可重试）；确认成功后才落账。
 * - TX-05 部分退款映射到具体杯次：未制作的杯按标签序原子解除占用并回补库存；
 *   已制作订单保留成本与已出杯状态；补打只针对仍有效的杯。
 */
import {
  ACCOUNTS,
  createHarness,
  freshOrderBody,
  type Harness
} from '../testing/harness';
import { HardwareService } from '../hardware/hardware.module';
import type { PaymentResult } from '@teahour/integrations';

type RefundRecorder = Array<{ reference: string; amountCents: number }>;

describe('退款链与杯次映射（TX-04/05）', () => {
  let h: Harness;
  let managerToken: string;
  let financeToken: string;
  let refundCalls: RefundRecorder;

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
    financeToken = await h.login(ACCOUNTS.finance);
    refundCalls = [];
  });

  afterAll(async () => {
    await h.close();
  });

  const place = async (body: unknown) => {
    const res = await h.api('post', '/customer/orders', (await h.customer('退款茶客')).token, body);
    if (res.status !== 201) throw new Error(`下单失败 ${res.status} ${res.text}`);
    return res.body.order as {
      id: string;
      number: string;
      status: string;
      totalCents: number;
      refundedCents: number;
      items: Array<{ id: string; qty: number }>;
      units: Array<{ id: string; label: string; status: string }>;
    };
  };

  const refund = (orderId: string, body: unknown = {}, token = managerToken) =>
    h.api('post', `/store/orders/${orderId}/refund`, token, body);

  /** 让 mock 网关的退款行为可编排：依次执行队列里的动作，默认成功。 */
  const scriptRefund = (script: Array<() => Promise<PaymentResult>>) => {
    const gateway = h.app.get(HardwareService).payment as unknown as {
      refund: (req: { reference: string; amountCents: number }) => Promise<PaymentResult>;
    };
    let call = 0;
    refundCalls = [];
    gateway.refund = async (req) => {
      refundCalls.push({ reference: req.reference, amountCents: req.amountCents });
      const action = script[Math.min(call, script.length - 1)];
      call += 1;
      return action();
    };
  };

  const okRefund = (): Promise<PaymentResult> =>
    Promise.resolve({ ok: true, providerRef: `REF-TEST-${Date.now()}`, paidAt: Date.now() });

  it('TX-04 限额内退款：意图持久化、稳定退款单号、确认后才落账', async () => {
    scriptRefund([okRefund]);
    const order = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    const res = await refund(order.id, { reason: '顾客改单' });
    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('refunded');
    expect(res.body.refundedCents).toBe(2000);

    const intents = await h.prisma.refundIntent.findMany({ where: { orderId: order.id } });
    expect(intents).toHaveLength(1);
    expect(intents[0].status).toBe('succeeded');
    expect(intents[0].id).toMatch(/^RF-/);
    expect(intents[0].amountCents).toBe(2000);
    expect(intents[0].providerRef).toBeTruthy();

    // 渠道调用使用稳定退款单号
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0].reference).toBe(intents[0].id);

    const entry = await h.prisma.financeEntry.findFirst({ where: { orderId: order.id, type: 'REFUND' } });
    expect(entry?.dedupeKey).toBe(`REFUND:${intents[0].id}`);
    expect(entry?.amountCents).toBe(-2000);

    const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(item?.refundedQty).toBe(1);
    expect(item?.pendingRefundQty).toBe(0);

    const fresh = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh?.refundedCents).toBe(2000);
  });

  it('TX-04 渠道确定失败：释放占用、不落账、订单保持已支付', async () => {
    scriptRefund([() => Promise.resolve({ ok: false, error: '余额不足' })]);
    const order = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    const res = await refund(order.id, { reason: '渠道失败' });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('余额不足');

    const intent = await h.prisma.refundIntent.findFirst({ where: { orderId: order.id } });
    expect(intent?.status).toBe('failed');
    expect(intent?.failReason).toContain('余额不足');

    const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(item?.refundedQty).toBe(0);
    expect(item?.pendingRefundQty).toBe(0);

    expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(0);
    const fresh = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh?.paymentStatus).toBe('paid');
    expect(fresh?.refundedCents).toBe(0);
  });

  it('TX-04 渠道超时未知：占用保留，重试复用同一退款单号收敛', async () => {
    scriptRefund([
      () => Promise.reject(new Error('渠道网络超时')),
      okRefund
    ]);
    const order = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    const first = await refund(order.id, { reason: '超时未知' });
    expect(first.status).toBe(409);

    const intent = await h.prisma.refundIntent.findFirst({ where: { orderId: order.id } });
    expect(intent?.status).toBe('unknown');
    expect(intent?.failReason).toContain('超时');

    // 未知状态下占用不释放：可退数量仍被锁住
    const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(item?.pendingRefundQty).toBe(1);
    expect(item?.refundedQty).toBe(0);
    expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(0);

    const retry = await h.api('post', `/store/refunds/${intent?.id}/retry`, managerToken, {});
    expect(retry.status).toBe(201);
    expect(retry.body.ok).toBe(true);

    // 复用同一退款单号调渠道（渠道幂等）
    expect(refundCalls).toHaveLength(2);
    expect(refundCalls[0].reference).toBe(refundCalls[1].reference);

    const converged = await h.prisma.refundIntent.findUnique({ where: { id: intent?.id || '' } });
    expect(converged?.status).toBe('succeeded');
    const after = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(after?.refundedQty).toBe(1);
    expect(after?.pendingRefundQty).toBe(0);
    expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(1);
    const fresh = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh?.refundedCents).toBe(2000);
  });

  it('TX-04 并发重复退款：占用互斥，只成功一次', async () => {
    scriptRefund([okRefund]);
    const order = await place({
      ...freshOrderBody(),
      type: 'takeaway',
      seat: null,
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });
    const [a, b] = await Promise.all([refund(order.id, {}), refund(order.id, {})]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const intents = await h.prisma.refundIntent.findMany({ where: { orderId: order.id } });
    expect(intents.filter((x) => x.status === 'succeeded')).toHaveLength(1);
    const item = await h.prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(item?.refundedQty).toBe(2);
    expect(item?.pendingRefundQty).toBe(0);
    expect(await h.prisma.financeEntry.count({ where: { orderId: order.id, type: 'REFUND' } })).toBe(1);
  });

  it('TX-05 部分退款映射到具体杯次，其余杯仍可出餐，补打排除已退杯', async () => {
    scriptRefund([okRefund]);
    const order = await place({
      ...freshOrderBody(),
      type: 'takeaway',
      seat: null,
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });
    const before = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });

    const res = await refund(order.id, {
      items: [{ itemId: order.items[0].id, qty: 1 }],
      reason: '少做一杯'
    });
    expect(res.status).toBe(201);
    expect(res.body.refundedCents).toBe(2000);

    const units = await h.prisma.orderUnit.findMany({
      where: { orderId: order.id },
      orderBy: { label: 'asc' }
    });
    expect(units[0].status).toBe('refunded');
    expect(units[1].status).toBe('pending');

    const after = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });
    expect(after?.grams).toBeCloseTo((before?.grams ?? 0) + 3.5, 6);

    // 已退杯不能出餐，未退杯正常出餐
    const refundedScan = await h.api('post', '/store/scan', managerToken, { code: units[0].label });
    expect(refundedScan.status).toBe(409);
    const validScan = await h.api('post', '/store/scan', managerToken, { code: units[1].label });
    expect(validScan.status).toBe(201);

    // 补打只打印仍有效的杯，杯次总数保持原单口径
    const reprint = await h.api('post', `/store/orders/${order.id}/reprint`, managerToken, {});
    expect(reprint.status).toBe(201);
    const job = await h.prisma.printJob.findFirst({
      where: { orderId: order.id, kind: 'reprint' },
      orderBy: { createdAt: 'desc' }
    });
    const payload = JSON.parse(job?.payloadJson || '{}') as {
      labels: Array<{ label: string; cupIndex: number; cupTotal: number }>;
    };
    expect(payload.labels.map((x) => x.label)).toEqual([units[1].label]);
    // 杯次口径保持原单：序号与总数都按含已退杯的原单计算
    expect(payload.labels[0].cupIndex).toBe(2);
    expect(payload.labels[0].cupTotal).toBe(2);
  });

  it('TX-05 已制作订单退款：不回补库存、已出杯状态保留、成本保留', async () => {
    scriptRefund([okRefund]);
    const before = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });
    const order = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    const scan = await h.api('post', '/store/scan', managerToken, { code: order.units[0].label });
    expect(scan.status).toBe(201);

    const res = await refund(order.id, { reason: '出杯后退款' });
    expect(res.status).toBe(201);

    const after = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });
    // 已制作退款不回补：库存停留在"下单扣减后"的水平（before - 3.5g 本单用料），退款不再加回
    expect(after?.grams).toBeCloseTo((before?.grams ?? 0) - 3.5, 6);

    const unit = await h.prisma.orderUnit.findFirst({ where: { orderId: order.id } });
    expect(unit?.status).toBe('scanned');

    const entry = await h.prisma.financeEntry.findFirst({ where: { orderId: order.id, type: 'REFUND' } });
    expect(entry?.costCents).toBe(0);

    const intent = await h.prisma.refundIntent.findFirst({ where: { orderId: order.id } });
    expect(intent?.status).toBe('succeeded');
  });

  it('TX-12 审批通过但网关失败：决定与执行分离，可安全重试不重复退款', async () => {
    const order = await place({
      ...freshOrderBody(),
      type: 'takeaway',
      seat: null,
      items: [{ productId: 'xing-0', qty: 3, temp: '热' }]
    });
    expect(order.totalCents).toBe(6000);
    const request = await h.api('post', `/store/orders/${order.id}/refund`, managerToken, {
      reason: '整单售后'
    });
    expect(request.body.mode).toBe('approval');

    const failRefund = (): Promise<PaymentResult> =>
      Promise.resolve({ ok: false, error: '渠道余额不足' });
    scriptRefund([failRefund]);
    const approved = await h.api(
      'post',
      `/admin/approvals/${request.body.approval.id}/decide`,
      financeToken,
      { decision: 'approve', comment: '同意退款' }
    );
    expect(approved.status).toBe(201);
    expect(approved.body.approval.status).toBe('approved');
    // 决定成立 ≠ 已退钱：执行状态单独可见
    expect(approved.body.approval.executionStatus).toBe('failed');
    expect(approved.body.approval.refundIntentId).toMatch(/^RF-/);
    expect(approved.body.approval.resultNote).toContain('失败');

    // 失败未落账
    const failedEntries = await h.prisma.financeEntry.findMany({
      where: { orderId: order.id, type: 'REFUND' }
    });
    expect(failedEntries).toHaveLength(0);

    // 恢复后重试：同一审批生成新退款单执行（旧失败单保留审计），钱只退一次
    scriptRefund([okRefund]);
    const retry = await h.api(
      'post',
      `/store/refunds/${approved.body.approval.refundIntentId}/retry`,
      managerToken,
      {}
    );
    expect(retry.status).toBe(201);
    expect(retry.body.refundedCents).toBe(6000);

    const intents = await h.prisma.refundIntent.findMany({ where: { orderId: order.id } });
    expect(intents).toHaveLength(2);
    expect(intents.filter((x) => x.status === 'succeeded')).toHaveLength(1);
    expect(intents.find((x) => x.status === 'failed')?.id).toBe(
      approved.body.approval.refundIntentId
    );
    const entries = await h.prisma.financeEntry.findMany({
      where: { orderId: order.id, type: 'REFUND' }
    });
    expect(entries).toHaveLength(1);

    // 审批列表暴露执行状态与关联退款单（指向最终成功的那张退款单）
    const list = await h.api('get', '/admin/approvals?status=all', financeToken);
    const row = (list.body.approvals as Array<Record<string, unknown>>).find(
      (x) => x.id === request.body.approval.id
    );
    const succeededIntent = intents.find((x) => x.status === 'succeeded')!;
    expect(row?.executionStatus).toBe('succeeded');
    expect(row?.refundIntentId).toBe(succeededIntent.id);
  });
});
