/**
 * 考勤月报：一个月、一家店、一人一行，给店长月底核对用。
 *
 * 口径与在店看板 / 班表一致，不另起一套：
 * - 实际工时只算「已闭合」的计时时段，未闭合（open / pending_close / lapsed）单独计数提醒；
 * - 缺勤 / 短时沿用班表的 planState，今天不下缺勤结论；
 * - 不出现任何金额：工资在「劳务结算」里按门店单价出单，这一页只核对工时。
 */
import { Injectable } from '@nestjs/common';
import type { PlannedShift, WorkSession } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { assertStoreAccess, type StaffContext } from '../common/auth.types';
import { badRequest, notFound } from '../common/errors';
import { minutesBetween, shanghaiDate } from './attendance.time';
import { addDays, dayCount, planState, type PlanState } from './shift.service';

/** 未闭合状态：这些时段不计工时，但必须在核对时看见。 */
const UNRESOLVED = new Set(['open', 'pending_close', 'lapsed']);

const MONTH_RE = /^(\d{4})-(\d{2})$/;

const pad = (value: number): string => String(value).padStart(2, '0');

/** 「2026-11」→ { from: '2026-11-01', to: '2026-11-30' }；注入日期格式一律不收。 */
export function monthRange(month: string): { from: string; to: string } {
  const matched = MONTH_RE.exec(month);
  if (!matched) throw badRequest('月份格式应为 YYYY-MM');
  const year = Number(matched[1]);
  const monthNo = Number(matched[2]);
  if (year < 2000 || year > 2100 || monthNo < 1 || monthNo > 12) throw badRequest('月份格式应为 YYYY-MM');
  const lastDay = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  return { from: `${year}-${pad(monthNo)}-01`, to: `${year}-${pad(monthNo)}-${pad(lastDay)}` };
}

export type ReportDay = {
  businessDate: string;
  shift: { id: string; startMin: number; endMin: number; note: string } | null;
  plannedMinutes: number;
  actualMinutes: number;
  /** 当天未闭合的时段数：>0 说明这天的工时还没算完 */
  unresolvedCount: number;
  state: PlanState;
};

export type ReportRow = {
  userId: string;
  name: string;
  /** 有实际工时的天数（人天） */
  presentDays: number;
  plannedMinutes: number;
  actualMinutes: number;
  absentDays: number;
  shortDays: number;
  unresolvedCount: number;
  days: ReportDay[];
};

const isClosed = (row: WorkSession): boolean => row.status === 'closed' && row.clockOutAt != null;

