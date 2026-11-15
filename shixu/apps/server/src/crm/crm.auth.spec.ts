import { createHarness, type Harness } from '../testing/harness';
import { startFakeCrm, type FakeCrm } from '../testing/crm-fake';

const ENV_KEYS = [
  'CRM_ENABLED',
  'CRM_BASE_URL',
  'CRM_KEY_ID',
  'CRM_SECRET',
  'CRM_TIMEOUT_MS'
] as const;

const saved: Record<string, string | undefined> = {};

/**
 * 时叙 × CRM 端到端（E1 本地）：登录即解析会员中心身份，
 * 顾客看到的积分始终来自 CRM；CRM 不可用时明确失败，绝不回退本地 0 分。
 */
describe('时叙顾客接入 CRM', () => {
  let h: Harness;
  let fake: FakeCrm;

  beforeAll(async () => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    fake = await startFakeCrm({ keyId: 'teahour-test', secret: 'test-secret-0123456789' });
    process.env.CRM_ENABLED = '1';
    process.env.CRM_BASE_URL = fake.url;
    process.env.CRM_KEY_ID = 'teahour-test';
    process.env.CRM_SECRET = 'test-secret-0123456789';
    process.env.CRM_TIMEOUT_MS = '800';
    h = await createHarness();
  });

  afterAll(async () => {
    await h?.close();
    await fake?.close();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('登录解析 CRM 会员，积分读取会员中心余额而不是本地字段', async () => {
    const login = await h.api('post', '/customer/session', null, {
      phone: '13900002001',
      name: '接入茶客'
    });
    expect(login.status).toBe(201);
    expect(login.body.customer.points).toBe(0);

    const localUserId = login.body.customer.id as string;
    expect(fake.members.has(localUserId)).toBe(true);
    const sent = JSON.parse(fake.requests[fake.requests.length - 1].body) as Record<string, unknown>;
    expect(sent).toMatchObject({
      localUserId,
      phone: '13900002001',
      name: '接入茶客'
    });

    // 本地 points 故意写成别的值：对外仍必须显示 CRM 余额。
    await h.prisma.customer.update({ where: { id: localUserId }, data: { points: 9999 } });
    fake.members.get(localUserId)!.balance = 260;

    const me = await h.api('get', '/customer/me', login.body.token);
    expect(me.status).toBe(200);
    expect(me.body.customer.points).toBe(260);
  });

  it('CRM 故障时登录返回 503，不静默回退本地积分', async () => {
    fake.failNext = { status: 500, body: { error: 'SERVER_ERROR', message: '内部堆栈' } };
    const res = await h.api('post', '/customer/session', null, {
      phone: '13900002002',
      name: '故障茶客'
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('CRM_UNAVAILABLE');
    expect(res.body.message).not.toMatch(/内部堆栈/);
  });

  it('身份冲突返回 409，且不签发会话', async () => {
    fake.failNext = { status: 409, body: { error: 'CONFLICT', message: 'identity' } };
    const res = await h.api('post', '/customer/session', null, { phone: '13900002003' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('IDENTITY_CONFLICT');
    expect(res.body.token).toBeUndefined();
  });

  it('资料更新后的响应余额同样以 CRM 为准', async () => {
    const login = await h.api('post', '/customer/session', null, {
      phone: '13900002004',
      name: '改资料茶客'
    });
    const id = login.body.customer.id as string;
    fake.members.get(id)!.balance = 42;

    const updated = await h.api('put', '/customer/profile', login.body.token, { gender: 2 });
    expect(updated.status).toBe(200);
    expect(updated.body.customer.gender).toBe(2);
    expect(updated.body.customer.points).toBe(42);
  });

  it('姓名以 CRM 统一账号为准，并写回本地快照', async () => {
    const login = await h.api('post', '/customer/session', null, {
      phone: '13900002005',
      name: '旧名'
    });
    const id = login.body.customer.id as string;
    // 会员中心改名后，小程序「我的」直接显示 CRM 姓名，不需要顾客再设置。
    fake.members.get(id)!.name = '统一姓名';

    const me = await h.api('get', '/customer/me', login.body.token);
    expect(me.status).toBe(200);
    expect(me.body.customer.name).toBe('统一姓名');

    const saved = await h.prisma.customer.findUnique({ where: { id } });
    expect(saved?.name).toBe('统一姓名');
  });

  it('小程序改名与资料回写 CRM，CRM 新版本反向刷新本地快照', async () => {
    const login = await h.api('post', '/customer/session', null, {
      phone: '13900002007',
      name: '改名前'
    });
    const id = login.body.customer.id as string;

    const updated = await h.api('put', '/customer/profile', login.body.token, {
      name: '改名后',
      gender: 2,
      birthday: '1993-07-21'
    });
    expect(updated.status).toBe(200);
    expect(updated.body.customer.name).toBe('改名后');
    expect(fake.members.get(id)).toMatchObject({
      name: '改名后',
      gender: 2,
      birthday: '1993-07-21',
      profileVersion: 1
    });
    const local = await h.prisma.customer.findUnique({ where: { id } });
    expect(local?.crmProfileVersion).toBe(1);

    // 后台在 CRM 改资料：版本号增加后，小程序下次读取按 CRM 为准。
    const member = fake.members.get(id)!;
    member.gender = 1;
    member.birthday = '1990-01-02';
    member.profileVersion += 1;

    const me = await h.api('get', '/customer/me', login.body.token);
    expect(me.status).toBe(200);
    expect(me.body.customer.gender).toBe(1);
    expect(me.body.customer.birthday).toBe('1990-01-02');
    const adopted = await h.prisma.customer.findUnique({ where: { id } });
    expect(adopted?.crmProfileVersion).toBe(2);
  });

  it('CRM 还没有姓名时保留本地名字，不被清空', async () => {
    const login = await h.api('post', '/customer/session', null, {
      phone: '13900002006',
      name: '待取名'
    });
    const id = login.body.customer.id as string;
    fake.members.get(id)!.name = '';

    const me = await h.api('get', '/customer/me', login.body.token);
    expect(me.status).toBe(200);
    expect(me.body.customer.name).toBe('待取名');
  });
});
