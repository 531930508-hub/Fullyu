import {
  ACCOUNTS,
  createHarness,
  freshOrderBody,
  retailOrderBody,
  type Harness
} from '../testing/harness';

describe('出餐、补做与退款闭环', () => {
  let h: Harness;
  let customerToken: string;
  let managerToken: string;
  let staffToken: string;
  let financeToken: string;

  beforeAll(async () => {
    h = await createHarness();
    customerToken = (await h.customer('出餐茶客')).token;
    managerToken = await h.login(ACCOUNTS.managerSh);
    staffToken = await h.login(ACCOUNTS.staffSh);
    financeToken = await h.login(ACCOUNTS.finance);
  });

  afterAll(async () => {
    await h.close();
  });

  const place = (body: unknown) =>
    h.api('post', '/customer/orders', customerToken, body).then((res) => {
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
    });

  it('营业台队列包含新订单与订单日志', async () => {
    const order = await place({
      ...freshOrderBody(),
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });

    const queue = await h.api('get', '/store/queue?storeId=sh', managerToken);
    expect(queue.status).toBe(200);
    expect(queue.body.fresh.map((x: { id: string }) => x.id)).toContain(order.id);
    expect(queue.body.counts.pending).toBeGreaterThanOrEqual(1);
    expect(queue.body.fresh[0]).toHaveProperty('cupTotal', 2);

    const detail = await h.api('get', `/store/orders/${order.id}`, managerToken);
    expect(detail.status).toBe(200);
    expect(detail.body.order.id).toBe(order.id);
    expect(detail.body.logs.map((x: { action: string }) => x.action)).toContain('提交订单');
  });

  it('扫杯贴逐杯出餐，重复扫码幂等，扫完整单转 ready', async () => {
    const order = await place({
      ...freshOrderBody(),
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });
    expect(order.units).toHaveLength(2);

    const first = await h.api('post', '/store/scan', managerToken, { code: order.units[0].label });
    expect(first.status).toBe(201);
    expect(first.body.order.cupScanned).toBe(1);
    expect(first.body.order.status).toBe('pending');

    const again = await h.api('post', '/store/scan', managerToken, { code: order.units[0].label });
    expect(again.status).toBe(201);
    expect(again.body.order.cupScanned).toBe(1);

    const second = await h.api('post', `/store/orders/${order.id}/scan`, managerToken, {
      unitId: order.units[1].id
    });
    expect(second.status).toBe(201);
    expect(second.body.order.cupScanned).toBe(2);
    expect(second.body.order.status).toBe('ready');
    expect(second.body.order.preparedAt).toEqual(expect.any(Number));

    const queue = await h.api('get', '/store/queue?storeId=sh', managerToken);
    expect(queue.body.counts.ready).toBeGreaterThanOrEqual(1);
  });

  it('待取餐订单可确认已取餐归档，重复确认幂等且移出队列', async () => {
    const order = await place(freshOrderBody());
    const scanned = await h.api('post', '/store/scan', managerToken, { code: order.units[0].label });
    expect(scanned.body.order.status).toBe('ready');

    const delivered = await h.api('post', `/store/orders/${order.id}/deliver`, managerToken, {});
    expect(delivered.status).toBe(201);
    expect(delivered.body.order.status).toBe('delivered');
    expect(delivered.body.order.deliveredAt).toEqual(expect.any(Number));

    // 双击/补确认不能报错，也不能重复写状态。
    const again = await h.api('post', `/store/orders/${order.id}/deliver`, managerToken, {});
    expect(again.status).toBe(201);
    expect(again.body.order.status).toBe('delivered');

    const queue = await h.api('get', '/store/queue?storeId=sh', managerToken);
    expect(queue.body.fresh.map((x: { id: string }) => x.id)).not.toContain(order.id);
  });

  it('未制作完成的订单不能直接标记已取餐', async () => {
    const order = await place({
      ...freshOrderBody(),
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });
    const res = await h.api('post', `/store/orders/${order.id}/deliver`, managerToken, {});
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('待取餐');
  });

  it('未登记的杯贴返回 404', async () => {    const res = await h.api('post', '/store/scan', managerToken, { code: 'ZZZ-404' });
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('未找到杯贴');
  });

  it('店员可以扫码出餐，但不能跨店操作', async () => {
    const order = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    const scanned = await h.api('post', '/store/scan', staffToken, { code: order.units[0].label });
    expect(scanned.status).toBe(201);
    expect(scanned.body.order.cupScanned).toBe(1);

    // 北京旧占位门店默认停业，无法下单；跨店授权与营业状态无关，
    // 所以测试期间临时开门，结束后恢复，避免把“停业 409”误当成跨店 403。
    const bj = await h.prisma.store.findUniqueOrThrow({ where: { id: 'bj' } });
    await h.prisma.store.update({
      where: { id: 'bj' },
      data: { open: true, channelsJson: JSON.stringify({ ...JSON.parse(bj.channelsJson), mini: true }) }
    });
    try {
      const bjOrder = await place({ ...freshOrderBody(), storeId: 'bj' });
      const denied = await h.api('post', '/store/scan', managerToken, { code: bjOrder.units[0].label });
      expect(denied.status).toBe(403);

      const detail = await h.api('get', `/store/orders/${bjOrder.id}`, managerToken);
      expect(detail.status).toBe(403);
    } finally {
      await h.prisma.store.update({
        where: { id: 'bj' },
        data: { open: bj.open, channelsJson: bj.channelsJson }
      });
    }
  });

  it('补打杯贴与补做单：补做单零金额并关联原单', async () => {
    const order = await place({
      ...freshOrderBody(),
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });

    const reprint = await h.api('post', `/store/orders/${order.id}/reprint`, managerToken, {});
    expect(reprint.status).toBe(201);
    expect(reprint.body.ok).toBe(true);

    const remake = await h.api('post', `/store/orders/${order.id}/remake`, managerToken, {
      reason: '出杯洒漏'
    });
    expect(remake.status).toBe(201);
    expect(remake.body.order.number).toMatch(/^R\d{3}$/);
    expect(remake.body.order.parentOrderId).toBe(order.id);
    expect(remake.body.order.totalCents).toBe(0);
    expect(remake.body.order.paymentMethod).toBe('补做');
    expect(remake.body.order.units).toHaveLength(2);
    expect(remake.body.order.items.every((x: { unitPriceCents: number }) => x.unitPriceCents === 0)).toBe(true);
  });

  it('限额内未制作退款：立即退款并冲回原料成本', async () => {
    const before = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });
    const order = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    const res = await h.api('post', `/store/orders/${order.id}/refund`, managerToken, {
      reason: '顾客临时取消'
    });
    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('refunded');
    expect(res.body.refundedCents).toBe(2000);
    expect(res.body.order.status).toBe('refunded');
    expect(res.body.order.refundedCents).toBe(2000);

    const after = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });
    expect(after?.grams).toBe(before?.grams);

    const entry = await h.prisma.financeEntry.findFirst({
      where: { orderId: order.id, type: 'REFUND' }
    });
    expect(entry?.amountCents).toBe(-2000);
    expect(entry?.costCents).toBe(-600);
  });

  it('已制作退款保留原料成本，不再冲回', async () => {
    const order = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    await h.api('post', '/store/scan', managerToken, { code: order.units[0].label });
    const res = await h.api('post', `/store/orders/${order.id}/refund`, managerToken, {});
    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('refunded');

    const entry = await h.prisma.financeEntry.findFirst({
      where: { orderId: order.id, type: 'REFUND' }
    });
    expect(entry?.costCents).toBe(0);
  });

  it('超过 50 元的退款进入审批，财务通过后执行退款', async () => {
    const order = await place({
      ...freshOrderBody(),
      type: 'takeaway',
      seat: null,
      items: [{ productId: 'xing-0', qty: 3, temp: '热' }]
    });
    expect(order.totalCents).toBe(6000);

    const request = await h.api('post', `/store/orders/${order.id}/refund`, managerToken, {
      reason: '整单取消'
    });
    expect(request.status).toBe(201);
    expect(request.body.mode).toBe('approval');
    expect(request.body.amountCents).toBe(6000);
    expect(request.body.approval).toMatchObject({ kind: 'REFUND', status: 'pending' });
    expect(request.body.order.refundPending).toBe(true);

    const duplicate = await h.api('post', `/store/orders/${order.id}/refund`, managerToken, {});
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toContain('待审批');

    const approved = await h.api(
      'post',
      `/admin/approvals/${request.body.approval.id}/decide`,
      financeToken,
      { decision: 'approve' }
    );
    expect(approved.status).toBe(201);
    expect(approved.body.approval.status).toBe('approved');
    expect(approved.body.approval.resultNote).toContain('已退款');

    const detail = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(detail?.status).toBe('refunded');
    expect(detail?.refundedCents).toBe(6000);
    expect(detail?.refundPending).toBe(false);
  });

  it('店员只能发起退款申请，财务驳回后订单保持原状', async () => {
    const order = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    const request = await h.api('post', `/store/orders/${order.id}/refund`, staffToken, {
      reason: '口味不满意'
    });
    expect(request.status).toBe(201);
    expect(request.body.mode).toBe('approval');

    const rejected = await h.api(
      'post',
      `/admin/approvals/${request.body.approval.id}/decide`,
      financeToken,
      { decision: 'reject', comment: '已出杯' }
    );
    expect(rejected.status).toBe(201);
    expect(rejected.body.approval.status).toBe('rejected');

    const detail = await h.prisma.order.findUnique({ where: { id: order.id } });
    expect(detail?.status).toBe('pending');
    expect(detail?.refundedCents).toBe(0);
    expect(detail?.refundPending).toBe(false);
  });

  it('零售提货码核验、跨店拦截与库存扣减', async () => {
    const order = await place(retailOrderBody());
    expect(order.status).toBe('awaiting');
    const detail = await h.api('get', `/store/orders/${order.id}`, managerToken);
    const pickupCode = detail.body.order.pickupCode as string;

    const short = await h.api('post', '/store/retail/lookup', managerToken, { code: '12' });
    expect(short.status).toBe(400);

    const missing = await h.api('post', '/store/retail/lookup', managerToken, { code: '0000' });
    expect(missing.status).toBe(404);

    const wrong = await h.api('post', `/store/retail/${order.id}/deliver`, managerToken, {
      storeId: 'sh',
      code: '0000'
    });
    expect(wrong.status).toBe(400);

    const crossStore = await h.api('post', `/store/retail/${order.id}/deliver`, managerToken, {
      storeId: 'bj',
      code: pickupCode
    });
    expect(crossStore.status).toBe(403);

    const found = await h.api('post', '/store/retail/lookup', managerToken, { code: pickupCode });
    expect(found.status).toBe(201);
    expect(found.body.order.id).toBe(order.id);

    const delivered = await h.api('post', `/store/retail/${order.id}/deliver`, managerToken, {
      storeId: 'sh',
      code: pickupCode
    });
    expect(delivered.status).toBe(201);
    expect(delivered.body.order.status).toBe('delivered');
    expect(delivered.body.order.pickupStoreId).toBe('sh');

    const stock = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'bottle' } }
    });
    expect(stock?.grams).toBe(11);

    const again = await h.api('post', `/store/retail/${order.id}/deliver`, managerToken, {
      storeId: 'sh',
      code: pickupCode
    });
    expect(again.status).toBe(201);
    expect(again.body.order.status).toBe('delivered');

    const after = await h.api('post', '/store/retail/lookup', managerToken, { code: pickupCode });
    expect(after.status).toBe(404);
  });

  it('店员也可以完成零售交付，交付后不再出现在待交付队列', async () => {
    const order = await place(retailOrderBody());
    const detail = await h.api('get', `/store/orders/${order.id}`, staffToken);
    const pickupCode = detail.body.order.pickupCode as string;

    const queueBefore = await h.api('get', '/store/queue?storeId=sh', managerToken);
    expect(queueBefore.body.retail.map((x: { id: string }) => x.id)).toContain(order.id);

    const delivered = await h.api('post', `/store/retail/${order.id}/deliver`, staffToken, {
      storeId: 'sh',
      code: pickupCode
    });
    expect(delivered.status).toBe(201);
    expect(delivered.body.order.status).toBe('delivered');

    const queueAfter = await h.api('get', '/store/queue?storeId=sh', managerToken);
    expect(queueAfter.body.retail.map((x: { id: string }) => x.id)).not.toContain(order.id);

    const stock = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'bottle' } }
    });
    expect(stock?.grams).toBe(10);
  });
});
