/**
 * TX-08/10/13 交易链路加固整改。
 *
 * 审计口径（06-整改台账.csv）：
 * - TX-08 跨店零售交付必须在事务内条件认领订单，只允许一个胜者、库存只扣一次；
 *   已交付回读也要校验提货码，不能凭状态直接放行。
 * - TX-10 状态/搜索过滤在数据库执行，活动队列独立查询不被完成单挤出；
 *   顾客历史提供 hasMore/cursor 分页，不漏单不重单。
 * - TX-13 订单行键 = 商品 + 规范化温冰选项，服务端校验商品允许的温冰组合。
 */
import { ACCOUNTS, createHarness, freshOrderBody, retailOrderBody, type Harness } from '../testing/harness';

describe('交易链路加固（TX-08/10/13）', () => {
  let h: Harness;
  let superToken: string;
  let managerToken: string;

  beforeAll(async () => {
    h = await createHarness();
    superToken = await h.login(ACCOUNTS.super);
    managerToken = await h.login(ACCOUNTS.managerSh);
  });

  afterAll(async () => {
    await h.close();
  });

  const place = async (body: unknown, token?: string) => {
    const t = token || (await h.customer('加固茶客')).token;
    const res = await h.api('post', '/customer/orders', t, body);
    if (res.status !== 201) throw new Error(`下单失败 ${res.status} ${res.text}`);
    return res.body.order as {
      id: string;
      number: string;
      status: string;
      totalCents: number;
      pickupCode: string | null;
      items: Array<{ id: string; qty: number }>;
      units: Array<{ id: string; label: string; status: string }>;
    };
  };

  const bottleStock = (storeId: string) =>
    h.prisma.stock.findUnique({ where: { storeId_productId: { storeId, productId: 'bottle' } } });

  describe('TX-08 零售交付认领', () => {
    it('两店并发交付只允许一个胜者，库存只扣一次', async () => {
      const order = await place(retailOrderBody());
      expect(order.status).toBe('awaiting');
      const detail = await h.api('get', `/store/orders/${order.id}`, superToken);
      const code = detail.body.order.pickupCode as string;

      const [a, b] = await Promise.all([
        h.api('post', `/store/retail/${order.id}/deliver`, superToken, { storeId: 'sh', code }),
        h.api('post', `/store/retail/${order.id}/deliver`, superToken, { storeId: 'bj', code })
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);

      const row = await h.prisma.order.findUnique({ where: { id: order.id } });
      expect(row?.status).toBe('delivered');
      const sh = await bottleStock('sh');
      const bj = await bottleStock('bj');
      // 初始 12 瓶：只有胜者门店被扣 1 瓶，另一店保持 12
      expect([sh?.grams, bj?.grams].sort()).toEqual([11, 12]);

      const logs = await h.prisma.log.findMany({
        where: { orderId: order.id, action: '确认零售交付' }
      });
      expect(logs).toHaveLength(1);
    });

    it('已交付订单回读需校验提货码：错码拒绝、对码幂等、库存不变', async () => {
      const before = (await bottleStock('sh'))?.grams ?? 0;
      const order = await place(retailOrderBody());
      const detail = await h.api('get', `/store/orders/${order.id}`, superToken);
      const code = detail.body.order.pickupCode as string;

      const first = await h.api('post', `/store/retail/${order.id}/deliver`, superToken, {
        storeId: 'sh',
        code
      });
      expect(first.status).toBe(201);

      const wrong = await h.api('post', `/store/retail/${order.id}/deliver`, superToken, {
        storeId: 'sh',
        code: '0000'
      });
      expect(wrong.status).toBe(400);

      const again = await h.api('post', `/store/retail/${order.id}/deliver`, superToken, {
        storeId: 'sh',
        code
      });
      expect(again.status).toBe(201);
      expect(again.body.order.status).toBe('delivered');

      const sh = await bottleStock('sh');
      expect(sh?.grams).toBe(before - 1);
    });
  });

  describe('TX-10 列表与分页', () => {
    it('早期待处理订单不被大量完成单挤出队列与搜索', async () => {
      // 一笔停在制作中的老单
      const oldOrder = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
      expect(oldOrder.status).toBe('pending');

      // 85 笔更新的已完成单（直接入库，聚焦查询口径本身）
      const now = Date.now();
      await h.prisma.order.createMany({
        data: Array.from({ length: 85 }, (_, i) => ({
          id: `SO-TX10-${String(i).padStart(3, '0')}`,
          number: `T261030${String(900 + i)}`,
          business: 'fresh',
          storeId: 'sh',
          channel: 'mini',
          type: 'takeaway',
          status: 'delivered',
          paymentStatus: 'paid',
          totalCents: 2000,
          createdAt: new Date(now - 60_000 + i * 100),
          paidAt: new Date(now - 59_000 + i * 100),
          deliveredAt: new Date(now - 58_000 + i * 100)
        }))
      });

      const queue = await h.api('get', '/store/queue?storeId=sh', managerToken);
      expect(queue.status).toBe(200);
      const freshIds = (queue.body.fresh as Array<{ id: string }>).map((x) => x.id);
      expect(freshIds).toContain(oldOrder.id);

      const found = await h.api(
        'get',
        `/store/orders?q=${encodeURIComponent(oldOrder.number)}`,
        managerToken
      );
      expect(found.status).toBe(200);
      const numbers = (found.body.orders as Array<{ number: string }>).map((x) => x.number);
      expect(numbers).toContain(oldOrder.number);
    });

    it('顾客历史支持游标分页且不漏不重', async () => {
      const customer = await h.customer('翻页茶客');
      for (let i = 0; i < 5; i += 1) {
        await place({ ...freshOrderBody(), type: 'takeaway', seat: null }, customer.token);
      }
      const page1 = await h.api('get', '/customer/orders?limit=2', customer.token);
      expect(page1.status).toBe(200);
      expect(page1.body.orders).toHaveLength(2);
      expect(page1.body.hasMore).toBe(true);
      expect(page1.body.nextCursor).toBeTruthy();

      const page2 = await h.api(
        'get',
        `/customer/orders?limit=2&cursor=${encodeURIComponent(String(page1.body.nextCursor))}`,
        customer.token
      );
      expect(page2.body.orders).toHaveLength(2);

      const page3 = await h.api(
        'get',
        `/customer/orders?limit=2&cursor=${encodeURIComponent(String(page2.body.nextCursor))}`,
        customer.token
      );
      expect(page3.body.orders).toHaveLength(1);
      expect(page3.body.hasMore).toBe(false);

      const ids = [
        ...page1.body.orders,
        ...page2.body.orders,
        ...page3.body.orders
      ].map((x: { id: string }) => x.id);
      expect(new Set(ids).size).toBe(5);
    });
  });

  describe('TX-13 行键与温冰校验', () => {
    it('同款不同温冰保持独立行，订单行与杯数一致', async () => {
      const before = await h.prisma.stock.findUnique({
        where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
      });
      const order = await place({
        ...freshOrderBody(),
        type: 'takeaway',
        seat: null,
        items: [
          { productId: 'xing-0', qty: 1, temp: '热', ice: null },
          { productId: 'xing-0', qty: 1, temp: '冰', ice: '少冰' }
        ]
      });
      expect(order.totalCents).toBe(4000);
      const items = await h.prisma.orderItem.findMany({ where: { orderId: order.id } });
      expect(items).toHaveLength(2);
      const combo = items.map((x) => `${x.temp}/${x.ice ?? ''}`).sort();
      expect(combo).toEqual(['冰/少冰', '热/标准冰'].sort());
      const units = await h.prisma.orderUnit.count({ where: { orderId: order.id } });
      expect(units).toBe(2);
      const stock = await h.prisma.stock.findUnique({
        where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
      });
      // 两行各 1 杯：合计扣 2 × 3.5g
      expect(stock?.grams).toBeCloseTo((before?.grams ?? 0) - 7, 6);
    });

    it('同款同规格两行合并数量，仍是一条订单行', async () => {
      const order = await place({
        ...freshOrderBody(),
        type: 'takeaway',
        seat: null,
        items: [
          { productId: 'xing-0', qty: 1, temp: '热', ice: null },
          { productId: 'xing-0', qty: 1, temp: '热', ice: null }
        ]
      });
      expect(order.totalCents).toBe(4000);
      const items = await h.prisma.orderItem.findMany({ where: { orderId: order.id } });
      expect(items).toHaveLength(1);
      expect(items[0].qty).toBe(2);
    });

    it('非法温冰组合被拒绝：温度不在允许列表、冰量枚举外、零售商品带温冰', async () => {
      const token = (await h.customer('校验茶客')).token;
      const badTemp = await h.api('post', '/customer/orders', token, {
        ...freshOrderBody(),
        type: 'takeaway',
        seat: null,
        items: [{ productId: 'xing-0', qty: 1, temp: '常温', ice: null }]
      });
      expect(badTemp.status).toBe(400);

      const badIce = await h.api('post', '/customer/orders', token, {
        ...freshOrderBody(),
        type: 'takeaway',
        seat: null,
        items: [{ productId: 'xing-0', qty: 1, temp: '冰', ice: '多冰' }]
      });
      expect(badIce.status).toBe(400);

      const retailWithOptions = await h.api('post', '/customer/orders', token, {
        ...retailOrderBody(),
        items: [{ productId: 'bottle', qty: 1, temp: '热', ice: '少冰' }]
      });
      expect(retailWithOptions.status).toBe(400);
    });
  });
});
