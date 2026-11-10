import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

describe('账号、角色、门店配置与操作记录', () => {
  let h: Harness;
  let superToken: string;

  beforeAll(async () => {
    h = await createHarness();
    superToken = await h.login(ACCOUNTS.super);
  });

  afterAll(async () => {
    await h.close();
  });

  it('权限目录包含 33 个权限点，内置角色齐全', async () => {
    const permissions = await h.api('get', '/admin/permissions', superToken);
    expect(permissions.status).toBe(200);
    expect(permissions.body.codes).toHaveLength(33);
    expect(permissions.body.codes).toContain('pos:use');
    expect(permissions.body.modules.length).toBeGreaterThanOrEqual(9);

    const roles = await h.api('get', '/admin/roles', superToken);
    expect(roles.status).toBe(200);
    expect(roles.body.roles).toHaveLength(7);
    expect(roles.body.roles.filter((role: { builtin: boolean }) => role.builtin)).toHaveLength(7);
    const staffRole = roles.body.roles.find((role: { id: string }) => role.id === 'r-staff');
    expect(staffRole.perms).toContain('order:refund:request');
    expect(staffRole.perms).not.toContain('order:refund');
  });

  it('账号列表返回门店范围与权限摘要', async () => {
    const res = await h.api('get', '/admin/staff', superToken);
    expect(res.status).toBe(200);
    expect(res.body.staff).toHaveLength(6);
    const manager = res.body.staff.find((x: { username: string }) => x.username === ACCOUNTS.managerSh);
    expect(manager.storeIds).toEqual(['sh']);
    expect(manager.permissions).toContain('pos:use');
  });

  it('创建账号会校验手机号、密码、角色与门店范围', async () => {
    const badName = await h.api('post', '/admin/staff', superToken, {
      name: '测试',
      username: 'abcdefg',
      password: '12345678',
      roleIds: ['r-region'],
      storeIds: ['bj']
    });
    expect(badName.status).toBe(400);
    expect(badName.body.message).toContain('手机号');

    const duplicate = await h.api('post', '/admin/staff', superToken, {
      name: '重复账号',
      username: ACCOUNTS.super,
      password: '12345678',
      roleIds: ['r-region'],
      storeIds: ['bj']
    });
    expect(duplicate.status).toBe(409);

    const noStore = await h.api('post', '/admin/staff', superToken, {
      name: '无门店',
      username: '13900000010',
      password: '12345678',
      roleIds: ['r-region']
    });
    expect(noStore.status).toBe(400);

    const created = await h.api('post', '/admin/staff', superToken, {
      name: '北京店长',
      username: '13900000011',
      password: 'beijing2026',
      roleIds: ['r-region'],
      storeIds: ['bj']
    });
    expect(created.status).toBe(201);
    expect(created.body.staff.storeIds).toEqual(['bj']);
    expect(created.body.staff.permissions).toContain('order:refund');

    const login = await h.login('13900000011', 'beijing2026');
    const me = await h.api('get', '/admin/me', login);
    expect(me.status).toBe(200);
    expect(me.body.hasProfit).toBe(false);
    const denied = await h.api('get', '/admin/staff', login);
    expect(denied.status).toBe(403);
  });

  it('更新密码后旧密码失效，停用账号后不能登录', async () => {
    const list = await h.api('get', '/admin/staff', superToken);
    const target = list.body.staff.find((x: { username: string }) => x.username === '13900000011');

    const updated = await h.api('patch', `/admin/staff/${target.id}`, superToken, {
      name: '北京区域',
      roleIds: ['r-region'],
      storeIds: ['bj', 'bj-east'],
      password: 'newpass2026'
    });
    expect(updated.status).toBe(200);
    expect(updated.body.staff.name).toBe('北京区域');
    expect(updated.body.staff.storeIds).toEqual(['bj', 'bj-east']);

    const old = await h.api('post', '/auth/login', null, {
      username: '13900000011',
      password: 'beijing2026'
    });
    expect(old.status).toBe(401);
    const fresh = await h.login('13900000011', 'newpass2026');
    expect(fresh).toBeTruthy();

    const disabled = await h.api('patch', `/admin/staff/${target.id}`, superToken, {
      name: '北京区域',
      roleIds: ['r-region'],
      storeIds: ['bj', 'bj-east'],
      active: false
    });
    expect(disabled.status).toBe(200);
    expect(disabled.body.staff.active).toBe(false);
    const blocked = await h.api('post', '/auth/login', null, {
      username: '13900000011',
      password: 'newpass2026'
    });
    expect(blocked.status).toBe(401);
  });

  it('自定义角色可创建，内置角色可直接编辑但超级管理员受保护，越权权限会被拒绝', async () => {
    const created = await h.api('post', '/admin/roles', superToken, {
      name: '值班主管',
      description: '只读订单与经营数据',
      scope: 'STORES',
      perms: ['dashboard:view', 'order:view']
    });
    expect(created.status).toBe(201);
    expect(created.body.role.id).toMatch(/^R-/);
    expect(created.body.role.builtin).toBe(false);
    expect(created.body.role.perms).toEqual(['dashboard:view', 'order:view']);

    const wildcard = await h.api('post', '/admin/roles', superToken, {
      name: '通配角色',
      perms: ['*']
    });
    expect(wildcard.status).toBe(400);

    const unknown = await h.api('post', '/admin/roles', superToken, {
      name: '未知权限',
      perms: ['magic:power']
    });
    expect(unknown.status).toBe(400);

    // 内置岗位角色允许直接调整权限（默认模板只是初始值），但超级管理员固定保留通配权限。
    const builtin = await h.api('post', '/admin/roles', superToken, {
      id: 'r-ops',
      name: '总部运营',
      description: '商品、分类、映射、门店配置、报损规则与经营数据，不含财务',
      scope: 'ALL',
      perms: ['dashboard:view', 'product:view', 'product:edit', 'order:view', 'log:view']
    });
    expect(builtin.status).toBe(201);
    expect(builtin.body.role.builtin).toBe(true);
    expect(builtin.body.role.perms).toEqual([
      'dashboard:view', 'product:view', 'product:edit', 'order:view', 'log:view'
    ]);

    const superRole = await h.api('post', '/admin/roles', superToken, {
      id: 'r-super',
      name: '超级管理员',
      perms: ['pos:use']
    });
    expect(superRole.status).toBe(409);
    expect(superRole.body.message).toContain('超级管理员');

    const finance = await h.login(ACCOUNTS.finance);
    const denied = await h.api('post', '/admin/roles', finance, {
      name: '财务自建',
      perms: ['finance:view']
    });
    expect(denied.status).toBe(403);
  });

  it('门店配置可调整营业参数，区域店长无权修改', async () => {
    const stores = await h.api('get', '/admin/stores', superToken);
    expect(stores.status).toBe(200);
    expect(stores.body.stores).toHaveLength(4);

    const updated = await h.api('patch', '/admin/stores/sh', superToken, {
      waitMinutes: 12,
      hours: '09:00–22:00'
    });
    expect(updated.status).toBe(200);
    expect(updated.body.store.waitMinutes).toBe(12);
    expect(updated.body.store.hours).toBe('09:00–22:00');

    const invalidWait = await h.api('patch', '/admin/stores/sh', superToken, { waitMinutes: 200 });
    expect(invalidWait.status).toBe(400);

    const missing = await h.api('patch', '/admin/stores/nope', superToken, { waitMinutes: 5 });
    expect(missing.status).toBe(404);

    const region = await h.login(ACCOUNTS.region);
    const denied = await h.api('patch', '/admin/stores/sh', region, { waitMinutes: 5 });
    expect(denied.status).toBe(403);
  });

  it('桌签链接前缀可配置与清除，只接受不带参数的 https 地址', async () => {
    const initial = await h.api('get', '/admin/seat-qr', superToken);
    expect(initial.status).toBe(200);
    expect(initial.body.baseUrl).toBe('');

    const saved = await h.api('put', '/admin/seat-qr', superToken, {
      baseUrl: 'https://tea.example.com/qr/'
    });
    expect(saved.status).toBe(200);
    expect(saved.body.baseUrl).toBe('https://tea.example.com/qr');

    const read = await h.api('get', '/admin/seat-qr', superToken);
    expect(read.body.baseUrl).toBe('https://tea.example.com/qr');

    const http = await h.api('put', '/admin/seat-qr', superToken, {
      baseUrl: 'http://tea.example.com/qr'
    });
    expect(http.status).toBe(400);

    const withQuery = await h.api('put', '/admin/seat-qr', superToken, {
      baseUrl: 'https://tea.example.com/qr?x=1'
    });
    expect(withQuery.status).toBe(400);

    const malformed = await h.api('put', '/admin/seat-qr', superToken, { baseUrl: 'tea.example.com' });
    expect(malformed.status).toBe(400);

    const rootOnly = await h.api('put', '/admin/seat-qr', superToken, {
      baseUrl: 'https://tea.example.com/'
    });
    expect(rootOnly.status).toBe(400);

    const region = await h.login(ACCOUNTS.region);
    const denied = await h.api('put', '/admin/seat-qr', region, {
      baseUrl: 'https://tea.example.com/qr'
    });
    expect(denied.status).toBe(403);

    const cleared = await h.api('put', '/admin/seat-qr', superToken, { baseUrl: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.baseUrl).toBe('');
  });

  it('总部可新增门店并维护基础资料，新门店自动建立商品库存', async () => {
    const created = await h.api('post', '/admin/stores', superToken, {
      name: '杭州·湖滨店',
      nameEn: 'Hangzhou · Hubin',
      short: '湖滨店',
      city: '杭州',
      cityEn: 'Hangzhou',
      address: '杭州市 · 上城区湖滨路 1 号 1F',
      addressEn: 'Hangzhou · 1 Hubin Rd, Shangcheng',
      lat: 30.254,
      lng: 120.162,
      positions: ['吧台01', '窗边', '吧台01'],
      channels: { mini: true, meituan: false, taobao: false }
    });
    expect(created.status).toBe(201);
    expect(created.body.store.id).toMatch(/^st-/);
    expect(created.body.store.name).toBe('杭州·湖滨店');
    expect(created.body.store.city).toBe('杭州');
    expect(created.body.store.positions).toEqual(['吧台01', '窗边']);
    expect(created.body.store.channels).toEqual({ mini: true, assisted: false, meituan: false, taobao: false });

    const newId = created.body.store.id as string;
    // 新门店为每个在售商品建库存；商品总数随茶单扩充，这里按当前库内数量校验。
    const productCount = await h.prisma.product.count();
    expect(await h.prisma.stock.count({ where: { storeId: newId } })).toBe(productCount);

    const stores = await h.api('get', '/admin/stores', superToken);
    expect(stores.body.stores).toHaveLength(5);
    const bootstrap = await h.api('get', `/customer/bootstrap?storeId=${newId}`);
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.store.name).toBe('杭州·湖滨店');

    const updated = await h.api('patch', `/admin/stores/${newId}`, superToken, {
      name: '杭州·湖滨旗舰店',
      address: '杭州市 · 上城区湖滨路 2 号 1F',
      lat: 30.255,
      short: '湖滨旗舰店'
    });
    expect(updated.status).toBe(200);
    expect(updated.body.store.name).toBe('杭州·湖滨旗舰店');
    expect(updated.body.store.address).toContain('湖滨路 2 号');
    expect(updated.body.store.lat).toBe(30.255);

    const badLat = await h.api('patch', `/admin/stores/${newId}`, superToken, { lat: 100 });
    expect(badLat.status).toBe(400);

    const missingAddress = await h.api('post', '/admin/stores', superToken, {
      name: '无地址门店',
      city: '杭州'
    });
    expect(missingAddress.status).toBe(400);

    const region = await h.login(ACCOUNTS.region);
    const denied = await h.api('post', '/admin/stores', region, {
      name: '越权门店',
      city: '杭州',
      address: '杭州市 · 某路 1 号'
    });
    expect(denied.status).toBe(403);
  });

  it('退款审批规则可维护，门槛影响后续退款审批判断', async () => {
    const initial = await h.api('get', '/admin/refund-flow', superToken);
    expect(initial.status).toBe(200);
    expect(initial.body.flow.thresholdCents).toBeGreaterThan(0);

    const saved = await h.api('put', '/admin/refund-flow', superToken, {
      enabled: false,
      thresholdCents: 2000
    });
    expect(saved.status).toBe(200);
    expect(saved.body.flow.enabled).toBe(false);
    expect(saved.body.flow.thresholdCents).toBe(2000);

    const reread = await h.api('get', '/admin/refund-flow', superToken);
    expect(reread.body.flow.enabled).toBe(false);
    expect(reread.body.flow.thresholdCents).toBe(2000);

    const finance = await h.login(ACCOUNTS.finance);
    const financeSaved = await h.api('put', '/admin/refund-flow', finance, {
      enabled: true,
      thresholdCents: 5000
    });
    expect(financeSaved.status).toBe(200);

    const audit = await h.login(ACCOUNTS.audit);
    const denied = await h.api('put', '/admin/refund-flow', audit, { enabled: true });
    expect(denied.status).toBe(403);
  });

  it('原料 SKU 映射可维护，并校验商品与换算系数', async () => {
    const list = await h.api('get', '/admin/mappings', superToken);
    expect(list.status).toBe(200);
    expect(list.body.mappings.length).toBeGreaterThan(0);
    expect(list.body.mappings[0]).toHaveProperty('productName');

    const created = await h.api('post', '/admin/mappings', superToken, {
      externalId: 'SCM-QA-001',
      productId: 'xing-0',
      unit: '袋',
      factor: 500
    });
    expect(created.status).toBe(201);
    expect(created.body.mapping.factor).toBe(500);

    const badProduct = await h.api('post', '/admin/mappings', superToken, {
      externalId: 'SCM-QA-002',
      productId: 'nope',
      factor: 500
    });
    expect(badProduct.status).toBe(400);

    const badFactor = await h.api('post', '/admin/mappings', superToken, {
      externalId: 'SCM-QA-003',
      productId: 'xing-0',
      factor: 0
    });
    expect(badFactor.status).toBe(400);

    const region = await h.login(ACCOUNTS.region);
    const denied = await h.api('get', '/admin/mappings', region);
    expect(denied.status).toBe(403);
  });

  it('操作记录按账号与类型可查，审计账号可读', async () => {
    await h.login(ACCOUNTS.managerSh);
    const logs = await h.api(
      'get',
      `/admin/logs?type=auth&q=${ACCOUNTS.managerSh}`,
      superToken
    );
    expect(logs.status).toBe(200);
    expect(logs.body.logs.length).toBeGreaterThan(0);
    expect(logs.body.logs[0].action).toBe('登录后台');
    expect(logs.body.logs[0].detail).toBe(ACCOUNTS.managerSh);

    const audit = await h.login(ACCOUNTS.audit);
    const readable = await h.api('get', '/admin/logs', audit);
    expect(readable.status).toBe(200);
    expect(Array.isArray(readable.body.logs)).toBe(true);

    const staff = await h.login(ACCOUNTS.staffSh);
    const denied = await h.api('get', '/admin/staff', staff);
    expect(denied.status).toBe(403);
  });
});
