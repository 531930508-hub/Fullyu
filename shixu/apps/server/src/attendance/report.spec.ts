import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { shanghaiDate } from './attendance.time';
import { addDays } from './shift.service';
import { monthRange } from './report.service';

type ReportDay = {
  businessDate: string;
  shift: { startMin: number; endMin: number } | null;
  plannedMinutes: number;
  actualMinutes: number;
  unresolvedCount: number;
  state: string;
};

type ReportRow = {
  userId: string;
  name: string;
  presentDays: number;
  plannedMinutes: number;
  actualMinutes: number;
  absentDays: number;
  shortDays: number;
  unresolvedCount: number;
  days: ReportDay[];
};

type Report = {
  month: string;
  from: string;
  to: string;
  rows: ReportRow[];
  summary: {
    people: number;
    presentPeople: number;
    attendanceDays: number;
    plannedMinutes: number;
    actualMinutes: number;
    absentDays: number;
    shortDays: number;
    unresolvedCount: number;
  };
};

describe('考勤月报', () => {
  let h: Harness;
  let managerToken: string;
  let staffToken: string;

  const store = 'sh';
  // 上个月：整月都已经是「往天」，planState 不会因为「今天」不下结论而影响断言
  const month = addDays(`${shanghaiDate().slice(0, 7)}-01`, -1).slice(0, 7);
  const day = (n: number) => `${month}-${String(n).padStart(2, '0')}`;
  const at = (date: string, hour: number) => new Date(Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00+08:00`));

  const getReport = (token: string, query = '') => h.api('get', `/attendance/report${query}`, token);
  const rowOf = (report: Report, userId = 'u-gu') => report.rows.find((row) => row.userId === userId);

  beforeAll(async () => {
    h = await createHarness();
    managerToken = await h.login(ACCOUNTS.managerSh);
    staffToken = await h.login(ACCOUNTS.staffSh);

    // 10 号：排 9 小时、实际 8 小时 → 短时
    await h.prisma.plannedShift.create({
      data: { id: `ps-report-1`, storeId: store, userId: 'u-gu', businessDate: day(10), startMin: 540, endMin: 1080 }
    });
    await h.prisma.workSession.create({
      data: {
        id: 'ws-report-1',
        storeId: store,
        userId: 'u-gu',
        businessDate: day(10),
        clockInAt: at(day(10), 9),
        clockOutAt: at(day(10), 17),
        inLat: 31.176,
        inLng: 121.459,
        status: 'closed'
      }
    });

    // 11 号：只有一段没闭合的计时 → 未闭合计 1，不计工时
    await h.prisma.workSession.create({
      data: {
        id: 'ws-report-open',
        storeId: store,
        userId: 'u-gu',
        businessDate: day(11),
        clockInAt: at(day(11), 9),
        inLat: 31.176,
        inLng: 121.459,
        status: 'open',
        openKey: 'u-gu'
      }
    });

    // 12 号：排了班、没有计时 → 缺勤
    await h.prisma.plannedShift.create({
      data: { id: 'ps-report-2', storeId: store, userId: 'u-gu', businessDate: day(12), startMin: 540, endMin: 1080 }
    });

    // 作废的时段不该出现：既不算工时，也不算未闭合
    await h.prisma.workSession.create({
      data: {
        id: 'ws-report-void',
        storeId: store,
        userId: 'u-gu',
        businessDate: day(13),
        clockInAt: at(day(13), 9),
        clockOutAt: at(day(13), 19),
        inLat: 31.176,
        inLng: 121.459,
        status: 'voided'
      }
    });
  });

  afterAll(async () => {
    await h.close();
  });

  it('月份换算：按日历给出整月，非法月份直接拒', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(() => monthRange('2026-13')).toThrow(/YYYY-MM/);
    expect(() => monthRange('2026-1')).toThrow(/YYYY-MM/);
    expect(() => monthRange('2026/11')).toThrow(/YYYY-MM/);
  });

  it('只有 attendance:view 能读月报，店员不行', async () => {
    expect((await getReport(staffToken)).status).toBe(403);
    const ok = await getReport(managerToken);
    expect(ok.status).toBe(200);
    expect(ok.body.storeId).toBe(store);
  });

  it('汇总按人给出出勤天数、计划/实际、缺勤/短时与未闭合', async () => {
    const res = await getReport(managerToken, `?storeId=${store}&month=${month}`);
    expect(res.status).toBe(200);
    const report = res.body as Report;
    expect(report.month).toBe(month);
    expect(report.from).toBe(`${month}-01`);

    const row = rowOf(report)!;
    expect(row).toBeTruthy();
    expect(row.presentDays).toBe(1);
    expect(row.plannedMinutes).toBe(1080);
    expect(row.actualMinutes).toBe(480);
    expect(row.absentDays).toBe(1);
    expect(row.shortDays).toBe(1);
    // 只有 11 号那段 open；作废的 13 号不算
    expect(row.unresolvedCount).toBe(1);

    const day10 = row.days.find((cell) => cell.businessDate === day(10))!;
    expect(day10.state).toBe('short');
    expect(day10.shift).toMatchObject({ startMin: 540, endMin: 1080 });
    expect(row.days.find((cell) => cell.businessDate === day(11))!.unresolvedCount).toBe(1);
    expect(row.days.find((cell) => cell.businessDate === day(13))!.actualMinutes).toBe(0);

    expect(report.summary).toMatchObject({
      presentPeople: 1,
      attendanceDays: 1,
      plannedMinutes: 1080,
      actualMinutes: 480,
      absentDays: 1,
      shortDays: 1,
      unresolvedCount: 1
    });
  });

  it('月报只核工时，不带金额字段', async () => {
    const res = await getReport(managerToken, `?storeId=${store}&month=${month}`);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('Cents');
    expect(text).not.toContain('amount');
  });

  it('月份格式不对 / 越权门店都拒绝', async () => {
    expect((await getReport(managerToken, `?storeId=${store}&month=2026-13`)).status).toBe(400);
    expect((await getReport(managerToken, `?storeId=${store}&month=${month}-01`)).status).toBe(400);
    const crossed = await getReport(managerToken, `?storeId=hz&month=${month}`);
    expect([403, 404]).toContain(crossed.status);
  });

  it('缺省门店取第一个可见门店，缺省月份取当月', async () => {
    const res = await getReport(managerToken);
    expect(res.status).toBe(200);
    expect(res.body.storeId).toBe(store);
    expect(res.body.month).toBe(shanghaiDate().slice(0, 7));
    expect((res.body as Report).rows.length).toBeGreaterThan(0);
  });
});