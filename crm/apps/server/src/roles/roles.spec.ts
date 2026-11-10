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
    expect(list.body.roles).toHaveLength(5);
    expect(list.body.permissions.some((p: { code: string }) => p.code === 'crm:config:edit')).toBe(
      true
    );

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
});