@Injectable()
export class AttendanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** 可见门店；与班表同一套口径（allStores 只看营业中的店）。 */
  private async scopeStores(staff: StaffContext) {
    return staff.allStores
      ? this.prisma.store.findMany({ where: { open: true }, orderBy: { name: 'asc' } })
      : this.prisma.store.findMany({ where: { id: { in: staff.storeIds } }, orderBy: { name: 'asc' } });
  }

  async month(staff: StaffContext, input: { storeId?: string; month?: string }) {
    const today = shanghaiDate();
    const month = (input.month || today.slice(0, 7)).trim();
    const { from, to } = monthRange(month);

    const stores = await this.scopeStores(staff);
    if (!stores.length) throw badRequest('没有可查看的门店');
    const store = input.storeId ? stores.find((item) => item.id === input.storeId) : stores[0];
    if (input.storeId && !store) {
      // 用别人的门店 id 来查，转成 403，不能靠 404 猜门店是否存在
      assertStoreAccess(staff, input.storeId);
      throw notFound('门店不存在');
    }
    if (!store) throw badRequest('没有可查看的门店');

    const [people, shifts, sessions] = await Promise.all([
      this.prisma.user.findMany({
        where: { active: true, userStores: { some: { storeId: store.id } } },
        orderBy: { name: 'asc' }
      }),
      this.prisma.plannedShift.findMany({ where: { storeId: store.id, businessDate: { gte: from, lte: to } } }),
      this.prisma.workSession.findMany({
        where: { storeId: store.id, businessDate: { gte: from, lte: to }, status: { not: 'voided' } }
      })
    ]);

    const shiftOf = new Map<string, PlannedShift>(shifts.map((row) => [`${row.userId}|${row.businessDate}`, row]));
    const actualOf = new Map<string, number>();
    const unresolvedOf = new Map<string, number>();
    for (const row of sessions) {
      const key = `${row.userId}|${row.businessDate}`;
      if (isClosed(row)) {
        actualOf.set(key, (actualOf.get(key) ?? 0) + minutesBetween(row.clockInAt, row.clockOutAt!));
      } else if (UNRESOLVED.has(row.status)) {
        unresolvedOf.set(key, (unresolvedOf.get(key) ?? 0) + 1);
      }
    }

    const dayList = Array.from({ length: dayCount(from, to) }, (_, index) => addDays(from, index));

    const buildRow = (userId: string, name: string): ReportRow => {
      const days = dayList.map((businessDate): ReportDay => {
        const shift = shiftOf.get(`${userId}|${businessDate}`) || null;
        const plannedMinutes = shift ? shift.endMin - shift.startMin : 0;
        const actualMinutes = actualOf.get(`${userId}|${businessDate}`) ?? 0;
        return {
          businessDate,
          shift: shift ? { id: shift.id, startMin: shift.startMin, endMin: shift.endMin, note: shift.note } : null,
          plannedMinutes,
          actualMinutes,
          unresolvedCount: unresolvedOf.get(`${userId}|${businessDate}`) ?? 0,
          state: planState({ hasShift: !!shift, date: businessDate, today, plannedMinutes, actualMinutes })
        };
      });
      const sum = (pick: (day: ReportDay) => number) => days.reduce((total, day) => total + pick(day), 0);
      return {
        userId,
        name,
        presentDays: days.filter((day) => day.actualMinutes > 0).length,
        plannedMinutes: sum((day) => day.plannedMinutes),
        actualMinutes: sum((day) => day.actualMinutes),
        absentDays: days.filter((day) => day.state === 'absent').length,
        shortDays: days.filter((day) => day.state === 'short').length,
        unresolvedCount: sum((day) => day.unresolvedCount),
        days
      };
    };

    const rows = people.map((person) => buildRow(person.id, person.name));
    // 本月有班或有工时、但已不在门店员工列表里的人（调店、停用）：漏掉会让工时凭空消失
    const known = new Set(rows.map((row) => row.userId));
    const orphans = [
      ...new Set([...shifts.map((row) => row.userId), ...sessions.map((row) => row.userId)])
    ].filter((userId) => !known.has(userId));
    if (orphans.length) {
      const users = await this.prisma.user.findMany({ where: { id: { in: orphans } } });
      const nameOf = new Map(users.map((user) => [user.id, user.name]));
      for (const userId of orphans) rows.push(buildRow(userId, nameOf.get(userId) || userId));
    }
    rows.sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));

    return {
      storeId: store.id,
      storeName: store.name,
      stores: stores.map((item) => ({ id: item.id, name: item.name })),
      month,
      from,
      to,
      today,
      rows,
      summary: {
        people: rows.filter((row) => row.plannedMinutes > 0 || row.actualMinutes > 0).length,
        presentPeople: rows.filter((row) => row.actualMinutes > 0).length,
        attendanceDays: rows.reduce((total, row) => total + row.presentDays, 0),
        plannedMinutes: rows.reduce((total, row) => total + row.plannedMinutes, 0),
        actualMinutes: rows.reduce((total, row) => total + row.actualMinutes, 0),
        absentDays: rows.reduce((total, row) => total + row.absentDays, 0),
        shortDays: rows.reduce((total, row) => total + row.shortDays, 0),
        unresolvedCount: rows.reduce((total, row) => total + row.unresolvedCount, 0)
      }
    };
  }
}