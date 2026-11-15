import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { shanghaiDate } from './attendance.time';
import { addDays, dayCount, planState, weekStartOf } from './shift.service';

type ShiftCell = {
  businessDate: string;
  shift: { id: string; startMin: number; endMin: number; note: string } | null;
  plannedMinutes: number;
  actualMinutes: number;
  state: string;
};

type ShiftMatrix = {
  storeId: string;
  from: string;
  to: string;
  days: string[];
  rows: Array<{ userId: string; name: string; cells: ShiftCell[]; plannedMinutes: number }>;
  summary: { people: number; plannedMinutes: number; absentDays: number };
};

describe('排班（轻班表）', () => {
  let h: Harness;
  let managerToken: string;
  let staffToken: string;
  let auditToken: string;

  const store = 'sh';
  const today = shanghaiDate();
  const weekStart = weekStartOf(today);
  const day1 = weekStart;
  const day2 = addDays(weekStart, 1);

  const saveShift = (token: string, body: Record<string, unknown>) =>
    h.api('put', '/attendance/shifts', token, body);
  const listShifts = (token: string, query = '') =>
    h.api('get', `/attendance/shifts${query}`, token);
  const deleteShift = (token: string, query: string) =>
    h.api('delete', `/attendance/shifts${query}`, token);

  const rowOf = (matrix: ShiftMatrix, userId = 'u-gu') => matrix.rows.find((row) => row.userId === userId);

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
    staffToken = await h.login(ACCOUNTS.staffSh);
    auditToken = await h.login(ACCOUNTS.audit);
  });

  afterAll(async () => {
    await h.close();
  });

  it('日期工具：周一为周首，两周相差 14 天', () => {
    expect(weekStartOf('2026-11-11')).toBe('2026-11-09');
    // 周一自己仍是周首，不能减 7 天
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09');
    // 周日属于前一个周一
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09');
    expect(dayCount(weekStart, addDays(weekStart, 6))).toBe(7);
    expect(dayCount(weekStart, weekStart)).toBe(1);
  });

  it('计划 vs 实际：今天不下缺勤结论，往天按 30 分钟宽限判 done/short', () => {
    const base = { hasShift: true, plannedMinutes: 480 };
    expect(planState({ ...base, date: '2026-11-10', today: '2026-11-09', actualMinutes: 0 })).toBe('planned');
    expect(planState({ ...base, date: '2026-11-09', today: '2026-11-09', actualMinutes: 0 })).toBe('planned');
    expect(planState({ ...base, date: '2026-11-09', today: '2026-11-09', actualMinutes: 120 })).toBe('done');
    expect(planState({ ...base, date: '2026-11-08', today: '2026-11-09', actualMinutes: 0 })).toBe('absent');
    expect(planState({ ...base, date: '2026-11-08', today: '2026-11-09', actualMinutes: 460 })).toBe('done');
    expect(planState({ ...base, date: '2026-11-08', today: '2026-11-09', actualMinutes: 300 })).toBe('short');
    expect(planState({ ...base, hasShift: false, date: '2026-11-08', today: '2026-11-09', actualMinutes: 0 })).toBe('none');
  });

  it('只有 attendance:view 能读，attendance:manage 才能排；店员读不到', async () => {
    expect((await listShifts(staffToken)).status).toBe(403);
    const ok = await listShifts(managerToken);
    expect(ok.status).toBe(200);
    expect(ok.body.storeId).toBe(store);
    expect(ok.body.days.length).toBe(7);
    expect(ok.body.from).toBe(weekStart);

    expect((await listShifts(auditToken)).status).toBe(200);
    expect(
      (await saveShift(auditToken, { storeId: store, userId: 'u-gu', businessDate: day1, startMin: 540, endMin: 1080 }))
        .status
    ).toBe(403);
    expect(
      (await saveShift(managerToken, { storeId: store, userId: 'u-gu', businessDate: day1, startMin: 540, endMin: 1080 }))
        .status
    ).toBe(200);
  });

  it('矩阵里能读到刚排的班，同一格重复提交是覆盖而不是新增', async () => {
    const first = await listShifts(managerToken, `?storeId=${store}`);
    const cell = rowOf(first.body as ShiftMatrix)!.cells.find((item) => item.businessDate === day1)!;
    expect(cell.shift).toMatchObject({ startMin: 540, endMin: 1080 });
    expect(cell.plannedMinutes).toBe(540);

    const overwrite = await saveShift(managerToken, {
      storeId: store,
      userId: 'u-gu',
      businessDate: day1,
      startMin: 600,
      endMin: 1020,
      note: '上午盘点晚到'
    });
    expect(overwrite.status).toBe(200);
    expect(overwrite.body.plannedMinutes).toBe(420);

    const rows = await h.prisma.plannedShift.findMany({
      where: { storeId: store, userId: 'u-gu', businessDate: day1 }
    });
    expect(rows.length).toBe(1);
    expect(rows[0].note).toBe('上午盘点晚到');

    const second = await listShifts(managerToken, `?storeId=${store}`);
    const again = rowOf(second.body as ShiftMatrix)!.cells.find((item) => item.businessDate === day1)!;
    expect(again.shift).toMatchObject({ startMin: 600, endMin: 1020 });
  });

  it('非法班次一律 400：倒挂、越界、非本店员工、跨零点', async () => {
    const base = { storeId: store, userId: 'u-gu', businessDate: day2, startMin: 600, endMin: 1080 };
    expect((await saveShift(managerToken, { ...base, endMin: 600 })).status).toBe(400);
    expect((await saveShift(managerToken, { ...base, startMin: -1 })).status).toBe(400);
    expect((await saveShift(managerToken, { ...base, endMin: 1441 })).status).toBe(400);
    // 晚上 22 点排到次日 6 点：跨零点要拆两天，直接拒
    expect((await saveShift(managerToken, { ...base, startMin: 1320, endMin: 360 })).status).toBe(400);
    expect((await saveShift(managerToken, { ...base, businessDate: '2026/11/09' })).status).toBe(400);
    expect((await saveShift(managerToken, { ...base, businessDate: addDays(today, 93) })).status).toBe(400);
    expect((await saveShift(managerToken, { ...base, businessDate: addDays(today, -32) })).status).toBe(400);
    // 别的店的人不能排到本店
    expect((await saveShift(managerToken, { ...base, userId: 'u-xu' })).status).toBe(400);
  });

  it('一次最多看 31 天', async () => {
    const from = addDays(today, -2);
    expect((await listShifts(managerToken, `?from=${from}&to=${addDays(from, 32)}`)).status).toBe(400);
    expect((await listShifts(managerToken, `?from=${from}&to=${from}`)).status).toBe(200);
  });

  it('清空某天的班：按业务键删，再删 404', async () => {
    expect((await deleteShift(managerToken, `?storeId=${store}&userId=u-gu&businessDate=${day1}`)).status).toBe(200);
    const matrix = await listShifts(managerToken, `?storeId=${store}`);
    const cell = rowOf(matrix.body as ShiftMatrix)!.cells.find((item) => item.businessDate === day1)!;
    expect(cell.shift).toBeNull();
    expect((await deleteShift(managerToken, `?storeId=${store}&userId=u-gu&businessDate=${day1}`)).status).toBe(404);
  });

  it('看板把「排了班却没打卡」的人带出来，且不计入工时', async () => {
    const past = addDays(today, -3);
    await saveShift(managerToken, { storeId: store, userId: 'u-gu', businessDate: past, startMin: 540, endMin: 1080 });

    const board = await h.api('get', `/attendance/board?storeId=${store}&date=${past}`, managerToken);
    expect(board.status).toBe(200);
    const row = (board.body.rows as Array<{ userId: string; plannedMinutes: number; minutes: number }>).find(
      (item) => item.userId === 'u-gu'
    )!;
    expect(row).toBeTruthy();
    expect(row.plannedMinutes).toBe(540);
    expect(row.minutes).toBe(0);
    expect(board.body.summary.plannedMinutes).toBe(540);
    expect((board.body.notClocked as Array<{ userId: string }>).some((item) => item.userId === 'u-gu')).toBe(true);

    // 那天补上一段真实工时后，就不再算「没来」
    const inAt = new Date(Date.parse(`${past}T10:00:00+08:00`));
    await h.prisma.workSession.create({
      data: {
        id: `ws-shift-${Math.random().toString(36).slice(2, 10)}`,
        storeId: store,
        userId: 'u-gu',
        businessDate: past,
        clockInAt: inAt,
        clockOutAt: new Date(inAt.getTime() + 300 * 60_000),
        inLat: 31.176,
        inLng: 121.459,
        inAccuracyM: 10,
        status: 'closed'
      }
    });
    const after = await h.api('get', `/attendance/board?storeId=${store}&date=${past}`, managerToken);
    expect((after.body.notClocked as Array<{ userId: string }>).some((item) => item.userId === 'u-gu')).toBe(false);
  });

  it('店员打卡页能看到今天的计划班次', async () => {
    await saveShift(managerToken, { storeId: store, userId: 'u-gu', businessDate: today, startMin: 600, endMin: 1140 });
    const mine = await h.api('get', `/attendance/mine?storeId=${store}`, staffToken);
    expect(mine.status).toBe(200);
    expect(mine.body.shift).toMatchObject({ storeId: store, startMin: 600, endMin: 1140 });
  });
});