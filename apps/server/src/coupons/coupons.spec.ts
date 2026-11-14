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

  it('单品券只抵扣指定商品：鲜饮单被拒，香槟单正常抵扣', async () => {
    const single = await createCoupon({
      title: '香槟立减 30',
      scope: 'product',
      productId: 'bottle',
      amountCents: 3000
    });
    expect(single.productId).toBe('bottle');
    const customer = await h.customer('单品券顾客');
    await h.api('post', `/admin/coupons/${single.id}/issue`, admin, { phones: [customer.phone] });
    const held = (await h.api('get', '/customer/coupons', customer.token)).body.coupons[0];
    expect(held.productId).toBe('bottle');
    expect(held.productName).toBe('庆·细泡香槟');

    const fresh = await h.api('post', '/customer/orders', customer.token, {
      ...freshOrderBody(),
      couponId: held.id,
      idempotencyKey: 'coupon-product-0001'
    });
    expect(fresh.status).toBe(400);
    expect(fresh.body.message).toMatch(/可用/);

    const retail = await h.api('post', '/customer/orders', customer.token, {
      ...retailOrderBody(),
      couponId: held.id,
      idempotencyKey: 'coupon-product-0002'
    });
    expect(retail.status).toBe(201);
    expect(retail.body.order.totalCents).toBe(39800 - 3000);
  });

  it('按天有效期：每张券的有效期在发放时固化，取发放后 N 天与活动截止的较早者', async () => {
    const shortLived = await createCoupon({
      title: '领取后 2 天有效',
      validDays: 2,
      validTo: day(10)
    });
    const customer = await h.customer('短效券顾客');
    await h.api('post', `/admin/coupons/${shortLived.id}/issue`, admin, { phones: [customer.phone] });
    const held = (await h.api('get', '/customer/coupons', customer.token)).body.coupons[0];
    const expected = held.issuedAt + 2 * 24 * 60 * 60 * 1000;
    expect(Math.abs(held.validTo - expected)).toBeLessThan(5000);
    // 活动截止前 2 天以内领取的，仍不晚于活动截止日。
    expect(held.validTo).toBeLessThanOrEqual(new Date(`${day(10)}T23:59:59+08:00`).getTime());

    // 模板事后延长活动期，不影响已发出去的券。
    await h.api('patch', `/admin/coupons/${shortLived.id}`, admin, { note: '延期不改旧券' });
    const again = (await h.api('get', '/customer/coupons', customer.token)).body.coupons[0];
    expect(again.validTo).toBe(held.validTo);
  });

  it('自助领取：只能领开放领取的券，同款未用完不能再领', async () => {
    const privateCoupon = await createCoupon({ title: '定向券不开放领取' });
    const claimable = await createCoupon({
      title: '会员自助领 6 元',
      amountCents: 600,
      claimable: true,
      claimLimit: 1,
      validDays: 3
    });
    const customer = await h.customer('自助领券顾客');
    const list = await h.api('get', '/customer/coupons/claimable', customer.token);
    expect(list.status).toBe(200);
    const mine = list.body.templates.find((row: { id: string }) => row.id === claimable.id);
    expect(mine.canClaim).toBe(true);
    expect(mine.validDays).toBe(3);
    expect(list.body.templates.some((row: { id: string }) => row.id === privateCoupon.id)).toBe(false);

    const claim = await h.api('post', `/customer/coupons/${claimable.id}/claim`, customer.token);
    expect(claim.status).toBe(201);
    expect(claim.body.coupon.status).toBe('available');
    expect(claim.body.remain).toBe(0);

    const again = await h.api('post', `/customer/coupons/${claimable.id}/claim`, customer.token);
    expect(again.status).toBe(400);
    const after = await h.api('get', '/customer/coupons/claimable', customer.token);
    const row = after.body.templates.find((item: { id: string }) => item.id === claimable.id);
    expect(row.canClaim).toBe(false);
    expect(row.reason).toContain('未使用');
  });

  it('生日规则：当天命中并发放，同日重跑不重复发', async () => {
    const birthday = await createCoupon({
      title: '生日礼券 8 元',
      amountCents: 800,
      validDays: 14,
      validTo: day(30)
    });
    const customer = await h.customer('生日顾客');
    await h.prisma.customer.update({ where: { id: customer.id }, data: { birthday: new Date() } });
    const rule = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: birthday.id,
      kind: 'birthday',
      config: { daysBefore: 0 }
    });
    expect(rule.status).toBe(201);
    const ruleId = rule.body.rule.id as string;

    const preview = await h.api('post', `/admin/coupons/rules/${ruleId}/preview`, admin);
    expect(preview.status).toBe(201);
    expect(preview.body.count).toBeGreaterThanOrEqual(1);
    expect(preview.body.willIssue).toBeGreaterThanOrEqual(1);

    const run = await h.api('post', `/admin/coupons/rules/${ruleId}/run`, admin);
    expect(run.status).toBe(201);
    expect(run.body.result.issued).toBeGreaterThanOrEqual(1);
    const birthdayCoupons = (await h.api('get', '/customer/coupons', customer.token)).body.coupons.filter(
      (row: { title: string }) => row.title === '生日礼券 8 元'
    );
    expect(birthdayCoupons).toHaveLength(1);
    expect(birthdayCoupons[0].source).toBe('auto');

    // 同一天再跑：命中幂等分支，不会多出一张。
    await h.api('post', `/admin/coupons/rules/${ruleId}/run`, admin);
    const afterRerun = (await h.api('get', '/customer/coupons', customer.token)).body.coupons.filter(
      (row: { title: string }) => row.title === '生日礼券 8 元'
    );
    expect(afterRerun).toHaveLength(1);

    const rules = await h.api('get', '/admin/coupons/rules', admin);
    const saved = rules.body.rules.find((row: { id: string }) => row.id === ruleId);
    expect(saved.kind).toBe('birthday');
    expect(saved.lastRunIssued).toBeGreaterThanOrEqual(1);
  });

  it('沉睡唤醒规则：按最近支付时间命中，只给有过消费的会员发', async () => {
    const winback = await createCoupon({ title: '沉睡唤醒券', amountCents: 1000, validDays: 7 });
    const dormant = await h.customer('沉睡顾客');
    const fresh = await h.customer('没消费过的新客');
    const order = await h.api('post', '/customer/orders', dormant.token, {
      ...freshOrderBody(),
      idempotencyKey: 'winback-order-0001'
    });
    expect(order.status).toBe(201);
    // 把已支付时间改到 90 天前，制造「沉睡了三个月」的老客。
    await h.prisma.order.update({
      where: { id: order.body.order.id },
      data: { paidAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
    });

    const rule = await h.api('post', '/admin/coupons/rules', admin, {
      couponId: winback.id,
      kind: 'winback',
      config: { inactiveDays: 60, minOrders: 1 }
    });
    expect(rule.status).toBe(201);
    const run = await h.api('post', `/admin/coupons/rules/${rule.body.rule.id}/run`, admin);
    expect(run.status).toBe(201);
    expect(run.body.result.issued).toBeGreaterThanOrEqual(1);

    const mine = await h.api('get', '/customer/coupons', dormant.token);
    expect(mine.body.coupons.some((row: { title: string }) => row.title === '沉睡唤醒券')).toBe(true);
    const never = await h.api('get', '/customer/coupons', fresh.token);
    expect(never.body.coupons.some((row: { title: string }) => row.title === '沉睡唤醒券')).toBe(false);
  });
});
