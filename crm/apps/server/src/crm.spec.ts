import { pointExpireAt } from '@fullyu/crm-shared';
import { ACCOUNTS, createHarness, type Harness } from './testing/harness';

describe('CRM 服务：会员、积分调整与审计', () => {
  let h: Harness;
  let admin: string;
  let ops: string;
  let fin: string;
  let cs: string;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.admin);
    ops = await h.login(ACCOUNTS.ops);
    fin = await h.login(ACCOUNTS.finance);
    cs = await h.login(ACCOUNTS.cs);
  });

  afterAll(async () => {
    await h.close();
  });

  const balanceOf = async (id: string) => (await h.api('get', `/members/${id}`, admin)).body.balance;

  it('积分为期：上海时间 10/31 23:59 与 11/01 00:00 分别落在次年与后年 1 月 1 日', () => {
    expect(pointExpireAt(new Date('2026-10-31T15:59:00Z')).toISOString()).toBe('2026-12-31T16:00:00.000Z');
    expect(pointExpireAt(new Date('2026-10-31T16:00:00Z')).toISOString()).toBe('2027-12-31T16:00:00.000Z');
    expect(pointExpireAt(new Date('2028-02-29T04:00:00Z')).toISOString()).toBe('2028-12-31T16:00:00.000Z');
  });

  it('登录返回身份与权限；密码错误、无令牌均被拒', async () => {
    const me = await h.api('get', '/auth/me', ops);
    expect(me.status).toBe(200);
    expect(me.body.staff.name).toBe('李沐');
    expect(me.body.staff.perms).toContain('crm:adjust:batch');
    expect(me.body.staff.perms).not.toContain('crm:adjust:approve');
    const bad = await h.api('post', '/auth/login', null, { username: ACCOUNTS.ops, password: 'wrong-pass' });
    expect(bad.status).toBe(401);
    const noToken = await h.api('get', '/members', null);
    expect(noToken.status).toBe(401);
  });

  it('会员列表支持姓名/手机号/会员号搜索与业务筛选，并给出余额', async () => {
    const all = await h.api('get', '/members', admin);
    expect(all.status).toBe(200);
    expect(all.body.members).toHaveLength(3);
    const lin = all.body.members.find((m: { memberNo: string }) => m.memberNo === 'FY-2602-008812');
    expect(lin.balance).toBe(500);
    const byPhone = await h.api('get', '/members?q=13900210021', admin);
    expect(byPhone.body.members).toHaveLength(1);
    expect(byPhone.body.members[0].name).toBe('唐果');
    const byBiz = await h.api('get', '/members?business=zc', admin);
    expect(byBiz.body.members.map((m: { name: string }) => m.name)).toEqual(['苏晚']);
  });

  it('会员档案：明文手机号、身份与积分；同人当天重复打开只记一次审计', async () => {
    const action = encodeURIComponent('查看会员档案');
    const before = (await h.api('get', `/audit?action=${action}`, admin)).body.logs.length;
    const res = await h.api('get', '/members/m-lin', admin);
    expect(res.status).toBe(200);
    expect(res.body.member.phone).toBe('13812346620');
    expect(res.body.identities[0].business).toBe('sx');
    expect(res.body.balance).toBe(500);
    expect(res.body.ledger[0].type).toBe('MIGRATE');
    expect(res.body.brandCards).toHaveLength(1);
    expect(res.body.brandCards[0]).toMatchObject({
      productCode: 'FY_ANNUAL',
      state: 'ACTIVE',
      business: 'retreat'
    });
    expect(res.body.game).toMatchObject({ dice: 12, station: 8, pendingPrizes: 0 });
    await h.api('get', '/members/m-lin', admin);
    const after = (await h.api('get', `/audit?action=${action}`, admin)).body.logs.length;
    expect(after - before).toBe(1);
    const missing = await h.api('get', '/members/m-none', admin);
    expect(missing.status).toBe(404);
  });

  it('资料修改：版本落后 409，未来生日 400，成功后版本 +1，财务无编辑权限', async () => {
    const stale = await h.api('patch', '/members/m-su/profile', cs, {
      baseVersion: 1,
      name: '苏晚晚',
      gender: 2,
      birthday: '1991-09-02'
    });
    expect(stale.status).toBe(200);
    const again = await h.api('patch', '/members/m-su/profile', cs, { baseVersion: 1, name: '苏晚' });
    expect(again.status).toBe(409);
    const bad = await h.api('patch', '/members/m-su/profile', cs, {
      baseVersion: 2,
      birthday: '2999-01-01'
    });
    expect(bad.status).toBe(400);
    const detail = await h.api('get', '/members/m-su', cs);
    expect(detail.body.member.profileVersion).toBe(2);
    expect(detail.body.member.name).toBe('苏晚晚');
    const denied = await h.api('patch', '/members/m-su/profile', fin, { baseVersion: 2, name: 'x' });
    expect(denied.status).toBe(403);
  });

  it('客服不能审批，财务不能发起调整', async () => {
    const denied = await h.api('post', '/adjustments/ad-1/approve', cs);
    expect(denied.status).toBe(403);
    const create = await h.api('post', '/adjustments', fin, {
      memberId: 'm-lin',
      points: 10,
      reason: '测试'
    });
    expect(create.status).toBe(403);
  });

  it('单笔 ≤500 直接入账：建批次、写流水，余额与批次合计一致', async () => {
    const before = await balanceOf('m-lin');
    const res = await h.api('post', '/adjustments', ops, {
      memberId: 'm-lin',
      points: 200,
      reason: '活动补发'
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPLIED');
    expect(res.body.balance).toBe(before + 200);
    const detail = await h.api('get', '/members/m-lin', admin);
    expect(detail.body.ledger[0].type).toBe('ADJUST');
    expect(detail.body.ledger[0].balanceAfter).toBe(before + 200);
    const sum = await h.prisma.pointBatch.aggregate({
      where: { memberId: 'm-lin', status: 'ACTIVE' },
      _sum: { remaining: true }
    });
    expect(sum._sum.remaining).toBe(before + 200);
  });

  it('余额不足整单拒绝且不写流水', async () => {
    const ledgerBefore = (await h.api('get', '/members/m-tang', admin)).body.ledger.length;
    const fail = await h.api('post', '/adjustments', ops, {
      memberId: 'm-tang',
      points: -10,
      reason: '测试'
    });
    expect(fail.status).toBe(422);
    const after = await h.api('get', '/members/m-tang', admin);
    expect(after.body.ledger.length).toBe(ledgerBefore);
  });

  it('超过 500 分进入待审批；发起人不能自审；财务审批后入账且只能审批一次', async () => {
    const res = await h.api('post', '/adjustments', ops, {
      memberId: 'm-lin',
      points: 600,
      reason: '大额补发'
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    const id = res.body.request.id;
    const self = await h.api('post', `/adjustments/${id}/approve`, ops);
    expect(self.status).toBe(403);
    const before = await balanceOf('m-lin');
    const ok = await h.api('post', `/adjustments/${id}/approve`, fin, { comment: '同意' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('APPLIED');
    expect(await balanceOf('m-lin')).toBe(before + 600);
    const twice = await h.api('post', `/adjustments/${id}/approve`, fin, { comment: '再试' });
    expect(twice.status).toBe(409);
  });

  it('批量调整：任一余额不足整单 400；审批时复核失败整单不执行且单据仍待审批', async () => {
    const before = await balanceOf('m-lin');
    const bad = await h.api('post', '/adjustments/batch', ops, {
      reason: '批量补发',
      lines: [
        { memberId: 'm-lin', points: 50 },
        { memberId: 'm-tang', points: -10 }
      ]
    });
    expect(bad.status).toBe(400);
    expect(await balanceOf('m-lin')).toBe(before);

    const ok = await h.api('post', '/adjustments/batch', ops, {
      reason: '批量补发',
      lines: [
        { memberId: 'm-lin', points: 50 },
        { memberId: 'm-su', points: -100 }
      ]
    });
    expect(ok.status).toBe(201);
    const id = ok.body.request.id;
    for (const points of [-500, -500, -200]) {
      const drained = await h.api('post', '/adjustments', ops, {
        memberId: 'm-su',
        points,
        reason: '测试前清空'
      });
      expect(drained.status).toBe(201);
    }
    expect(await balanceOf('m-su')).toBe(0);
    const fail = await h.api('post', `/adjustments/${id}/approve`, fin, { comment: '同意' });
    expect([400, 422]).toContain(fail.status);
    const again = await h.api('get', `/adjustments/${id}`, fin);
    expect(again.body.request.status).toBe('PENDING');
    expect(await balanceOf('m-lin')).toBe(before);
  });

  it('相同幂等键重试只入账一次；同键不同内容返回 409', async () => {
    const key = 'adjust:test:1';
    const body = { memberId: 'm-tang', points: 30, reason: '幂等测试' };
    const first = await h.apiWithKey('post', '/adjustments', ops, body, key);
    expect(first.status).toBe(201);
    const second = await h.apiWithKey('post', '/adjustments', ops, body, key);
    expect(second.status).toBe(201);
    expect(second.body.ledgerId).toBe(first.body.ledgerId);
    expect(await balanceOf('m-tang')).toBe(30);
    const conflictRes = await h.apiWithKey('post', '/adjustments', ops, { ...body, points: 40 }, key);
    expect(conflictRes.status).toBe(409);
  });

  it('客服可发起单笔但不能批量；驳回必须填写意见', async () => {
    const batch = await h.api('post', '/adjustments/batch', cs, {
      reason: '批量',
      lines: [{ memberId: 'm-lin', points: 1 }]
    });
    expect(batch.status).toBe(403);
    const created = await h.api('post', '/adjustments', cs, {
      memberId: 'm-lin',
      points: 700,
      reason: '大额'
    });
    const id = created.body.request.id;
    const reject = await h.api('post', `/adjustments/${id}/reject`, fin, { comment: '' });
    expect(reject.status).toBe(400);
    const okReject = await h.api('post', `/adjustments/${id}/reject`, fin, { comment: '依据不足' });
    expect(okReject.status).toBe(201);
    expect(okReject.body.status).toBe('REJECTED');
  });

  it('审计只追加：客服无权查看，财务可按动作与关键词筛选，登录与调整都有留痕', async () => {
    const denied = await h.api('get', '/audit', cs);
    expect(denied.status).toBe(403);
    const logs = await h.api('get', `/audit?q=${encodeURIComponent('积分')}`, fin);
    expect(logs.status).toBe(200);
    expect(logs.body.logs.some((l: { action: string }) => l.action.includes('积分'))).toBe(true);
    const login = await h.api('get', `/audit?action=${encodeURIComponent('登录后台')}`, fin);
    expect(login.body.logs.length).toBeGreaterThanOrEqual(4);
  });

  it('过期批次不计入余额，也不会被扣减', async () => {
    await h.prisma.member.create({
      data: { id: 'm-exp', memberNo: 'FY-TEST-EXP', phone: '13900000001', name: '过期测试' }
    });
    await h.prisma.pointBatch.createMany({
      data: [
        {
          id: 'PB-EXP-OLD',
          memberId: 'm-exp',
          issuerBusiness: 'sx',
          sourceRef: 'test',
          amount: 300,
          remaining: 300,
          status: 'ACTIVE',
          earnedAt: new Date('2024-01-01T00:00:00Z'),
          expireAt: new Date('2025-12-31T16:00:00Z')
        },
        {
          id: 'PB-EXP-NEW',
          memberId: 'm-exp',
          issuerBusiness: 'sx',
          sourceRef: 'test',
          amount: 100,
          remaining: 100,
          status: 'ACTIVE',
          earnedAt: new Date('2026-01-01T00:00:00Z'),
          expireAt: new Date('2027-12-31T16:00:00Z')
        }
      ]
    });
    expect(await balanceOf('m-exp')).toBe(100);

    const res = await h.api('post', '/adjustments', admin, {
      memberId: 'm-exp',
      points: -80,
      reason: '过期批次扣减验证'
    });
    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(20);
    expect((await h.prisma.pointBatch.findUnique({ where: { id: 'PB-EXP-OLD' } }))?.remaining).toBe(300);
    expect((await h.prisma.pointBatch.findUnique({ where: { id: 'PB-EXP-NEW' } }))?.remaining).toBe(20);
  });

  it('扣减按到期最早优先，扣完标记 DEPLETED', async () => {
    await h.prisma.member.create({
      data: { id: 'm-fifo', memberNo: 'FY-TEST-FIFO', phone: '13900000002', name: '先到期测试' }
    });
    await h.prisma.pointBatch.createMany({
      data: [
        {
          id: 'PB-FIFO-B',
          memberId: 'm-fifo',
          issuerBusiness: 'sx',
          sourceRef: 'test',
          amount: 100,
          remaining: 100,
          status: 'ACTIVE',
          earnedAt: new Date('2026-03-01T00:00:00Z'),
          expireAt: new Date('2028-06-30T16:00:00Z')
        },
        {
          id: 'PB-FIFO-A',
          memberId: 'm-fifo',
          issuerBusiness: 'sx',
          sourceRef: 'test',
          amount: 50,
          remaining: 50,
          status: 'ACTIVE',
          earnedAt: new Date('2026-06-01T00:00:00Z'),
          expireAt: new Date('2027-06-30T16:00:00Z')
        }
      ]
    });

    const res = await h.api('post', '/adjustments', admin, {
      memberId: 'm-fifo',
      points: -70,
      reason: '先到期先用验证'
    });
    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(80);
    expect(await h.prisma.pointBatch.findUnique({ where: { id: 'PB-FIFO-A' } })).toMatchObject({
      remaining: 0,
      status: 'DEPLETED'
    });
    expect(await h.prisma.pointBatch.findUnique({ where: { id: 'PB-FIFO-B' } })).toMatchObject({
      remaining: 80,
      status: 'ACTIVE'
    });
  });

  it('积分不变量：余额 = ACTIVE 批次合计 = 最新流水 balance_after', async () => {
    for (const id of ['m-lin', 'm-su', 'm-tang']) {
      const detail = await h.api('get', `/members/${id}`, admin);
      const sum = await h.prisma.pointBatch.aggregate({
        where: { memberId: id, status: 'ACTIVE', expireAt: { gt: new Date() } },
        _sum: { remaining: true }
      });
      expect(detail.body.balance).toBe(sum._sum.remaining || 0);
      expect(detail.body.ledger[0].balanceAfter).toBe(detail.body.balance);
    }
  });

  it('健康检查可用', async () => {
    const res = await h.api('get', '/health', null);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
