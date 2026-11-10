import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

describe('CRM 积分流水：全量查询、筛选与分页', () => {
  let h: Harness;
  let admin: string;
  let ops: string;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.admin);
    ops = await h.login(ACCOUNTS.ops);
  });

  afterAll(async () => {
    await h.close();
  });

  it('返回会员信息、余额、来源与汇总；按时间倒序', async () => {
    const res = await h.api('get', '/points/ledger', admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.summary).toMatchObject({ count: 2, plus: 1700, minus: 0 });
    const row = res.body.rows.find((item: { memberNo: string }) => item.memberNo === 'FY-2602-008812');
    expect(row).toMatchObject({
      memberName: '林小满',
      type: 'MIGRATE',
      delta: 500,
      balanceAfter: 500,
      business: 'sx',
      phone: '13812346620'
    });
  });

  it('按姓名/手机号/会员号搜索会员流水', async () => {
    const byName = await h.api('get', `/points/ledger?q=${encodeURIComponent('苏晚')}`, admin);
    expect(byName.body.total).toBe(1);
    expect(byName.body.rows[0].memberName).toBe('苏晚');
    const byPhone = await h.api('get', '/points/ledger?q=13812346620', admin);
    expect(byPhone.body.total).toBe(1);
    const noLedger = await h.api('get', '/points/ledger?q=13900210021', admin);
    expect(noLedger.body.total).toBe(0);
    expect(noLedger.body.rows).toEqual([]);
  });

  it('按类型、业务、来源单号筛选；未知类型返回 400', async () => {
    const byType = await h.api('get', '/points/ledger?type=CONSUME', admin);
    expect(byType.body.total).toBe(0);
    const byBusiness = await h.api('get', '/points/ledger?business=zc', admin);
    expect(byBusiness.body.total).toBe(1);
    expect(byBusiness.body.rows[0].memberNo).toBe('FY-2607-001204');
    const byRef = await h.api('get', '/points/ledger?ref=seed%3Am-l', admin);
    expect(byRef.body.total).toBe(1);
    const bogus = await h.api('get', '/points/ledger?type=BOGUS', admin);
    expect(bogus.status).toBe(400);
  });

  it('日期边界按上海自然日；非法日期返回 400', async () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    const included = await h.api('get', `/points/ledger?from=${today}&to=${today}`, admin);
    expect(included.body.total).toBe(2);
    const future = await h.api('get', '/points/ledger?from=2099-01-01', admin);
    expect(future.body.total).toBe(0);
    const invalid = await h.api('get', '/points/ledger?from=2026-13-40', admin);
    expect(invalid.status).toBe(400);
  });

  it('分页返回总数而不是当页条数', async () => {
    const page2 = await h.api('get', '/points/ledger?size=1&page=2', admin);
    expect(page2.body.total).toBe(2);
    expect(page2.body.rows).toHaveLength(1);
    expect(page2.body.page).toBe(2);
  });

  it('调整入账后流水带操作人、变动后余额与来源单号', async () => {
    const created = await h.api('post', '/adjustments', ops, {
      memberId: 'm-lin',
      points: 30,
      reason: '流水页联调'
    });
    expect(created.status).toBe(201);
    const res = await h.api('get', `/points/ledger?q=${encodeURIComponent('林小满')}&type=ADJUST`, admin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0]).toMatchObject({
      delta: 30,
      balanceAfter: 530,
      business: 'hq',
      operatorName: '李沐',
      note: '流水页联调'
    });
    expect(res.body.rows[0].ref).toMatch(/^ADJ-/);
  });

  it('无令牌 401；有会员查看权限的门店核销账号可只读', async () => {
    const anonymous = await h.api('get', '/points/ledger');
    expect(anonymous.status).toBe(401);
    const store = await h.login(ACCOUNTS.store);
    const allowed = await h.api('get', '/points/ledger', store);
    expect(allowed.status).toBe(200);
  });
});
