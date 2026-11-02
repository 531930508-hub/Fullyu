import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

describe('报损与审批', () => {
  let h: Harness;
  let managerToken: string;
  let financeToken: string;
  let superToken: string;

  const grams = async () => {
    const row = await h.prisma.stock.findUnique({
      where: { storeId_productId: { storeId: 'sh', productId: 'xing-0' } }
    });
    return row?.grams ?? 0;
  };

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
    financeToken = await h.login(ACCOUNTS.finance);
    superToken = await h.login(ACCOUNTS.super);
  });

  afterAll(async () => {
    await h.close();
  });

  it('未达审批线的报损直接生效并扣减库存', async () => {
    const before = await grams();
    const res = await h.api('post', '/store/losses', managerToken, {
      storeId: 'sh',
      productId: 'xing-0',
      qty: 3.5,
      reason: '冲泡损耗'
    });
    expect(res.status).toBe(201);
    expect(res.body.loss.status).toBe('approved');
    expect(res.body.loss.amountCents).toBe(600);
    expect(res.body.loss.unit).toBe('g');
    expect(res.body.loss.approvalId).toBeNull();
    expect(await grams()).toBe(before - 3.5);
  });

  it('超限报损进入待审批，审批前不扣库存', async () => {
    const before = await grams();
    const res = await h.api('post', '/store/losses', managerToken, {
      storeId: 'sh',
      productId: 'xing-0',
      qty: 70,
      reason: '虫害整批报废',
      note: '已封存等待复核'
    });
    expect(res.status).toBe(201);
    expect(res.body.loss.status).toBe('pending');
    expect(res.body.loss.amountCents).toBe(12000);
    expect(res.body.loss.approvalId).toMatch(/^AP-/);
    expect(await grams()).toBe(before);

    const pending = await h.api('get', '/admin/approvals?status=pending', financeToken);
    expect(pending.status).toBe(200);
    const approval = pending.body.approvals.find(
      (x: { id: string }) => x.id === res.body.loss.approvalId
    );
    expect(approval).toMatchObject({
      kind: 'LOSS',
      status: 'pending',
      amountCents: 12000,
      requesterName: '苏禾',
      storeName: '上海·西岸店'
    });
  });

  it('门店店长与审计账号都不能审批报损', async () => {
    const pending = await h.prisma.approval.findFirst({ where: { kind: 'LOSS', status: 'pending' } });
    expect(pending).toBeTruthy();

    const manager = await h.api('post', `/admin/approvals/${pending!.id}/decide`, managerToken, {
      decision: 'approve'
    });
    expect(manager.status).toBe(403);

    const audit = await h.login(ACCOUNTS.audit);
    const readOnly = await h.api('post', `/admin/approvals/${pending!.id}/decide`, audit, {
      decision: 'approve'
    });
    expect(readOnly.status).toBe(403);
  });

  it('财务审批通过后扣减库存，重复审批返回 409', async () => {
    const pending = await h.prisma.approval.findFirst({ where: { kind: 'LOSS', status: 'pending' } });
    const before = await grams();
    const res = await h.api('post', `/admin/approvals/${pending!.id}/decide`, financeToken, {
      decision: 'approve'
    });
    expect(res.status).toBe(201);
    expect(res.body.approval.status).toBe('approved');
    expect(res.body.approval.resultNote).toContain('库存');
    expect(await grams()).toBe(before - 70);

    const again = await h.api('post', `/admin/approvals/${pending!.id}/decide`, financeToken, {
      decision: 'approve'
    });
    expect(again.status).toBe(409);
  });

  it('驳回超限报损不扣库存，并记录驳回原因', async () => {
    const reported = await h.api('post', '/store/losses', managerToken, {
      storeId: 'sh',
      productId: 'xing-0',
      qty: 70,
      reason: '疑似受潮'
    });
    expect(reported.status).toBe(201);
    const before = await grams();

    const rejected = await h.api(
      'post',
      `/admin/approvals/${reported.body.loss.approvalId}/decide`,
      financeToken,
      { decision: 'reject', comment: '盘点复核后再说' }
    );
    expect(rejected.status).toBe(201);
    expect(rejected.body.approval.status).toBe('rejected');
    expect(await grams()).toBe(before);

    const loss = await h.prisma.loss.findUnique({ where: { id: reported.body.loss.id } });
    expect(loss?.status).toBe('rejected');
    expect(loss?.decisionNote).toBe('盘点复核后再说');
  });

  it('报损会校验库存、数量、商品与门店权限', async () => {
    const short = await h.api('post', '/store/losses', managerToken, {
      storeId: 'sh',
      productId: 'bottle',
      qty: 999,
      reason: '破损'
    });
    expect(short.status).toBe(409);
    expect(short.body.message).toContain('库存仅');

    const decimal = await h.api('post', '/store/losses', managerToken, {
      storeId: 'sh',
      productId: 'bottle',
      qty: 1.5,
      reason: '破损'
    });
    expect(decimal.status).toBe(400);
    expect(decimal.body.message).toContain('整数');

    const unknown = await h.api('post', '/store/losses', managerToken, {
      storeId: 'sh',
      productId: 'nope',
      qty: 1,
      reason: '破损'
    });
    expect(unknown.status).toBe(404);

    const otherStore = await h.api('post', '/store/losses', managerToken, {
      storeId: 'bj',
      productId: 'xing-0',
      qty: 1,
      reason: '破损'
    });
    expect(otherStore.status).toBe(403);
  });

  it('门店报损列表与总部汇总一致', async () => {
    const store = await h.api('get', '/store/losses?storeId=sh', managerToken);
    expect(store.status).toBe(200);
    expect(store.body.policy.monthlyRatio).toBe(3);
    expect(store.body.losses.length).toBeGreaterThanOrEqual(3);

    const admin = await h.api('get', '/admin/losses', financeToken);
    expect(admin.status).toBe(200);
    const sh = admin.body.summary.rows.find((row: { storeId: string }) => row.storeId === 'sh');
    expect(sh.amountCents).toBe(12600);
    expect(sh.pendingCents).toBe(0);
    expect(admin.body.summary.totalCents).toBe(12600);

    const counts = await h.api('get', '/admin/approvals', financeToken);
    expect(counts.body.counts.approved).toBeGreaterThanOrEqual(1);
    expect(counts.body.counts.rejected).toBeGreaterThanOrEqual(1);
  });

  it('报损规则只有总部能改，参数越界会被拒绝', async () => {
    const updated = await h.api('put', '/admin/loss-policy', superToken, {
      monthlyRatio: 5,
      approvalThresholdCents: 20000,
      approvers: ['u-zhou']
    });
    expect(updated.status).toBe(200);
    expect(updated.body.policy.monthlyRatio).toBe(5);

    const denied = await h.api('put', '/admin/loss-policy', managerToken, {
      monthlyRatio: 8
    });
    expect(denied.status).toBe(403);

    const invalid = await h.api('put', '/admin/loss-policy', superToken, { monthlyRatio: 101 });
    expect(invalid.status).toBe(400);

    await h.api('put', '/admin/loss-policy', superToken, {
      monthlyRatio: 3,
      approvalThresholdCents: 10000,
      approvers: ['u-zhou', 'u-lin']
    });
  });

  it('门店设备状态可查询，店员无设备权限', async () => {
    const res = await h.api('get', '/store/devices', managerToken);
    expect(res.status).toBe(200);
    expect(res.body.devices.printer.mode).toBe('mock');
    expect(res.body.devices.machines).toHaveLength(3);
    expect(res.body.devices.payment.mode).toBe('mock');

    const staff = await h.login(ACCOUNTS.staffSh);
    const denied = await h.api('get', '/store/devices', staff);
    expect(denied.status).toBe(403);
  });
});
