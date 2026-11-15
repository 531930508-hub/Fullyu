import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { monthRange, previousMonth, shanghaiDate } from './attendance.time';

const STORE = 'sh';

type SettlementRow = {
  id: string;
  storeId: string;
  storeName: string;
  userId: string;
  userName: string;
  minutes: number;
  billableMinutes: number;
  hours: number;
  hourlyCents: number;
  baseAmountCents: number;
  adjustmentCents: number;
  amountCents: number;
  unclosedCount: number;
  pendingApprovals: number;
  status: string;
};

describe('劳务单价与月结', () => {
  let h: Harness;
  let superToken: string;
  let financeToken: string;
  let managerToken: string;
  let auditToken: string;

  const month = previousMonth();
  const currentMonth = shanghaiDate().slice(0, 7);

  /** 直接落一段工时：出单只看 businessDate 与分钟数，绕开打卡的实时依赖。 */
  const addSession = async (input: {
    userId?: string;
    date: string;
    hour: number;
    minutes: number;
    status?: 'closed' | 'lapsed' | 'pending_close';
  }) => {
    const inAt = new Date(Date.parse(`${input.date}T${String(input.hour).padStart(2, '0')}:00:00+08:00`));
    const status = input.status ?? 'closed';
    const outAt = status === 'closed' ? new Date(inAt.getTime() + input.minutes * 60_000) : null;
    return h.prisma.workSession.create({
      data: {
        id: `ws-${Math.random().toString(36).slice(2, 12)}`,
        storeId: STORE,
        userId: input.userId ?? 'u-gu',
        businessDate: input.date,
        clockInAt: inAt,
        clockOutAt: outAt,
        inLat: 31.176,
        inLng: 121.459,
        inAccuracyM: 12,
        status,
        pendingApprovalId: status === 'pending_close' ? `ap-${Math.random().toString(36).slice(2, 10)}` : null
      }
    });
  };

  const generate = (token: string, body: Record<string, unknown> = { month }) =>
    h.api('post', '/attendance/settlements/generate', token, body);

  const rowOf = (rows: SettlementRow[], userId = 'u-gu') =>
    rows.find((row) => row.storeId === STORE && row.userId === userId);

  beforeAll(async () => {
    h = await createHarness();
    superToken = await h.login(ACCOUNTS.super);
    financeToken = await h.login(ACCOUNTS.finance);
    managerToken = await h.login(ACCOUNTS.managerSh);
    auditToken = await h.login(ACCOUNTS.audit);
  });

  afterAll(async () => {
    await h.close();
  });

  it('门店劳务单价默认 220，只有 attendance:settle 能读', async () => {
    expect((await h.api('get', '/attendance/labor-rates', managerToken)).status).toBe(403);
    expect((await h.api('get', '/attendance/labor-rates', auditToken)).status).toBe(403);

    const res = await h.api('get', '/attendance/labor-rates', financeToken);
    expect(res.status).toBe(200);
    const sh = res.body.rows.find((row: { storeId: string }) => row.storeId === STORE);
    expect(sh.laborRatePerMinCents).toBe(220);
    expect(sh.hourlyCents).toBe(220 * 60);
  });

  it('门店劳务单价可改，非法值一律 400', async () => {
    const ok = await h.api('put', `/attendance/labor-rates/${STORE}`, financeToken, {
      laborRatePerMinCents: 100,
      note: '按 6000/月 折算'
    });
    expect(ok.status).toBe(200);
    expect(ok.body.laborRatePerMinCents).toBe(100);

    expect((await h.api('put', `/attendance/labor-rates/${STORE}`, financeToken, {})).status).toBe(400);
    expect(
      (await h.api('put', `/attendance/labor-rates/${STORE}`, financeToken, { laborRatePerMinCents: -1 }))
        .status
    ).toBe(400);
    expect(
      (await h.api('put', `/attendance/labor-rates/${STORE}`, financeToken, { laborRatePerMinCents: 100.5 }))
        .status
    ).toBe(400);
    expect(
      (await h.api('put', `/attendance/labor-rates/${STORE}`, financeToken, { laborRatePerMinCents: 10_001 }))
        .status
    ).toBe(400);
    expect(
      (await h.api('put', '/attendance/labor-rates/nowhere', financeToken, { laborRatePerMinCents: 100 }))
        .status
    ).toBe(404);

    // 店长能看本店在店看板，但没有结算权限，不能改工资单价
    expect(
      (await h.api('put', `/attendance/labor-rates/${STORE}`, managerToken, { laborRatePerMinCents: 200 }))
        .status
    ).toBe(403);
  });

  it('出单金额 = 门店单价 × 实际工时，按小时向下取整', async () => {
    // 190 + 250 = 440 分钟 → 取整 7 小时 = 420 分钟；单价 100 分/分钟 → 42,000 分
    await addSession({ date: `${month}-03`, hour: 9, minutes: 190 });
    await addSession({ date: `${month}-05`, hour: 9, minutes: 250 });

    const res = await generate(financeToken);
    expect(res.status).toBe(201);
    expect(res.body.month).toBe(month);
    const row = rowOf(res.body.rows as SettlementRow[])!;
    expect(row).toBeTruthy();
    expect(row.minutes).toBe(440);
    expect(row.billableMinutes).toBe(420);
    expect(row.hours).toBe(7);
    expect(row.baseAmountCents).toBe(42_000);
    expect(row.amountCents).toBe(42_000);
    expect(row.status).toBe('draft');
    expect(res.body.summary.baseAmountCents).toBeGreaterThanOrEqual(42_000);
  });

  it('重复出单幂等：草稿重算、不重复建行', async () => {
    const again = await generate(financeToken);
    expect(again.status).toBe(201);
    expect(again.body.updated).toBeGreaterThanOrEqual(1);
    const row = rowOf(again.body.rows as SettlementRow[])!;
    expect(
      await h.prisma.workSettlement.count({
        where: { storeId: STORE, userId: 'u-gu', periodStart: `${month}-01` }
      })
    ).toBe(1);

    // 再来一段工时：草稿应跟着变，而不是新建第二张
    await addSession({ date: `${month}-08`, hour: 9, minutes: 60 });
    const third = await generate(financeToken);
    const updated = rowOf(third.body.rows as SettlementRow[])!;
    expect(updated.id).toBe(row.id);
    expect(updated.minutes).toBe(500);
    expect(updated.baseAmountCents).toBe(8 * 60 * 100);
  });

  it('未闭合时段硬阻断确认，补齐后才能入账；调整额必须写备注', async () => {
    const lapsed = await addSession({ date: `${month}-10`, hour: 18, minutes: 0, status: 'lapsed' });
    const drafted = await generate(financeToken);
    const row = rowOf(drafted.body.rows as SettlementRow[])!;
    expect(row.unclosedCount).toBe(1);

    const blocked = await h.api('post', `/attendance/settlements/${row.id}/confirm`, financeToken, {});
    expect(blocked.status).toBe(409);
    expect(String(blocked.body.message)).toContain('未闭合');

    await h.prisma.workSession.update({ where: { id: lapsed.id }, data: { status: 'voided' } });

    const noNote = await h.api('post', `/attendance/settlements/${row.id}/confirm`, financeToken, {
      adjustmentCents: 5_000
    });
    expect(noNote.status).toBe(400);
    expect(String(noNote.body.message)).toContain('备注');

    const tooMuch = await h.api('post', `/attendance/settlements/${row.id}/confirm`, financeToken, {
      adjustmentCents: 1_000_001,
      adjustmentNote: '离谱'
    });
    expect(tooMuch.status).toBe(400);

    const ok = await h.api('post', `/attendance/settlements/${row.id}/confirm`, financeToken, {
      adjustmentCents: 5_000,
      adjustmentNote: '补齐忘打的一次离店',
      note: '本期确认'
    });
    expect(ok.status).toBe(201);
    expect(ok.body.settlement.status).toBe('posted');
    expect(ok.body.settlement.baseAmountCents).toBe(8 * 60 * 100);
    expect(ok.body.settlement.adjustmentCents).toBe(5_000);
    expect(ok.body.settlement.amountCents).toBe(8 * 60 * 100 + 5_000);

    const expense = await h.prisma.expense.findUniqueOrThrow({ where: { id: ok.body.expenseId } });
    expect(expense.storeId).toBe(STORE);
    expect(expense.category).toBe('labor');
    expect(expense.source).toBe('settlement');
    expect(expense.sourceKey).toBe(`settlement:${row.id}`);
    expect(expense.amountCents).toBe(8 * 60 * 100 + 5_000);

    expect((await h.api('post', `/attendance/settlements/${row.id}/confirm`, financeToken, {})).status).toBe(
      409
    );
  });

  it('已入账的结算单不参与重算', async () => {
    const res = await generate(financeToken);
    expect(res.status).toBe(201);
    expect(res.body.skipped).toBeGreaterThanOrEqual(1);
    const posted = await h.prisma.workSettlement.findFirstOrThrow({
      where: { storeId: STORE, userId: 'u-gu', periodStart: `${month}-01` }
    });
    expect(posted.status).toBe('posted');
    expect(posted.amountCents).toBe(8 * 60 * 100 + 5_000);
  });

  it('周期未结束不能入账；周期格式错误 400', async () => {
    await addSession({ date: shanghaiDate(), hour: 8, minutes: 90 });
    const current = await generate(financeToken, { month: currentMonth });
    expect(current.status).toBe(201);
    const row = rowOf(current.body.rows as SettlementRow[])!;
    expect(row.minutes).toBe(90);

    const blocked = await h.api('post', `/attendance/settlements/${row.id}/confirm`, financeToken, {});
    expect(blocked.status).toBe(400);
    expect(String(blocked.body.message)).toContain('尚未结束');

    expect((await generate(financeToken, { month: '2026-13' })).status).toBe(400);
    expect((await generate(financeToken, { month: 'next' })).status).toBe(400);
  });

  it('结算列表按可见门店过滤，店长无结算权限看不到金额', async () => {
    expect((await h.api('get', `/attendance/settlements?month=${month}`, managerToken)).status).toBe(403);

    const res = await h.api('get', `/attendance/settlements?month=${month}`, superToken);
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(month);
    expect(res.body.rows.every((row: SettlementRow) => Boolean(row.storeName))).toBe(true);
    const row = rowOf(res.body.rows as SettlementRow[])!;
    expect(row.hours).toBe(8);
    expect(row.hourlyCents).toBe(6_000);
    const period = monthRange(month);
    expect(res.body.periodStart).toBe(period.start);
    expect(res.body.periodEnd).toBe(period.end);
  });

  it('补签审批中的段同样阻断入账', async () => {
    await addSession({ userId: 'u-su', date: `${month}-12`, hour: 9, minutes: 120, status: 'pending_close' });
    const res = await generate(financeToken);
    const target = rowOf(res.body.rows as SettlementRow[], 'u-su')!;
    expect(target.pendingApprovals).toBe(1);
    expect(target.unclosedCount).toBe(1);

    const blocked = await h.api('post', `/attendance/settlements/${target.id}/confirm`, financeToken, {});
    expect(blocked.status).toBe(409);
    expect(String(blocked.body.message)).toContain('未闭合');
  });

  it('确认时拒绝负金额调整', async () => {
    await h.prisma.workSession.deleteMany({ where: { storeId: STORE, userId: 'u-su' } });
    await addSession({ userId: 'u-su', date: `${month}-13`, hour: 9, minutes: 120 });
    const res = await generate(financeToken);
    const target = rowOf(res.body.rows as SettlementRow[], 'u-su')!;
    const negative = await h.api('post', `/attendance/settlements/${target.id}/confirm`, financeToken, {
      adjustmentCents: -(target.baseAmountCents + 100),
      adjustmentNote: '扣到负数'
    });
    expect(negative.status).toBe(400);
    expect(String(negative.body.message)).toContain('不能为负');

    const ok = await h.api('post', `/attendance/settlements/${target.id}/confirm`, financeToken, {
      adjustmentCents: -1_000,
      adjustmentNote: '迟到扣款'
    });
    expect(ok.status).toBe(201);
    expect(ok.body.settlement.amountCents).toBe(2 * 60 * 100 - 1_000);
  });
});