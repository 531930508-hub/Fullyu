import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

describe('CRM 1E：角色权限维护', () => {
  let h: Harness;
  let admin: string;
  let ops: string;
  let cs: string;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.admin);
    ops = await h.login(ACCOUNTS.ops);
    cs = await h.login(ACCOUNTS.cs);
  });

  afterAll(async () => {
    await h.close();
  });

  it('读取角色与权限点；管理员可改内置角色，但 admin 受保护', async () => {
    const list = await h.api('get', '/roles', admin);
    expect(list.status).toBe(200);
    expect(list.body.roles).toHaveLength(6);
    expect(list.body.permissions.some((p: { code: string }) => p.code === 'crm:config:edit')).toBe(
      true
    );
    const market = list.body.roles.find((role: { id: string }) => role.id === 'crm-market');
    expect(market).toMatchObject({
      name: '市场',
      builtin: true,
      staffCount: 0
    });
    expect(market.description).toContain('会员故事');
    expect(market.perms).toEqual(
      expect.arrayContaining(['crm:member:view', 'crm:card:view', 'crm:feedback:handle'])
    );
    expect(new Date(market.createdAt).toString()).not.toBe('Invalid Date');

    const protectedRole = await h.api('patch', '/roles/crm-admin', admin, {
      perms: ['crm:member:view']
    });
    expect(protectedRole.status).toBe(409);
    expect(protectedRole.body.error).toBe('ROLE_PROTECTED');

    const invalid = await h.api('patch', '/roles/crm-cs', admin, {
      perms: ['crm:nope']
    });
    expect(invalid.status).toBe(400);

    const denied = await h.api('patch', '/roles/crm-cs', cs, {
      perms: ['crm:member:view']
    });
    expect(denied.status).toBe(403);

    const opsRole = list.body.roles.find((role: { id: string }) => role.id === 'crm-ops');
    const nextPerms = opsRole.perms.filter((perm: string) => perm !== 'crm:config:edit');
    const updated = await h.api('patch', '/roles/crm-ops', admin, { perms: nextPerms });
    expect(updated.status).toBe(200);
    expect(updated.body.role.perms).not.toContain('crm:config:edit');

    const blocked = await h.api('get', '/rules', ops);
    expect(blocked.status).toBe(403);

    const audit = await h.api('get', `/audit?action=${encodeURIComponent('角色权限')}`, admin);
    expect(audit.body.logs.length).toBeGreaterThanOrEqual(1);
  });

  it('可新建自定义角色：名称、说明、人员数量与创建时间可读；重复名称与空权限被拒', async () => {
    const created = await h.api('post', '/roles', admin, {
      name: '区域店长',
      description: '查看会员与核销提货券',
      perms: ['crm:member:view', 'crm:voucher:redeem']
    });
    expect(created.status).toBe(201);
    expect(created.body.role).toMatchObject({
      name: '区域店长',
      description: '查看会员与核销提货券',
      builtin: false,
      staffCount: 0,
      perms: ['crm:member:view', 'crm:voucher:redeem']
    });
    expect(created.body.role.id).not.toBe('crm-store');
    expect(new Date(created.body.role.createdAt).toString()).not.toBe('Invalid Date');

    const list = await h.api('get', '/roles', admin);
    const saved = list.body.roles.find((role: { id: string }) => role.id === created.body.role.id);
    expect(saved.name).toBe('区域店长');

    const duplicate = await h.api('post', '/roles', admin, {
      name: '区域店长',
      perms: ['crm:member:view']
    });
    expect(duplicate.status).toBe(409);

    const empty = await h.api('post', '/roles', admin, { name: '空角色', perms: [] });
    expect(empty.status).toBe(400);

    const denied = await h.api('post', '/roles', cs, {
      name: '越权角色',
      perms: ['crm:member:view']
    });
    expect(denied.status).toBe(403);
  });
});
