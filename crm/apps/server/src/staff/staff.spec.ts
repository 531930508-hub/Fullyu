import { ACCOUNTS, PASSWORD, createHarness, type Harness } from '../testing/harness';

type StaffView = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  roles: { id: string; name: string }[];
  createdAt: string;
};

describe('CRM 1F：后台用户与角色管理', () => {
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

  const findStaff = async (token: string, username: string): Promise<StaffView> => {
    const list = await h.api('get', '/staff', token);
    return list.body.staff.find((row: StaffView) => row.username === username);
  };

  it('管理员可读用户列表；没有用户管理权限的角色被拒', async () => {
    const list = await h.api('get', '/staff', admin);
    expect(list.status).toBe(200);
    expect(list.body.staff).toHaveLength(5);
    expect(list.body.staff[0]).toMatchObject({
      name: '周岚',
      username: ACCOUNTS.admin,
      active: true
    });
    expect(list.body.staff[0].roles[0].name).toBe('CRM 管理员');
    expect(new Date(list.body.staff[0].createdAt).toString()).not.toBe('Invalid Date');

    expect((await h.api('get', '/staff', ops)).status).toBe(403);
    expect((await h.api('get', '/staff', cs)).status).toBe(403);
  });

  it('新增用户：校验重复账号与弱密码；新账号可按角色权限登录', async () => {
    const created = await h.api('post', '/staff', admin, {
      name: '李明',
      username: ' liming ',
      password: 'liming-2026',
      roleIds: ['crm-cs']
    });
    expect(created.status).toBe(201);
    expect(created.body.staff).toMatchObject({
      name: '李明',
      username: 'liming',
      active: true,
      roles: [{ id: 'crm-cs', name: '客服' }]
    });

    const duplicate = await h.api('post', '/staff', admin, {
      name: '另一个李明',
      username: 'liming',
      password: 'liming-2026',
      roleIds: ['crm-cs']
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe('STAFF_USERNAME_EXISTS');

    const weak = await h.api('post', '/staff', admin, {
      name: '短密码',
      username: 'shortpass',
      password: '1234567',
      roleIds: ['crm-cs']
    });
    expect(weak.status).toBe(400);

    const noRole = await h.api('post', '/staff', admin, {
      name: '无角色',
      username: 'norole',
      password: 'norole-2026',
      roleIds: []
    });
    expect(noRole.status).toBe(400);

    const unknownRole = await h.api('post', '/staff', admin, {
      name: '错角色',
      username: 'badrole',
      password: 'badrole-2026',
      roleIds: ['crm-nope']
    });
    expect(unknownRole.status).toBe(400);

    const denied = await h.api('post', '/staff', ops, {
      name: '越权',
      username: 'hacker',
      password: 'hacker-2026',
      roleIds: ['crm-admin']
    });
    expect(denied.status).toBe(403);

    const token = await h.login('liming', 'liming-2026');
    expect((await h.api('get', '/members', token)).status).toBe(200);
    expect((await h.api('get', '/rules', token)).status).toBe(403);

    const audit = await h.api('get', `/audit?action=${encodeURIComponent('新增用户')}`, admin);
    expect(audit.body.logs.length).toBeGreaterThanOrEqual(1);
  });

  it('保护：不能停用自己、不能移除自己的管理员角色、必须保留一名启用管理员', async () => {
    const created = await h.api('post', '/staff', admin, {
      name: '值班管理员',
      username: 'admin2',
      password: 'admin2-2026',
      roleIds: ['crm-admin']
    });
    expect(created.status).toBe(201);
    const admin2Id = created.body.staff.id as string;
    const admin2 = await h.login('admin2', 'admin2-2026');

    const selfOff = await h.api('patch', `/staff/${admin2Id}`, admin2, { active: false });
    expect(selfOff.status).toBe(409);
    expect(selfOff.body.error).toBe('STAFF_SELF_DEACTIVATE');

    const selfDemote = await h.api('patch', `/staff/${admin2Id}`, admin2, { roleIds: ['crm-cs'] });
    expect(selfDemote.status).toBe(409);
    expect(selfDemote.body.error).toBe('STAFF_SELF_DEMOTE');

    // 建一个只有用户管理权限的角色，用它验证「最后一名管理员」保护。
    const hrRole = await h.api('post', '/roles', admin, {
      name: '人事',
      description: '维护后台账号',
      perms: ['crm:staff:edit']
    });
    expect(hrRole.status).toBe(201);
    await h.api('post', '/staff', admin, {
      name: '人事小王',
      username: 'hr01',
      password: 'hr01-pass-2026',
      roleIds: [hrRole.body.role.id]
    });
    const hr = await h.login('hr01', 'hr01-pass-2026');

    // 人事只读角色列表（用户表单需要），但不能改角色。
    expect((await h.api('get', '/roles', hr)).status).toBe(200);
    expect(
      (await h.api('patch', '/roles/crm-cs', hr, { perms: ['crm:member:view'] })).status
    ).toBe(403);

    const deactivateAdmin2 = await h.api('patch', `/staff/${admin2Id}`, admin, { active: false });
    expect(deactivateAdmin2.status).toBe(200);
    expect((await h.api('get', '/members', admin2)).status).toBe(401);

    const adminRow = await findStaff(admin, ACCOUNTS.admin);
    const lastAdmin = await h.api('patch', `/staff/${adminRow.id}`, hr, { active: false });
    expect(lastAdmin.status).toBe(409);
    expect(lastAdmin.body.error).toBe('LAST_ADMIN');
  });

  it('重置密码递增 tokenVersion，旧会话立即失效', async () => {
    const created = await h.api('post', '/staff', admin, {
      name: '临时账号',
      username: 'temp',
      password: 'temp-pass-2026',
      roleIds: ['crm-cs']
    });
    const tempId = created.body.staff.id as string;
    const oldToken = await h.login('temp', 'temp-pass-2026');
    expect((await h.api('get', '/members', oldToken)).status).toBe(200);

    const tooShort = await h.api('post', `/staff/${tempId}/password`, admin, { password: 'short' });
    expect(tooShort.status).toBe(400);

    const reset = await h.api('post', `/staff/${tempId}/password`, admin, {
      password: 'temp-pass-2027'
    });
    expect(reset.status).toBe(201);
    expect((await h.api('get', '/members', oldToken)).status).toBe(401);

    await expect(h.login('temp', 'temp-pass-2026')).rejects.toThrow();
    const fresh = await h.login('temp', 'temp-pass-2027');
    expect((await h.api('get', '/members', fresh)).status).toBe(200);

    const audit = await h.api('get', `/audit?action=${encodeURIComponent('重置密码')}`, admin);
    expect(audit.body.logs.length).toBeGreaterThanOrEqual(1);
  });

  it('角色删除：内置受保护、有用户时拒绝、改派后可删', async () => {
    const role = await h.api('post', '/roles', admin, {
      name: '要删的角色',
      perms: ['crm:member:view']
    });
    const roleId = role.body.role.id as string;

    await h.api('post', '/staff', admin, {
      name: '占位账号',
      username: 'holder',
      password: 'holder-2026',
      roleIds: [roleId]
    });
    const inUse = await h.api('delete', `/roles/${roleId}`, admin);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error).toBe('ROLE_IN_USE');

    const builtin = await h.api('delete', '/roles/crm-market', admin);
    expect(builtin.status).toBe(409);
    expect(builtin.body.error).toBe('ROLE_PROTECTED');

    const denied = await h.api('delete', `/roles/${roleId}`, cs);
    expect(denied.status).toBe(403);

    const holder = await findStaff(admin, 'holder');
    await h.api('patch', `/staff/${holder.id}`, admin, { roleIds: ['crm-cs'] });
    const removed = await h.api('delete', `/roles/${roleId}`, admin);
    expect(removed.status).toBe(200);
    const list = await h.api('get', '/roles', admin);
    expect(list.body.roles.some((item: { id: string }) => item.id === roleId)).toBe(false);
  });

  it('停用与改派在审计日志留痕', async () => {
    const holder = await findStaff(admin, 'holder');
    expect(holder.roles[0].id).toBe('crm-cs');
    const logs = await h.api('get', '/audit', admin);
    expect(
      logs.body.logs.some((row: { action: string }) => row.action === '修改用户')
    ).toBe(true);
  });
});