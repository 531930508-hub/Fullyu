/**
 * 自带杯减免：只走营业台（顾客到柜台当面确认），按杯抵扣，且必须与其他优惠正确叠加。
 *
 * 关注点：
 * - 折扣落库并回传，账单、订单详情、退款都用同一个实付口径；
 * - 杯数不能超过本单杯数，零售单与顾客自助下单不接受该字段；
 * - 与会员每杯立减、优惠券的叠加顺序固定，不会把订单金额算成负数。
 */
import { ACCOUNTS, createHarness, freshOrderBody, type Harness } from '../testing/harness';
import { OrdersService } from './orders.service';

describe('自带杯减免', () => {
  let h: Harness;
  let managerToken: string;

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
  });

  afterAll(async () => {
    await h.close();
  });

  const assisted = (body: Record<string, unknown>) =>
    h.api('post', '/store/orders', managerToken, {
      storeId: 'sh',
      type: 'takeaway',
      paymentMethod: 'cash',
      items: [{ productId: 'xing-0', qty: 1, temp: '热' }],
      ...body
    });

  it('茶单对外公布自带杯政策，供营业台与结算页提示', async () => {
    const menu = await h.api('get', '/customer/menu?storeId=sh');
    expect(menu.status).toBe(200);
    expect(menu.body.byoCup).toMatchObject({ enabled: true, perCupCents: 500 });

    const pos = await h.api('get', '/store/catalog?storeId=sh', managerToken);
    expect(pos.status).toBe(200);
    expect(pos.body.byoCup).toMatchObject({ enabled: true, perCupCents: 500 });
  });

  it('按杯减免落库：订单与行都记录杯数与抵扣金额', async () => {
    const res = await assisted({ byoCups: 2, items: [{ productId: 'xing-0', qty: 2, temp: '热' }] });
    expect(res.status).toBe(201);
    const order = res.body.order;
    expect(order.byoCupCups).toBe(2);
    expect(order.byoCupDiscountCents).toBe(1000);
    expect(order.totalCents).toBe(4000 - 1000);
    expect(order.items[0]).toMatchObject({
      unitPriceCents: 2000,
      totalCents: 3000,
      byoCupQty: 2,
      byoCupDiscountCents: 1000
    });
  });

  it('自带杯与年卡每杯立减叠加：先按会员价立减，再按杯减自带杯', async () => {
    const annual = await h.customer('自带杯年卡茶客');
    await h.prisma.customer.update({ where: { id: annual.id }, data: { memberTier: 'annual' } });

    const res = await assisted({
      byoCups: 2,
      memberCode: annual.memberCode,
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });
    expect(res.status).toBe(201);
    const order = res.body.order;
    // 售价 4000 → 年卡每杯立减 200 共 400 → 自带杯 2 杯共 1000
    expect(order.items[0]).toMatchObject({ unitPriceCents: 1800, byoCupDiscountCents: 1000 });
    expect(order.byoCupCups).toBe(2);
    expect(order.byoCupDiscountCents).toBe(1000);
    expect(order.totalCents).toBe(4000 - 400 - 1000);
  });

  it('杯数超过本单杯数或为负返回 400', async () => {
    const tooMany = await assisted({ byoCups: 2, items: [{ productId: 'xing-0', qty: 1, temp: '热' }] });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.message).toContain('自带杯');

    const negative = await assisted({ byoCups: -1 });
    expect(negative.status).toBe(400);

    // 接口层把杯数限制在 0–10，超出即拒绝，避免伙伴手误填成大数。
    const capped = await assisted({ byoCups: 11, items: [{ productId: 'xing-0', qty: 11, temp: '热' }] });
    expect(capped.status).toBe(400);
  });

  it('零售单与顾客自助下单不接受自带杯', async () => {
    const retail = await assisted({
      business: 'retail',
      type: 'retail',
      byoCups: 1,
      items: [{ productId: 'tea-bags', qty: 1 }]
    });
    expect(retail.status).toBe(400);
    expect(retail.body.message).toContain('自带杯');

    const customerToken = (await h.customer('自助点单茶客')).token;
    const mini = await h.api('post', '/customer/orders', customerToken, {
      ...freshOrderBody(),
      byoCups: 1
    });
    expect(mini.status).toBe(201);
    expect(mini.body.order.byoCupCups).toBe(0);
    expect(mini.body.order.byoCupDiscountCents).toBe(0);
    expect(mini.body.order.totalCents).toBe(2000);
  });

  it('退款按实付口径分摊自带杯抵扣', async () => {
    const placed = await assisted({ byoCups: 2, items: [{ productId: 'xing-0', qty: 2, temp: '热' }] });
    expect(placed.status).toBe(201);
    const order = placed.body.order;

    const quote = await h.app.get(OrdersService).refundQuoteForOrder(order.id);
    expect(quote.quote.amount).toBe(3000);

    const refund = await h.api('post', `/store/orders/${order.id}/refund`, managerToken, {
      reason: '自带杯单退一杯'
    });
    expect(refund.status).toBeLessThan(400);
    const after = await h.api('get', `/store/orders/${order.id}`, managerToken);
    expect(after.body.order.refundedCents).toBe(3000);
  });
});