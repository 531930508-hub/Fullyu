import { ACCOUNTS, createHarness, freshOrderBody, type Harness } from '../testing/harness';

describe('门店、菜单与库存', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('顾客端返回全部门店，含已下线占位店与筹备中门店', async () => {
    const res = await h.api('get', '/customer/stores');
    expect(res.status).toBe(200);
    expect(res.body.stores.map((store: { id: string }) => store.id)).toEqual([
      'sh',
      'sh-west',
      'bj',
      'bj-east'
    ]);
    const sh = res.body.stores.find((store: { id: string }) => store.id === 'sh');
    expect(sh.name).toBe('上海·西岸店');
    expect(sh.address).toBe('上海市 · 徐汇区龙华机场路 8 号商业街区 1F');
    expect(sh.open).toBe(true);
    expect(sh.channels.mini).toBe(true);
    expect(sh.positions).toContain('吧台01');

    // 旧占位店不再进入点单渠道；北京东直门店保留小程序渠道，但未营业。
    expect(res.body.stores.find((store: { id: string }) => store.id === 'sh-west').channels.mini).toBe(false);
    expect(res.body.stores.find((store: { id: string }) => store.id === 'bj').channels.mini).toBe(false);
    const bjEast = res.body.stores.find((store: { id: string }) => store.id === 'bj-east');
    expect(bjEast.name).toBe('北京·东直门店');
    expect(bjEast.address).toBe('北京市 · 东城区东直门外大街 39 号');
    expect(bjEast.open).toBe(false);
    expect(bjEast.channels.mini).toBe(true);
    expect(bjEast.hours).toBe('12 月底开业');
  });

  it('bootstrap 默认选中第一家可下单门店并返回完整菜单与硬件模式', async () => {
    const res = await h.api('get', '/customer/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.store.id).toBe('sh');
    expect(res.body.products).toHaveLength(34);
    expect(res.body.categories).toHaveLength(8);
    expect(res.body.hardware).toEqual({
      payment: 'mock',
      member: 'mock',
      printer: 'mock',
      teaMachine: 'mock'
    });
    // 品牌顺序固定为 醒 → 松 → 庆 → 眠，不能按字符串排序成 眠 开头。
    const seriesOrder = res.body.products
      .map((p: { series: string }) => p.series)
      .filter((value: string, index: number, list: string[]) => list.indexOf(value) === index);
    expect(seriesOrder).toEqual(['xing', 'song', 'qing', 'mian']);
    const xing = res.body.products.find((p: { id: string }) => p.id === 'xing-0');
    expect(xing.name).toBe('醒·花园蜜香');
    expect(xing.priceCents).toBe(2000);
    expect(xing.available).toBe(true);
    expect(xing.temps).toEqual(['热', '冰']);
    expect(res.body.retail.find((p: { id: string }) => p.id === 'bottle').id).toBe('bottle');
  });

  it('bootstrap 可以按指定门店返回对应库存', async () => {
    const res = await h.api('get', '/customer/bootstrap?storeId=sh');
    expect(res.status).toBe(200);
    expect(res.body.store.id).toBe('sh');
    const xing = res.body.products.find((p: { id: string }) => p.id === 'xing-0');
    expect(xing.stockGrams).toBe(480);
  });

  it('bootstrap 不会落到未营业或未开通小程序的门店', async () => {
    // 北京店筹备中：即使本地缓存了该店，也回到当前可下单门店。
    const closed = await h.api('get', '/customer/bootstrap?storeId=bj-east');
    expect(closed.status).toBe(200);
    expect(closed.body.store.id).toBe('sh');

    // 旧占位店未开通小程序渠道，同样不作为落点。
    const disabled = await h.api('get', '/customer/bootstrap?storeId=sh-west');
    expect(disabled.status).toBe(200);
    expect(disabled.body.store.id).toBe('sh');
  });

  it('菜单按门店返回库存与可售状态，未知门店返回 404', async () => {
    const menu = await h.api('get', '/customer/menu?storeId=sh-west');
    expect(menu.status).toBe(200);
    expect(menu.body.store.id).toBe('sh-west');
    expect(menu.body.categories).toHaveLength(8);
    expect(menu.body.products).toHaveLength(34);

    const missing = await h.api('get', '/customer/menu?storeId=nope');
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('门店不存在');

    const invalid = await h.api('get', '/customer/menu');
    expect(invalid.status).toBe(400);
  });

  it('零售可售清单按全部门店汇总库存', async () => {
    const res = await h.api('get', '/customer/retail');
    expect(res.status).toBe(200);
    const bottle = res.body.products.find((p: { id: string }) => p.id === 'bottle');
    expect(bottle.name).toBe('庆·细泡香槟');
    // 目前只有上海西岸店对外营业并支持零售提货。
    expect(bottle.stores).toBe(1);
    expect(bottle.totalStock).toBeGreaterThanOrEqual(12);
    expect(res.body.products.some((p: { id: string }) => p.id === 'xing-0')).toBe(false);
  });

  it('门店店长可以查看并调整本店库存与售罄', async () => {
    const token = await h.login(ACCOUNTS.managerSh);
    const list = await h.api('get', '/store/inventory?storeId=sh', token);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(34);
    expect(list.body.items.find((x: { productId: string }) => x.productId === 'xing-0').grams).toBe(480);

    const soldOut = await h.api(
      'put',
      '/store/inventory',
      token,
      { storeId: 'sh', items: [{ productId: 'xing-0', soldOut: true }] }
    );
    expect(soldOut.status).toBe(200);

    const menu = await h.api('get', '/customer/menu?storeId=sh');
    const xing = menu.body.products.find((p: { id: string }) => p.id === 'xing-0');
    expect(xing.soldOut).toBe(true);
    expect(xing.available).toBe(false);

    await h.api('put', '/store/inventory', token, {
      storeId: 'sh',
      items: [{ productId: 'xing-0', soldOut: false, grams: 480 }]
    });
  });

  it('库存调整受门店范围与库存权限限制', async () => {
    const staff = await h.login(ACCOUNTS.staffSh);
    const denied = await h.api('put', '/store/inventory', staff, {
      storeId: 'sh',
      items: [{ productId: 'xing-0', grams: 100 }]
    });
    expect(denied.status).toBe(403);

    const manager = await h.login(ACCOUNTS.managerSh);
    const otherStore = await h.api('get', '/store/inventory?storeId=bj', manager);
    expect(otherStore.status).toBe(403);

    const unknown = await h.api('put', '/store/inventory', manager, {
      storeId: 'sh',
      items: [{ productId: 'nope', grams: 1 }]
    });
    expect(unknown.status).toBe(400);
  });

  it('总部商品目录包含库存汇总，区域店长无权访问', async () => {
    const superToken = await h.login(ACCOUNTS.super);
    const res = await h.api('get', '/admin/products', superToken);
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(34);
    expect(res.body.categories).toHaveLength(8);
    expect(res.body.products[0]).toHaveProperty('totalGrams');
    expect(res.body.products[0]).toHaveProperty('soldOutStores');

    const region = await h.login(ACCOUNTS.region);
    const denied = await h.api('get', '/admin/products', region);
    expect(denied.status).toBe(403);
  });

  it('创建商品会校验分类、系列并自动建立门店库存', async () => {
    const token = await h.login(ACCOUNTS.super);
    const created = await h.api('post', '/admin/products', token, {
      name: '试饮·桂花乌龙',
      nameEn: 'Osmanthus Oolong',
      categoryId: 'fresh',
      series: 'xing',
      kind: 'tea',
      priceCents: 1800,
      costCents: 500,
      doseGrams: 4
    });
    expect(created.status).toBe(201);
    expect(created.body.product.id).toMatch(/^P-/);
    expect(created.body.product.name).toBe('试饮·桂花乌龙');
    expect(created.body.product.totalGrams).toBe(0);
    expect(created.body.product.temps).toEqual(['热', '冰']);

    const list = await h.api('get', '/admin/products', token);
    expect(list.body.products).toHaveLength(35);

    const badSeries = await h.api('post', '/admin/products', token, {
      name: '无效系列',
      categoryId: 'fresh',
      series: 'unknown'
    });
    expect(badSeries.status).toBe(400);

    const badCategory = await h.api('post', '/admin/products', token, {
      name: '无效分类',
      categoryId: 'nope',
      series: 'xing'
    });
    expect(badCategory.status).toBe(400);
  });

  it('编辑商品需要商品编辑权限，售价单独受敏感字段保护', async () => {
    const audit = await h.login(ACCOUNTS.audit);
    const denied = await h.api('patch', '/admin/products/xing-0', audit, { priceCents: 2100 });
    expect(denied.status).toBe(403);

    const token = await h.login(ACCOUNTS.super);
    const updated = await h.api('patch', '/admin/products/xing-0', token, { tag: '本季主打' });
    expect(updated.status).toBe(200);
    expect(updated.body.product.tag).toBe('本季主打');

    const price = await h.api('patch', '/admin/products/xing-0', token, { priceCents: 2100 });
    expect(price.status).toBe(200);
    expect(price.body.product.priceCents).toBe(2100);
    await h.api('patch', '/admin/products/xing-0', token, { priceCents: 2000, tag: '' });
  });

  it('可以新增分类并出现在商品目录中', async () => {
    const token = await h.login(ACCOUNTS.super);
    const created = await h.api('post', '/admin/categories', token, {
      name: '季节限定',
      nameEn: 'Seasonal',
      kind: 'retail'
    });
    expect(created.status).toBe(201);
    expect(created.body.category.id).toMatch(/^CAT-/);

    const list = await h.api('get', '/admin/products', token);
    expect(list.body.categories).toHaveLength(9);

    const invalid = await h.api('post', '/admin/categories', token, { name: '错误类型', kind: 'nope' });
    expect(invalid.status).toBe(400);
  });

  it('公共菜单与顾客订单不暴露成本与投料字段，后台保留成本', async () => {
    const res = await h.api('get', '/customer/bootstrap');
    expect(res.status).toBe(200);
    const xing = res.body.products.find((p: { id: string }) => p.id === 'xing-0');
    expect(xing).not.toHaveProperty('costCents');
    expect(xing).not.toHaveProperty('doseGrams');
    expect(xing.available).toBe(true);

    const menu = await h.api('get', '/customer/menu?storeId=sh');
    const menuItem = menu.body.products.find((p: { id: string }) => p.id === 'xing-0');
    expect(menuItem).not.toHaveProperty('costCents');
    expect(menuItem).not.toHaveProperty('doseGrams');

    const customer = await h.customer('保密顾客');
    const created = await h.api('post', '/customer/orders', customer.token, freshOrderBody());
    expect(created.status).toBe(201);
    expect(created.body.order.items[0]).not.toHaveProperty('costCents');

    const mine = await h.api('get', '/customer/orders', customer.token);
    expect(mine.status).toBe(200);
    expect(mine.body.orders[0].items[0]).not.toHaveProperty('costCents');

    const token = await h.login(ACCOUNTS.super);
    const admin = await h.api('get', '/admin/products', token);
    const adminXing = admin.body.products.find((p: { id: string }) => p.id === 'xing-0');
    expect(adminXing.costCents).toBeGreaterThan(0);
  });

  it('员工目录视图保留投茶量且不暴露成本，受门店范围约束', async () => {
    const manager = await h.login(ACCOUNTS.managerSh);
    const res = await h.api('get', '/store/catalog?storeId=sh', manager);
    expect(res.status).toBe(200);
    expect(res.body.store.id).toBe('sh');
    const xing = res.body.products.find((p: { id: string }) => p.id === 'xing-0');
    expect(xing).toHaveProperty('doseGrams');
    expect(xing.doseGrams).toBeGreaterThan(0);
    expect(xing).not.toHaveProperty('costCents');
    expect(xing).toHaveProperty('available');

    const staff = await h.login(ACCOUNTS.staffSh);
    const allowed = await h.api('get', '/store/catalog?storeId=sh', staff);
    expect(allowed.status).toBe(200);

    const outOfScope = await h.api('get', '/store/catalog?storeId=bj', staff);
    expect(outOfScope.status).toBe(403);

    const anonymous = await h.api('get', '/store/catalog?storeId=sh');
    expect(anonymous.status).toBe(401);
  });

  it('茶单顺序默认由总部维护，门店可覆盖本店顺序，恢复后跟随总部', async () => {
    const superToken = await h.login(ACCOUNTS.super);
    const manager = await h.login(ACCOUNTS.managerSh);
    const idsOf = (menu: { body: { products: Array<{ id: string; series: string; categoryId: string }> } }) =>
      menu.body.products
        .filter((p) => p.series === 'xing' && p.categoryId === 'fresh' && /^xing-\d+$/.test(p.id))
        .map((p) => p.id);

    const original = ['xing-0', 'xing-1', 'xing-2', 'xing-3', 'xing-4'];
    const hqOrder = ['xing-4', 'xing-3', 'xing-2', 'xing-1', 'xing-0'];
    const shMenu = await h.api('get', '/customer/menu?storeId=sh');
    expect(idsOf(shMenu)).toEqual(original);

    const hq = await h.api('patch', '/admin/products/order', superToken, { ids: hqOrder });
    expect(hq.status).toBe(200);
    // 总部只负责同系列同分类内的顺序，跨组提交必须拒绝。
    const mixed = await h.api('patch', '/admin/products/order', superToken, { ids: ['xing-0', 'song-0'] });
    expect(mixed.status).toBe(400);

    const shAfterHq = await h.api('get', '/customer/menu?storeId=sh');
    expect(idsOf(shAfterHq)).toEqual(hqOrder);
    const bjAfterHq = await h.api('get', '/customer/menu?storeId=bj');
    expect(idsOf(bjAfterHq)).toEqual(hqOrder);

    // 门店覆盖仅影响本店；同城另一家店仍跟随总部。
    const storeOrder = await h.api('put', '/store/inventory/order', manager, {
      storeId: 'sh',
      productIds: original
    });
    expect(storeOrder.status).toBe(200);
    const shOwn = await h.api('get', '/customer/menu?storeId=sh');
    expect(idsOf(shOwn)).toEqual(original);
    const bjUntouched = await h.api('get', '/customer/menu?storeId=bj');
    expect(idsOf(bjUntouched)).toEqual(hqOrder);

    // 库存列表明确返回本店是否已覆盖顺序。
    const inventory = await h.api('get', '/store/inventory?storeId=sh', manager);
    expect(inventory.body.items.find((x: { productId: string }) => x.productId === 'xing-0').customOrder).toBe(true);

    const reset = await h.api('delete', '/store/inventory/order?storeId=sh', manager);
    expect(reset.status).toBe(200);
    const shReset = await h.api('get', '/customer/menu?storeId=sh');
    expect(idsOf(shReset)).toEqual(hqOrder);

    // 店长可调本店顺序；普通店员没有库存权限。
    const staff = await h.login(ACCOUNTS.staffSh);
    const denied = await h.api('put', '/store/inventory/order', staff, { storeId: 'sh', productIds: original });
    expect(denied.status).toBe(403);
    const otherStore = await h.api('put', '/store/inventory/order', manager, { storeId: 'bj', productIds: original });
    expect(otherStore.status).toBe(403);

    await h.api('patch', '/admin/products/order', superToken, { ids: original });
    const admin = await h.api('get', '/admin/products', superToken);
    const adminIds = admin.body.products.filter((p: { id: string }) => original.includes(p.id)).map((p: { id: string }) => p.id);
    expect(adminIds).toEqual(original);
  });
});
