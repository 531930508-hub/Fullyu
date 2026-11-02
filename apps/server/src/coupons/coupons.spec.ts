import { ACCOUNTS, createHarness, freshOrderBody, retailOrderBody, type Harness } from '../testing/harness';

const day = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

describe('优惠券与会员资产', () => {
  let h: Harness;
  let admin: string;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.super);
  });

  afterAll(async () => {
    await h.close();
  });

  const createCoupon = async (overrides: Record<string, unknown> = {}) => {
    const res = await h.api('post', '/admin/coupons', admin, {
      title: '新客立减 5 元',
      scope: 'all',
      amountCents: 500,
      minSpendCents: 0,
      validFrom: day(0),
      validTo: day(7),
      ...overrides
    });
    expect(res.status).toBe(201);
    return res.body.coupon;
  };

  it('总部创建通用券并按手机号发放，顾客在资产区可见', async () => {
    const coupon = await createCoupon();
    expect(coupon.title).toBe('新客立减 5 元');
    expect(coupon.scope).toBe('all');

    const customer = await h.customer('持券顾客');
    const issued = await h.api('post', `/admin/coupons/${coupon.id}/issue`, admin, {
      phones: [customer.phone, '13999999999']
    });
    expect(issued.status).toBe(201);
    expect(issued.body.issued).toHaveLength(1);
    expect(issued.body.skipped[0].phone).toBe('13999999999');

    const mine = await h.api('get', '/customer/coupons', customer.token);
    expect(mine.status).toBe(200);
    expect(mine.body.availableCount).toBe(1);
    expect(mine.body.coupons[0].status).toBe('available');
    expect(mine.body.coupons[0].amountCents).toBe(500);

    // 同一模板重复发放给同一会员会被跳过，避免叠加。
    const again = await h.api('post', `/admin/coupons/${coupon.id}/issue`, admin, {
      phones: [customer.phone]
    });
    expect(again.body.issued).toHaveLength(0);
    expect(again.body.skipped[0].reason).toContain('已有');
  });

  it('下单使用时由服务端抵扣，支付成功后券标记已使用且不能重复使用', async () => {
    const coupon = await createCoupon({ title: '满 20 减 8', amountCents: 800, minSpendCents: 2000 });
    const customer = await h.customer('用券顾客');
    await h.api('post', `/admin/coupons/${coupon.id}/issue`, admin, { phones: [customer.phone] });
    const mine = await h.api('get', '/customer/coupons', customer.token);
    const held = mine.body.coupons[0];

    const order = await h.api('post', '/customer/orders', customer.token, {
      ...freshOrderBody(),
      couponId: held.id,
      idempotencyKey: 'coupon-use-0001'
    });
    expect(order.status).toBe(201);
    expect(order.body.order.totalCents).toBe(1200);
    expect(order.body.order.couponDiscountCents).toBe(800);
    expect(order.body.order.couponTitle).toBe('满 20 减 8');

    const after = await h.api('get', '/customer/coupons', customer.token);
    expect(after.body.coupons[0].status).toBe('used');
    expect(after.body.availableCount).toBe(0);

    const reuse = await h.api('post', '/customer/orders', customer.token, {
      ...freshOrderBody(),
      couponId: held.id,
      idempotencyKey: 'coupon-use-0002'
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.message).toMatch(/优惠券/);
  });

  it('指定品类券不能抵扣其他品类，门槛不足会被拒绝', async () => {
    const category = await createCoupon({
      title: '鲜酿专享 3 元',
      scope: 'category',
      categoryId: 'fresh',
      amountCents: 300
    });
    const customer = await h.customer('品类券顾客');
    await h.api('post', `/admin/coupons/${category.id}/issue`, admin, { phones: [customer.phone] });
    const held = (await h.api('get', '/customer/coupons', customer.token)).body.coupons.find(
      (row: { id: string }) => row.id
    );

    const retail = await h.api('post', '/customer/orders', customer.token, {
      ...retailOrderBody(),
      couponId: held.id,
      idempotencyKey: 'coupon-scope-0001'
    });
    expect(retail.status).toBe(400);
    expect(retail.body.message).toMatch(/可用/);

    const high = await createCoupon({ title: '满 100 减 10', amountCents: 1000, minSpendCents: 10000 });
    const customer2 = await h.customer('门槛顾客');
    await h.api('post', `/admin/coupons/${high.id}/issue`, admin, { phones: [customer2.phone] });
    const held2 = (await h.api('get', '/customer/coupons', customer2.token)).body.coupons[0];
    const below = await h.api('post', '/customer/orders', customer2.token, {
      ...freshOrderBody(),
      couponId: held2.id,
      idempotencyKey: 'coupon-min-0001'
    });
    expect(below.status).toBe(400);
    expect(below.body.message).toMatch(/门槛/);
  });

  it('没有发券权限的账号不能创建或发放', async () => {
    const manager = await h.login(ACCOUNTS.managerSh);
    const list = await h.api('get', '/admin/coupons', manager);
    expect(list.status).toBe(403);
    const create = await h.api('post', '/admin/coupons', manager, {
      title: '越权券',
      scope: 'all',
      amountCents: 100,
      minSpendCents: 0,
      validFrom: day(0),
      validTo: day(1)
    });
    expect(create.status).toBe(403);
  });
});
