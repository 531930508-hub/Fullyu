import { ACCOUNTS, createHarness, freshOrderBody, type Harness } from '../testing/harness';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('财务流水、运营费用与利润', () => {
  let h: Harness;
  let financeToken: string;
  let managerToken: string;
  let superToken: string;
  let importedTotal = 0;

  beforeAll(async () => {
    h = await createHarness();
    financeToken = await h.login(ACCOUNTS.finance);
    managerToken = await h.login(ACCOUNTS.managerSh);
    superToken = await h.login(ACCOUNTS.super);
  });

  afterAll(async () => {
    await h.close();
  });

  it('财务录入运营费用并计入当日汇总', async () => {
    const res = await h.api('post', '/admin/expenses', financeToken, {
      storeId: 'sh',
      date: today(),
      category: 'rent',
      amount: '1200.50',
      memo: '十月租金'
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.amountCents).toBe(120050);
    expect(res.body.expense.categoryName).toBe('租金');
    expect(res.body.expense.storeName).toBe('上海·西岸店');

    const list = await h.api('get', '/admin/expenses?range=today', financeToken);
    expect(list.status).toBe(200);
    const row = list.body.expenses.find((x: { id: string }) => x.id === res.body.expense.id);
    expect(row).toBeTruthy();
    expect(list.body.summary.totalCents).toBeGreaterThanOrEqual(120050);
  });

  it('作废费用后从列表与汇总中移除', async () => {
    const added = await h.api('post', '/admin/expenses', financeToken, {
      storeId: 'sh',
      date: today(),
      category: 'marketing',
      amount: 66,
      memo: '待作废'
    });
    const voided = await h.api('post', `/admin/expenses/${added.body.expense.id}/void`, financeToken, {});
    expect(voided.status).toBe(201);
    expect(voided.body.expense.voidedAt).toEqual(expect.any(Number));

    const list = await h.api('get', '/admin/expenses?range=today', financeToken);
    expect(list.body.expenses.some((x: { id: string }) => x.id === added.body.expense.id)).toBe(false);

    const withVoided = await h.api('get', '/admin/expenses?range=today&includeVoided=true', financeToken);
    expect(withVoided.body.expenses.some((x: { id: string }) => x.id === added.body.expense.id)).toBe(true);

    const again = await h.api('post', `/admin/expenses/${added.body.expense.id}/void`, financeToken, {});
    expect(again.status).toBe(409);
  });

  it('保留一笔有效费用用于利润核算', async () => {
    const res = await h.api('post', '/admin/expenses', financeToken, {
      storeId: 'sh',
      date: today(),
      category: 'utilities',
      amount: '88.8'
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.amountCents).toBe(8880);

    const missing = await h.api('post', '/admin/expenses', financeToken, {
      storeId: 'sh',
      date: today(),
      category: 'unknown',
      amount: 10
    });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toContain('费用类别');
  });

  it('门店店员不能录入费用，区域财务也不能录入总部费用', async () => {
    const denied = await h.api('post', '/admin/expenses', managerToken, {
      storeId: 'sh',
      date: today(),
      category: 'rent',
      amount: 1
    });
    expect(denied.status).toBe(403);

    const created = await h.api('post', '/admin/staff', superToken, {
      name: '门店财务',
      username: '13900000009',
      password: 'finance2026',
      roleIds: ['r-finance'],
      allStores: false,
      storeIds: ['sh']
    });
    expect(created.status).toBe(201);

    const limited = await h.login('13900000009', 'finance2026');
    const brand = await h.api('post', '/admin/expenses', limited, {
      storeId: 'brand',
      date: today(),
      category: 'hq',
      amount: 100
    });
    expect(brand.status).toBe(403);
    expect(brand.body.message).toContain('总部');
  });

  it('批量导入：预览、提交与重复行跳过', async () => {
    const sample = await h.api('get', '/admin/expenses/sample', financeToken);
    expect(sample.status).toBe(200);
    expect(sample.body.text).toContain('日期,门店,类别,金额,备注');

    const preview = await h.api('post', '/admin/expenses/preview', financeToken, {
      text: sample.body.text
    });
    expect(preview.status).toBe(201);
    expect(preview.body.errors).toHaveLength(0);
    expect(preview.body.rows.length).toBe(16);
    expect(preview.body.storeCount).toBe(4);

    const commit = await h.api('post', '/admin/expenses/import', financeToken, {
      text: sample.body.text
    });
    expect(commit.status).toBe(201);
    expect(commit.body.created).toBe(16);
    expect(commit.body.duplicates).toBe(0);
    importedTotal = commit.body.totalCents;

    const repeat = await h.api('post', '/admin/expenses/import', financeToken, {
      text: sample.body.text
    });
    expect(repeat.status).toBe(409);
    expect(repeat.body.message).toContain('重复');
  });

  it('导入预览会标出无法识别的门店并阻止提交', async () => {
    const text = ['日期,门店,类别,金额,备注', `${today()},火星基地店,租金,10,错误行`].join('\n');
    const preview = await h.api('post', '/admin/expenses/preview', financeToken, { text });
    expect(preview.status).toBe(201);
    expect(preview.body.errors.length).toBeGreaterThan(0);
    expect(preview.body.rows).toHaveLength(0);

    const commit = await h.api('post', '/admin/expenses/import', financeToken, { text });
    expect(commit.status).toBe(422);
  });

  it('门店利润报表纳入销售额、原料成本与运营费用', async () => {
    const customer = await h.customer('报表茶客');
    const order = await h.api('post', '/customer/orders', customer.token, {
      ...freshOrderBody(),
      items: [{ productId: 'xing-0', qty: 2, temp: '热' }]
    });
    expect(order.status).toBe(201);
    expect(order.body.order.totalCents).toBe(4000);

    const profit = await h.api('get', '/admin/profit?range=today', financeToken);
    expect(profit.status).toBe(200);
    expect(profit.body.includesBrand).toBe(true);
    expect(profit.body.rows).toHaveLength(5);

    const sh = profit.body.rows.find((row: { storeId: string }) => row.storeId === 'sh');
    expect(sh.revenueCents).toBe(4000);
    expect(sh.cogsCents).toBe(1200);
    expect(sh.opexCents).toBe(120050 + 8880 + 13300);
    expect(sh.netCents).toBe(4000 - 1200 - (120050 + 8880 + 13300));
    expect(profit.body.totals.revenueCents).toBe(4000);
    expect(profit.body.totals.opexCents).toBe(120050 + 8880 + importedTotal);
  });

  it('经营概览按系列与门店汇总，并能区分总部与门店范围', async () => {
    const overview = await h.api('get', '/admin/overview?range=today', financeToken);
    expect(overview.status).toBe(200);
    expect(overview.body.overview.revenueCents).toBe(4000);
    expect(overview.body.overview.orderCount).toBe(1);
    expect(overview.body.overview.cups).toBe(2);
    const xing = overview.body.overview.bySeries.find((x: { id: string }) => x.id === 'xing');
    expect(xing.qty).toBe(2);
    expect(xing.amountCents).toBe(4000);

    const regionToken = await h.login(ACCOUNTS.region);
    const scoped = await h.api('get', '/admin/overview?range=today', regionToken);
    expect(scoped.status).toBe(200);
    expect(
      scoped.body.overview.byStore.every(
        (row: { storeId: string }) => row.storeId !== 'brand' && ['sh', 'sh-west'].includes(row.storeId)
      )
    ).toBe(true);

    const denied = await h.api('get', '/admin/finance', regionToken);
    expect(denied.status).toBe(403);
  });

  it('多日区间的每日营业额补零到完整天数', async () => {
    const week = await h.api('get', '/admin/overview?range=7', financeToken);
    expect(week.status).toBe(200);
    const days = week.body.overview.daily as Array<{ day: string; gross: number; entries: number }>;
    expect(days).toHaveLength(7);
    expect(days[6].day).toBe(today());
    expect(days[6].gross).toBe(4000);
    expect(days[6].entries).toBeGreaterThan(0);
    // 没有流水的日期保留空柱，且每日合计与区间总额一致。
    expect(days.slice(0, 6).every((row) => row.gross === 0 && row.entries === 0)).toBe(true);
    expect(days.reduce((sum, row) => sum + row.gross, 0)).toBe(week.body.overview.grossCents);
    expect(days.every((row, index) => index === 0 || row.day > days[index - 1].day)).toBe(true);
  });

  it('门店总览串起今日流水、费用、队列与审批计数', async () => {
    const res = await h.api('get', '/store/overview?storeId=sh', managerToken);
    expect(res.status).toBe(200);
    expect(res.body.storeId).toBe('sh');
    expect(res.body.date).toEqual(expect.any(String));
    expect(res.body.finance.grossSalesCents).toBe(4000);
    expect(res.body.opexCents).toBe(120050 + 8880 + 13300);
    expect(res.body.expenses.length).toBe(6);
    expect(res.body.queue.counts).toEqual(
      expect.objectContaining({ pending: expect.any(Number), ready: expect.any(Number), retail: expect.any(Number) })
    );
    expect(res.body.approvals).toEqual(
      expect.objectContaining({ pending: expect.any(Number), approved: expect.any(Number), rejected: expect.any(Number) })
    );

    const logs = await h.api('get', '/store/logs?storeId=sh', managerToken);
    expect(logs.status).toBe(200);
    expect(logs.body.logs.length).toBeGreaterThan(0);
    expect(logs.body.logs.some((x: { action: string }) => x.action === '提交订单')).toBe(true);

    const staffToken = await h.login(ACCOUNTS.staffSh);
    const denied = await h.api('get', '/store/logs?storeId=sh', staffToken);
    expect(denied.status).toBe(403);
  });

  it('只读审计可以查看财务但不能录入费用', async () => {
    const audit = await h.login(ACCOUNTS.audit);
    const list = await h.api('get', '/admin/finance?range=today', audit);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.entries)).toBe(true);

    const denied = await h.api('post', '/admin/expenses', audit, {
      storeId: 'sh',
      date: today(),
      category: 'rent',
      amount: 1
    });
    expect(denied.status).toBe(403);
  });
});
