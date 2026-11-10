import {
  ACCOUNTS,
  createHarness,
  freshOrderBody,
  retailOrderBody,
  type Harness
} from '../testing/harness';

describe('顾客下单主流程', () => {
  let h: Harness;
  let customerToken: string;
  let superToken: string;

  beforeAll(async () => {
    h = await createHarness();
    customerToken = (await h.customer('点单茶客')).token;
    superToken = await h.login(ACCOUNTS.super);
  });

  afterAll(async () => {
    await h.close();
  });

  const place = (body: unknown) => h.api('post', '/customer/orders', customerToken, body);

  it('鲜酿堂食下单：A 单号、杯贴、收款流水与库存扣减', async () => {
    const res = await place(freshOrderBody());
    expect(res.status).toBe(201);
    const order = res.body.order;
    expect(order.number).toMatch(/^A\d{3}$/);
    expect(order.storeId).toBe('sh');
    expect(order.storeName).toBe('上海·西岸店');
    expect(order.channel).toBe('mini');
    expect(order.status).toBe('pending');
    expect(order.paymentStatus).toBe('paid');
    expect(order.totalCents).toBe(2000);
    expect(order.cupTotal).toBe(1);
    expect(order.units[0].label).toBe(`${order.number}-1`);
    expect(order.printStatus).toBe('printed');
    expect(order.items[0]).toMatchObject({
      productId: 'xing-0',
      name: '醒·花园蜜香',
      qty: 1,
      unitPriceCents: 2000,
      totalCents: 2000,
      temp: '热'
    });

    const entry = await h.prisma.financeEntry.findFirst({
      where: { orderId: order.id, type: 'SALE' }
    });
    expect(entry?.amountCents).toBe(2000);
    expect(entry?.method).toBe('微信支付');
    expect(entry?.settlement).toBe('settled');

    const stock = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });
    expect(stock?.grams).toBe(476.5);
  });

  it('顾客能在自己的订单列表和详情里看到订单', async () => {
    const list = await h.api('get', '/customer/orders', customerToken);
    expect(list.status).toBe(200);
    expect(list.body.orders).toHaveLength(1);

    const detail = await h.api('get', `/customer/orders/${list.body.orders[0].id}`, customerToken);
    expect(detail.status).toBe(200);
    expect(detail.body.order.id).toBe(list.body.orders[0].id);
  });

  it('其他顾客看不到不属于自己的订单', async () => {
    const stranger = await h.customer('路过茶客');
    const list = await h.api('get', '/customer/orders', stranger.token);
    expect(list.status).toBe(200);
    expect(list.body.orders).toHaveLength(0);

    const mine = await h.api('get', '/customer/orders', customerToken);
    const detail = await h.api('get', `/customer/orders/${mine.body.orders[0].id}`, stranger.token);
    expect(detail.status).toBe(404);
  });

  it('普通会员不享受每杯立减，年卡会员才按杯立减 2 元', async () => {
    const standard = await h.customer('普通茶客');
    const plain = await place({ ...freshOrderBody(), memberCode: standard.memberCode });
    expect(plain.status).toBe(201);
    expect(plain.body.order.totalCents).toBe(2000);
    expect(plain.body.order.items[0].unitPriceCents).toBe(2000);

    // 伪造其他会员码也不能换来折扣：折扣只认当前登录账号的库内会籍。
    const disguised = await place({ ...freshOrderBody(), memberCode: 'TH-2026-8888' });
    expect(disguised.status).toBe(201);
    expect(disguised.body.order.totalCents).toBe(2000);

    const annual = await h.customer('年卡茶客');
    await h.prisma.customer.update({
      where: { id: annual.id },
      data: { memberTier: 'annual' }
    });
    const discounted = await h.api('post', '/customer/orders', annual.token, freshOrderBody());
    expect(discounted.status).toBe(201);
    expect(discounted.body.order.totalCents).toBe(1800);
    expect(discounted.body.order.items[0].unitPriceCents).toBe(1800);
  });

  it('年卡到期后不再享受每杯立减', async () => {
    const annual = await h.customer('过期年卡茶客');
    await h.prisma.customer.update({
      where: { id: annual.id },
      data: { memberTier: 'annual', memberUntil: new Date(Date.now() - 86_400_000) }
    });
    const res = await h.api('post', '/customer/orders', annual.token, freshOrderBody());
    expect(res.status).toBe(201);
    expect(res.body.order.totalCents).toBe(2000);
  });

  it('热饮/固定规格商品忽略旧版客户端的占位冰量，仍拒绝真实冰量选项', async () => {
    const legacy = await place({
      ...freshOrderBody(),
      items: [{ productId: 'smoke', qty: 1, temp: '热', ice: '热饮' }]
    });
    expect(legacy.status).toBe(201);
    expect(legacy.body.order.items[0].temp).toBe('热');
    expect(legacy.body.order.items[0].ice).toBeNull();

    const hotTea = await place({
      ...freshOrderBody(),
      items: [{ productId: 'xing-0', qty: 1, temp: '热', ice: '热饮' }]
    });
    expect(hotTea.status).toBe(201);
    expect(hotTea.body.order.items[0].ice).toBe('标准冰');

    const fixed = await place({
      ...freshOrderBody(),
      items: [{ productId: 'smoke', qty: 1, temp: '冰', ice: '热饮' }]
    });
    expect(fixed.status).toBe(201);
    expect(fixed.body.order.items[0].ice).toBeNull();

    const realIce = await place({
      ...freshOrderBody(),
      items: [{ productId: 'smoke', qty: 1, temp: '冰', ice: '少冰' }]
    });
    expect(realIce.status).toBe(400);
    expect(realIce.body.message).toContain('不支持冰量');
  });

  it('无效座位、超出数量与未知商品都会被拒绝', async () => {
    const seat = await place({ ...freshOrderBody(), seat: '不存在的座位' });
    expect(seat.status).toBe(400);
    expect(seat.body.message).toContain('堂食');

    const qty = await place({
      ...freshOrderBody(),
      items: [{ productId: 'xing-0', qty: 21, temp: '热' }]
    });
    expect(qty.status).toBe(400);

    const missing = await place({
      ...freshOrderBody(),
      items: [{ productId: 'nope', qty: 1 }]
    });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toContain('商品不存在');
  });

  it('售罄或库存不足时不允许下单，且不会产生订单', async () => {
    const key = { storeId_productId: { storeId: 'sh', productId: 'xing-0' } };
    const before = await h.prisma.order.count({ where: { storeId: 'sh' } });
    await h.prisma.stock.update({ where: key, data: { soldOut: true } });
    const soldOut = await place(freshOrderBody());
    expect(soldOut.status).toBe(409);
    expect(soldOut.body.message).toContain('售罄');

    await h.prisma.stock.update({ where: key, data: { soldOut: false, grams: 1 } });
    const short = await place(freshOrderBody());
    expect(short.status).toBe(409);
    expect(short.body.message).toContain('库存不足');

    await h.prisma.stock.update({ where: key, data: { grams: 480 } });
    const count = await h.prisma.order.count({ where: { storeId: 'sh' } });
    expect(count).toBe(before);
  });

  it('鲜酿与零售商品不能混在下单里', async () => {
    const teaAsRetail = await place({
      storeId: 'brand',
      business: 'retail',
      type: 'retail',
      items: [{ productId: 'xing-0', qty: 1 }]
    });
    expect(teaAsRetail.status).toBe(400);
    expect(teaAsRetail.body.message).toContain('鲜酿');

    const bottleAsFresh = await place({
      ...freshOrderBody(),
      items: [{ productId: 'bottle', qty: 1 }]
    });
    expect(bottleAsFresh.status).toBe(400);
    expect(bottleAsFresh.body.message).toContain('现制茶饮');
  });

  it('零售订单生成 4 位提货码与品牌零售单号', async () => {
    const res = await place(retailOrderBody());
    expect(res.status).toBe(201);
    const order = res.body.order;
    expect(order.business).toBe('retail');
    expect(order.storeId).toBe('brand');
    expect(order.storeName).toBe('品牌零售');
    expect(order.status).toBe('awaiting');
    expect(order.paymentStatus).toBe('paid');
    expect(order.pickupCode).toMatch(/^\d{4}$/);
    expect(order.number).toMatch(/^TH-R-\d{8}-\d{4}$/);
    expect(order.totalCents).toBe(39800);
    expect(order.items[0]).toMatchObject({ productId: 'bottle', kind: 'bottle', qty: 1 });
  });

  it('门店暂停营业或关闭小程序渠道时顾客无法下单', async () => {
    await h.api('patch', '/admin/stores/sh', superToken, { open: false });
    const closed = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    expect(closed.status).toBe(409);
    expect(closed.body.message).toContain('暂停营业');
    await h.api('patch', '/admin/stores/sh', superToken, { open: true });

    await h.api('patch', '/admin/stores/sh', superToken, {
      channels: { mini: false, assisted: true, meituan: true, taobao: true }
    });
    const offline = await place({ ...freshOrderBody(), type: 'takeaway', seat: null });
    expect(offline.status).toBe(409);
    expect(offline.body.message).toContain('渠道');
    await h.api('patch', '/admin/stores/sh', superToken, {
      channels: { mini: true, assisted: true, meituan: true, taobao: true }
    });
  });

  it('营业台代点支持现金收款，拒绝配送代点，并受门店范围限制', async () => {
    const manager = await h.login(ACCOUNTS.managerSh);
    const res = await h.api('post', '/store/orders', manager, {
      storeId: 'sh',
      type: 'takeaway',
      items: [{ productId: 'xing-0', qty: 1, temp: '热' }],
      paymentMethod: 'cash'
    });
    expect(res.status).toBe(201);
    expect(res.body.order.channel).toBe('assisted');
    expect(res.body.order.paymentMethod).toBe('cash');
    expect(res.body.order.ownerKind).toBe('guest');
    expect(res.body.order.createdBy).toBe('u-su');

    const delivery = await h.api('post', '/store/orders', manager, {
      storeId: 'sh',
      type: 'delivery',
      items: [{ productId: 'xing-0', qty: 1 }]
    });
    expect(delivery.status).toBe(400);
    expect(delivery.body.message).toContain('配送');

    const otherStore = await h.api('post', '/store/orders', manager, {
      storeId: 'bj',
      type: 'takeaway',
      items: [{ productId: 'xing-0', qty: 1 }]
    });
    expect(otherStore.status).toBe(403);
  });

  it('代点扫会员码：权益可查、年卡折扣入单，普通会员与无效码被区分', async () => {
    const manager = await h.login(ACCOUNTS.managerSh);
    const annual = await h.customer('代点年卡茶客');
    await h.prisma.customer.update({
      where: { id: annual.id },
      data: { memberTier: 'annual' }
    });

    const benefit = await h.api('post', '/store/member/verify', manager, { code: annual.memberCode });
    expect(benefit.status).toBe(201);
    expect(benefit.body.benefit.tier).toBe('annual');
    expect(benefit.body.benefit.discountPerCupCents).toBe(200);
    expect(benefit.body.mode).toBe('db');

    // 普通会员仍是有效会员码，只是不享受立减，营业台不应按无效码处理。
    const standard = await h.customer('代点普通茶客');
    const standardBenefit = await h.api('post', '/store/member/verify', manager, {
      code: standard.memberCode
    });
    expect(standardBenefit.status).toBe(201);
    expect(standardBenefit.body.benefit.tier).toBe('standard');
    expect(standardBenefit.body.benefit.discountPerCupCents).toBe(0);

    const bad = await h.api('post', '/store/member/verify', manager, { code: '乱码' });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain('会员码无效');

    const discounted = await h.api('post', '/store/orders', manager, {
      storeId: 'sh',
      type: 'takeaway',
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }],
      paymentMethod: 'wechat',
      memberCode: annual.memberCode
    });
    expect(discounted.status).toBe(201);
    expect(discounted.body.order.channel).toBe('assisted');
    expect(discounted.body.order.items[0].unitPriceCents).toBe(1800);
    expect(discounted.body.order.totalCents).toBe(3600);

    const plain = await h.api('post', '/store/orders', manager, {
      storeId: 'sh',
      type: 'takeaway',
      items: [{ productId: 'xing-0', qty: 1, temp: '热' }],
      paymentMethod: 'wechat',
      memberCode: standard.memberCode
    });
    expect(plain.status).toBe(201);
    expect(plain.body.order.items[0].unitPriceCents).toBe(2000);
    expect(plain.body.order.totalCents).toBe(2000);

    const rejected = await h.api('post', '/store/orders', manager, {
      storeId: 'sh',
      type: 'takeaway',
      items: [{ productId: 'xing-0', qty: 1 }],
      memberCode: '乱码'
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toContain('会员码无效');
  });

  it('店员没有 pos:use 之外的会员查询越权风险：只读审计不能查会员权益', async () => {
    const audit = await h.login(ACCOUNTS.audit);
    const res = await h.api('post', '/store/member/verify', audit, { code: 'TH-2026-8888' });
    expect(res.status).toBe(403);
  });

  it('未登录顾客不能创建订单', async () => {
    const res = await h.api('post', '/customer/orders', null, freshOrderBody());
    expect(res.status).toBe(401);
  });

  it('堂食不指定座位时按吧台取餐口自取下单', async () => {
    const res = await place({ ...freshOrderBody(), seat: null });
    expect(res.status).toBe(201);
    expect(res.body.order.type).toBe('dine');
    expect(res.body.order.seat).toBe('');
  });

  it('营业台代点幂等：同键同内容返回同一单，同键异内容冲突', async () => {
    const manager = await h.login(ACCOUNTS.managerSh);
    const body = {
      storeId: 'sh',
      type: 'takeaway',
      items: [{ productId: 'xing-0', qty: 1, temp: '热' }],
      paymentMethod: 'wechat',
      idempotencyKey: 'pos-retry-20261031-0001'
    };
    const before = await h.prisma.order.count({ where: { channel: 'assisted' } });

    const first = await h.api('post', '/store/orders', manager, body);
    const second = await h.api('post', '/store/orders', manager, body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.order.id).toBe(first.body.order.id);

    const after = await h.prisma.order.count({ where: { channel: 'assisted' } });
    expect(after - before).toBe(1);

    const changed = await h.api('post', '/store/orders', manager, {
      ...body,
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });
    expect(changed.status).toBe(409);
    expect(changed.body.message).toContain('幂等键');
  });
});
