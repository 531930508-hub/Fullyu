import {
  ACCOUNTS,
  createHarness,
  freshOrderBody,
  type Harness
} from '../testing/harness';
import { OrdersService } from './orders.service';
import { shanghaiStartOfDay } from './daily-sweep';

describe('每日凌晨自动确认取餐', () => {
  let h: Harness;
  let customerToken: string;
  let managerToken: string;
  let orders: OrdersService;

  beforeAll(async () => {
    h = await createHarness();
    customerToken = (await h.customer('夜间归档茶客')).token;
    managerToken = await h.login(ACCOUNTS.managerSh);
    orders = h.app.get(OrdersService);
  });

  afterAll(async () => {
    await h.close();
  });

  const placeReady = async () => {
    const created = await h.api('post', '/customer/orders', customerToken, freshOrderBody());
    expect(created.status).toBe(201);
    const order = created.body.order as {
      id: string;
      number: string;
      units: Array<{ id: string; label: string }>;
    };
    const scanned = await h.api('post', '/store/scan', managerToken, { code: order.units[0].label });
    expect(scanned.body.order.status).toBe('ready');
    return order;
  };

  it('把截止时间之前仍未归档的待取餐订单批量标记为已取餐并写日志', async () => {
    const order = await placeReady();
    await h.prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date('2026-10-30T10:00:00+08:00') }
    });

    const now = new Date('2026-10-31T03:00:00+08:00');
    const cutoff = shanghaiStartOfDay(now);
    const changed = await orders.autoDeliverReadyOrders(cutoff, now);

    expect(changed).toBe(1);
    const row = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe('delivered');
    expect(row.deliveredAt?.toISOString()).toBe(now.toISOString());

    const logs = await h.prisma.log.findMany({ where: { orderId: order.id } });
    expect(logs.map((log) => log.action)).toContain('每日自动确认取餐');
    expect(logs.find((log) => log.action === '每日自动确认取餐')?.actorName).toBe('系统自动');
  });

  it('重复执行不会重复写状态或日志', async () => {
    const order = await placeReady();
    await h.prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date('2026-10-30T22:00:00+08:00') }
    });

    const now = new Date('2026-10-31T03:00:00+08:00');
    const cutoff = shanghaiStartOfDay(now);
    expect(await orders.autoDeliverReadyOrders(cutoff, now)).toBe(1);
    expect(await orders.autoDeliverReadyOrders(cutoff, now)).toBe(0);

    const logs = await h.prisma.log.findMany({
      where: { orderId: order.id, action: '每日自动确认取餐' }
    });
    expect(logs).toHaveLength(1);
  });

  it('当天的新订单和尚未出餐的订单不会被顺带归档', async () => {
    const readyToday = await placeReady();
    await h.prisma.order.update({
      where: { id: readyToday.id },
      data: { createdAt: new Date('2026-10-31T01:30:00+08:00') }
    });

    const pending = await h.api('post', '/customer/orders', customerToken, freshOrderBody());
    expect(pending.status).toBe(201);
    const pendingOrder = pending.body.order as { id: string };
    await h.prisma.order.update({
      where: { id: pendingOrder.id },
      data: { createdAt: new Date('2026-10-30T20:00:00+08:00') }
    });

    const now = new Date('2026-10-31T03:00:00+08:00');
    const changed = await orders.autoDeliverReadyOrders(shanghaiStartOfDay(now), now);

    expect(changed).toBe(0);
    expect((await h.prisma.order.findUniqueOrThrow({ where: { id: readyToday.id } })).status).toBe('ready');
    expect((await h.prisma.order.findUniqueOrThrow({ where: { id: pendingOrder.id } })).status).toBe('pending');
  });

  it('按上海时区取当天零点，跨 UTC 日期仍归入正确营业日', () => {
    expect(shanghaiStartOfDay(new Date('2026-10-31T03:00:00+08:00')).toISOString()).toBe(
      '2026-10-30T16:00:00.000Z'
    );
    expect(shanghaiStartOfDay(new Date('2026-10-31T23:59:00+08:00')).toISOString()).toBe(
      '2026-10-30T16:00:00.000Z'
    );
    expect(shanghaiStartOfDay(new Date('2026-11-01T00:00:00+08:00')).toISOString()).toBe(
      '2026-10-31T16:00:00.000Z'
    );
  });
});
