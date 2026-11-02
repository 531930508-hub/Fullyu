import bcrypt from 'bcryptjs';
import { ACCOUNTS, PASSWORD, createHarness, freshOrderBody, type Harness } from '../testing/harness';

describe('认证与会话', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('门店店长用手机号登录，返回门店范围与权限', async () => {
    const res = await h.api('post', '/auth/login', null, {
      username: ACCOUNTS.managerSh,
      password: PASSWORD
    });
    expect(res.status).toBe(201);
    expect(res.body.staff.name).toBe('苏禾');
    expect(res.body.staff.allStores).toBe(false);
    expect(res.body.staff.storeIds).toEqual(['sh']);
    expect(res.body.staff.permissions).toContain('pos:use');
    expect(res.body.staff.permissions).toContain('order:refund');
    expect(res.body.staff.permissions).not.toContain('finance:view');

    const me = await h.api('get', '/auth/me', res.body.token);
    expect(me.status).toBe(200);
    expect(me.body.staff.username).toBe(ACCOUNTS.managerSh);
  });

  it('密码错误与不存在账号统一返回 401', async () => {
    const wrong = await h.api('post', '/auth/login', null, {
      username: ACCOUNTS.managerSh,
      password: 'wrong-password'
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('UNAUTHORIZED');

    const missing = await h.api('post', '/auth/login', null, {
      username: '13900000000',
      password: PASSWORD
    });
    expect(missing.status).toBe(401);
  });

  it('缺少令牌访问后台接口返回 401', async () => {
    const res = await h.api('get', '/admin/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('请先登录');
  });

  it('超级管理员拥有通配权限与全部门店', async () => {
    const token = await h.login(ACCOUNTS.super);
    const me = await h.api('get', '/admin/me', token);
    expect(me.status).toBe(200);
    expect(me.body.permissions).toEqual(['*']);
    expect(me.body.hasProfit).toBe(true);

    const staff = await h.api('get', '/auth/me', token);
    expect(staff.body.staff.allStores).toBe(true);
  });

  it('只读审计可以查看后台但不能写操作', async () => {
    const token = await h.login(ACCOUNTS.audit);
    const products = await h.api('get', '/admin/products', token);
    expect(products.status).toBe(200);
    expect(Array.isArray(products.body.products)).toBe(true);

    const write = await h.api('post', '/admin/expenses', token, {
      storeId: 'sh',
      date: '2026-10-01',
      category: 'rent',
      amount: '100'
    });
    expect(write.status).toBe(403);
  });

  it('顾客会话可以生成会员码并读取自己的资料', async () => {
    const customer = await h.customer('林小姐');
    expect(customer.memberCode).toMatch(/^TH-/);

    const me = await h.api('get', '/customer/me', customer.token);
    expect(me.status).toBe(200);
    expect(me.body.customer.id).toBe(customer.id);
    expect(me.body.customer.name).toBe('林小姐');

    const anonymous = await h.api('get', '/customer/orders');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.message).toBe('请先建立顾客会话');
  });

  it('会员等级由服务端核验：普通或过期会员没有折扣', async () => {
    const customer = await h.customer('等级测试');
    const base = await h.api('get', '/customer/me', customer.token);
    expect(base.status).toBe(200);
    expect(base.body.customer.memberTier).toBe('standard');
    expect(base.body.customer.discountPerCupCents).toBe(0);

    await h.prisma.customer.update({
      where: { id: customer.id },
      data: { memberTier: 'annual', memberUntil: new Date(Date.now() + 86_400_000) }
    });
    const annual = await h.api('get', '/customer/me', customer.token);
    expect(annual.body.customer.memberTier).toBe('annual');
    expect(annual.body.customer.discountPerCupCents).toBe(200);

    await h.prisma.customer.update({
      where: { id: customer.id },
      data: { memberUntil: new Date(Date.now() - 1000) }
    });
    const expired = await h.api('get', '/customer/me', customer.token);
    expect(expired.body.customer.memberTier).toBe('standard');
    expect(expired.body.customer.discountPerCupCents).toBe(0);
  });

  it('会员码不能用于登录：持他人会员码只会得到新的匿名顾客', async () => {
    const victim = await h.customer('受害顾客');
    const victimOrder = await h.api('post', '/customer/orders', victim.token, freshOrderBody());
    expect(victimOrder.status).toBe(201);

    const hijack = await h.api('post', '/customer/session', null, {
      memberCode: victim.memberCode,
      name: '攻击者',
      phone: '13700000010'
    });
    expect(hijack.status).toBe(201);
    expect(hijack.body.customer.id).not.toBe(victim.id);
    expect(hijack.body.customer.memberCode).not.toBe(victim.memberCode);

    const noPhone = await h.api('post', '/customer/session', null, {
      memberCode: victim.memberCode,
      name: '无手机号攻击者'
    });
    expect(noPhone.status).toBe(400);

    const attackerOrders = await h.api('get', '/customer/orders', hijack.body.token);
    expect(attackerOrders.status).toBe(200);
    expect(attackerOrders.body.orders).toHaveLength(0);

    const attackerProfile = await h.api('put', '/customer/profile', hijack.body.token, { name: '冒名' });
    expect(attackerProfile.status).toBe(200);
    expect(attackerProfile.body.customer.id).not.toBe(victim.id);
  });

  it('同一手机号重复登录恢复同一账号', async () => {
    const first = await h.api('post', '/customer/wechat/login', null, {
      code: 'wx-code-restore',
      phone: '13700000011',
      name: '微信顾客'
    });
    expect(first.status).toBe(201);
    const second = await h.api('post', '/customer/wechat/login', null, {
      code: 'wx-code-restore-again',
      phone: '13700000011'
    });
    expect(second.status).toBe(201);
    expect(second.body.customer.id).toBe(first.body.customer.id);
  });

  it('管理员重置员工密码后旧令牌立即失效', async () => {
    const staffToken = await h.login(ACCOUNTS.staffSh);
    const adminToken = await h.login(ACCOUNTS.super);
    const row = await h.prisma.user.findUnique({
      where: { username: ACCOUNTS.staffSh },
      include: { roles: true }
    });
    if (!row) throw new Error('测试账号不存在');

    const updated = await h.api('patch', `/admin/staff/${row.id}`, adminToken, {
      name: row.name,
      password: 'reset-pass-2026',
      roleIds: row.roles.map((x) => x.roleId),
      storeIds: ['sh']
    });
    expect(updated.status).toBe(200);

    const oldMe = await h.api('get', '/auth/me', staffToken);
    expect(oldMe.status).toBe(401);

    const oldLogin = await h.api('post', '/auth/login', null, {
      username: ACCOUNTS.staffSh,
      password: PASSWORD
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await h.api('post', '/auth/login', null, {
      username: ACCOUNTS.staffSh,
      password: 'reset-pass-2026'
    });
    expect(newLogin.status).toBe(201);
  });

  it('顾客会话可由服务端吊销', async () => {
    const customer = await h.customer('吊销测试');
    expect((await h.api('get', '/customer/me', customer.token)).status).toBe(200);

    await h.prisma.customer.update({
      where: { id: customer.id },
      data: { sessionVersion: { increment: 1 } }
    });

    const revoked = await h.api('get', '/customer/me', customer.token);
    expect(revoked.status).toBe(401);
  });

  it('零门店范围的账号看不到任何门店数据', async () => {
    await h.prisma.user.create({
      data: {
        id: 'u-zero-scope',
        username: '13900009901',
        name: '零范围财务',
        passwordHash: bcrypt.hashSync(PASSWORD, 10),
        active: true,
        roles: { create: [{ roleId: 'r-finance' }] }
      }
    });
    const token = await h.login('13900009901');

    const finance = await h.api('get', '/admin/finance', token);
    expect(finance.status).toBe(200);
    expect(finance.body.entries).toEqual([]);

    const expenses = await h.api('get', '/admin/expenses', token);
    expect(expenses.status).toBe(200);
    expect(expenses.body.expenses).toEqual([]);

    const approvals = await h.api('get', '/admin/approvals', token);
    expect(approvals.status).toBe(200);
    expect(approvals.body.approvals).toEqual([]);

    const logs = await h.api('get', '/admin/logs', token);
    expect(logs.status).toBe(200);
    expect(logs.body.logs).toEqual([]);
  });

  it('停用账号立即失效：不能再登录，旧令牌也不能继续使用', async () => {
    const token = await h.login(ACCOUNTS.managerSh);
    await h.prisma.user.update({ where: { username: ACCOUNTS.managerSh }, data: { active: false } });

    const login = await h.api('post', '/auth/login', null, {
      username: ACCOUNTS.managerSh,
      password: PASSWORD
    });
    expect(login.status).toBe(401);
    expect(login.body.message).toContain('停用');

    const me = await h.api('get', '/auth/me', token);
    expect(me.status).toBe(401);

    await h.prisma.user.update({ where: { username: ACCOUNTS.managerSh }, data: { active: true } });
  });

  it('成功登录不占用失败额度：正常换班不会被误锁', async () => {
    // 先制造 9 次失败，再正常登录一次，最后 2 次失败仍在额度内，必须还是 401。
    const fail = (password: string) =>
      h.api('post', '/auth/login', null, { username: ACCOUNTS.finance, password });
    for (let i = 0; i < 9; i += 1) await fail(`wrong-${i}`);
    const ok = await h.api('post', '/auth/login', null, {
      username: ACCOUNTS.finance,
      password: PASSWORD
    });
    expect(ok.status).toBe(201);
    const after = await fail('wrong-again');
    expect(after.status).toBe(401);
  });

  it('连续输错密码触发限流：返回 429 和中文提示', async () => {
    const statuses: number[] = [];
    let last: { status: number; body: { error?: string; message?: string } } | null = null;
    for (let i = 0; i < 12; i += 1) {
      const res = await h.api('post', '/auth/login', null, {
        username: ACCOUNTS.managerSh,
        password: `wrong-${i}`
      });
      statuses.push(res.status);
      last = { status: res.status, body: res.body };
    }

    expect(statuses).toContain(429);
    expect(last?.status).toBe(429);
    expect(last?.body).toMatchObject({ error: 'TOO_MANY_REQUESTS' });
    expect(last?.body.message).toContain('登录尝试过于频繁');
  });
});
