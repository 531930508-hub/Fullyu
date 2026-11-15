/**
 * 轻排班（班表）。
 *
 * 范围刻意收得很窄：按人按日填一段计划时段，星期视图里一格一格改。
 * - 不做模板 / 批量复制 / 调班审批：改错了再改一次，改动本身进操作日志；
 * - 不做跨店冲突检测：一个人同一天在两家店各排一段是真实场景（上午 A 店、下午 B 店）；
 * - 班次不参与打卡校验：提前到、晚走、临时来帮忙都要能正常记工时，
 *   缺勤/短时只在看板上提示，不阻断任何动作，也不进工资计算（工资只认实际工时）。
 */
import { Injectable } from '@nestjs/common';
import type { PlannedShift, WorkSession } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { assertStoreAccess, type StaffContext } from '../common/auth.types';
import { badRequest, notFound } from '../common/errors';
import { logAction } from '../common/logs';
import { newId } from '../common/ids';
import { minutesBetween, shanghaiDate } from './attendance.time';

/** 一次最多看 31 天（一个月），周视图 7 天是常态，月视图给月底核对用。 */
export const MAX_RANGE_DAYS = 31;
/** 往前可改 31 天：补记「昨天谁请假」有用，再往前翻没有意义。 */
export const PAST_EDIT_DAYS = 31;
/** 往后可排 92 天：一个季度够用，防止手抖排到明年的某一天。 */
export const FUTURE_EDIT_DAYS = 92;

export type PlanState = 'none' | 'planned' | 'done' | 'short' | 'absent';

export type ShiftCell = {
  businessDate: string;
  /** 这一天没有任何计划时为 null */
  shift: { id: string; startMin: number; endMin: number; note: string } | null;
  plannedMinutes: number;
  /** 当天已计入的实际工时（只算已闭合的时段） */
  actualMinutes: number;
  state: PlanState;
};

export type ShiftRow = {
  userId: string;
  name: string;
  /** 该员工在范围内没有在岗关系时（调店/离职）也要能显示，故与「门店员工」分开判断 */
  cells: ShiftCell[];
  plannedMinutes: number;
  actualMinutes: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (value: number): string => String(value).padStart(2, '0');

/** 日期字符串按 UTC 运算：班表的日期是「哪一天」，不涉及时刻，不受服务器时区影响。 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map((part) => Number(part));
  const next = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** 周一为一周的第一天：门店按周排班，周日单独一天不算「下周」。 */
export function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map((part) => Number(part));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = 周日
  return addDays(date, -((dow + 6) % 7));
}

/** 含首尾的天数。 */
export function dayCount(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map((part) => Number(part));
  const [ty, tm, td] = to.split('-').map((part) => Number(part));
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

/**
 * 计划与实际的对照结论。
 *
 * 今天不算缺勤：一天没结束，「还没到店」和「今天休息」在数据上分不出来，
 * 提前下结论只会让店长以为人没来。往天的 30 分钟以内差异（早走一会儿）归为 done。
 */
export function planState(input: {
  hasShift: boolean;
  date: string;
  today: string;
  plannedMinutes: number;
  actualMinutes: number;
}): PlanState {
  if (!input.hasShift) return 'none';
  if (input.date > input.today) return 'planned';
  if (input.date === input.today) return input.actualMinutes > 0 ? 'done' : 'planned';
  if (input.actualMinutes <= 0) return 'absent';
  return input.actualMinutes + 30 < input.plannedMinutes ? 'short' : 'done';
}

/** 分钟的「09:30」；1440 视作次日 00:00，班表按「到 24:00 结束」展示。 */
export function minuteText(minutes: number): string {
  const value = Math.max(0, Math.min(1440, Math.round(minutes)));
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}

const isClosed = (row: WorkSession): boolean => row.status === 'closed' && row.clockOutAt != null;

@Injectable()
export class ShiftService {
  constructor(private readonly prisma: PrismaService) {}

  /** 可见门店；allStores 只取营业中的店，与在店看板口径一致。 */
  private async scopeStores(staff: StaffContext) {
    return staff.allStores
      ? this.prisma.store.findMany({ where: { open: true }, orderBy: { name: 'asc' } })
      : this.prisma.store.findMany({ where: { id: { in: staff.storeIds } }, orderBy: { name: 'asc' } });
  }

  /**
   * 周/月视图。
   *
   * 返回「人 × 天」的矩阵而不是扁平班次列表：前端排班是表格，逐格渲染，
   * 让服务端把「这天有没有班、实际记了多少」算好，前端不重复做日期与状态判断。
   */
  async list(staff: StaffContext, input: { storeId?: string; from?: string; to?: string }) {
    const today = shanghaiDate();
    const from = input.from || weekStartOf(today);
    const to = input.to || addDays(from, 6);
    for (const value of [from, to]) {
      if (!DATE_RE.test(value)) throw badRequest('日期格式应为 YYYY-MM-DD');
    }
    if (to < from) throw badRequest('结束日期不能早于开始日期');
    const count = dayCount(from, to);
    if (count > MAX_RANGE_DAYS) throw badRequest(`一次最多查看 ${MAX_RANGE_DAYS} 天`);

    const stores = await this.scopeStores(staff);
    if (!stores.length) throw badRequest('没有可排班的门店');
    const store = input.storeId ? stores.find((item) => item.id === input.storeId) : stores[0];
    if (input.storeId && !store) {
      // 转成 403：拿别人的门店 id 来排班，不能靠 404 猜是否存在
      assertStoreAccess(staff, input.storeId);
      throw notFound('门店不存在');
    }
    if (!store) throw badRequest('没有可排班的门店');

    const [people, shifts, sessions] = await Promise.all([
      this.prisma.user.findMany({
        where: { active: true, userStores: { some: { storeId: store.id } } },
        orderBy: { name: 'asc' }
      }),
      this.prisma.plannedShift.findMany({
        where: { storeId: store.id, businessDate: { gte: from, lte: to } }
      }),
      this.prisma.workSession.findMany({
        where: {
          storeId: store.id,
          businessDate: { gte: from, lte: to },
          status: { not: 'voided' }
        }
      })
    ]);

    const shiftOf = new Map(shifts.map((row) => [`${row.userId}|${row.businessDate}`, row]));
    const actualOf = new Map<string, number>();
    for (const row of sessions) {
      if (!isClosed(row)) continue;
      const key = `${row.userId}|${row.businessDate}`;
      actualOf.set(key, (actualOf.get(key) ?? 0) + minutesBetween(row.clockInAt, row.clockOutAt!));
    }

    const days = Array.from({ length: count }, (_, index) => addDays(from, index));
    const buildRow = (userId: string, name: string): ShiftRow => {
      const cells = days.map((businessDate) => {
        const shift = shiftOf.get(`${userId}|${businessDate}`) || null;
        const plannedMinutes = shift ? shift.endMin - shift.startMin : 0;
        const actualMinutes = actualOf.get(`${userId}|${businessDate}`) ?? 0;
        return {
          businessDate,
          shift: shift ? this.mapShift(shift) : null,
          plannedMinutes,
          actualMinutes,
          state: planState({ hasShift: !!shift, date: businessDate, today, plannedMinutes, actualMinutes })
        };
      });
      return {
        userId,
        name,
        cells,
        plannedMinutes: cells.reduce((sum, cell) => sum + cell.plannedMinutes, 0),
        actualMinutes: cells.reduce((sum, cell) => sum + cell.actualMinutes, 0)
      };
    };

    const rows = people.map((person) => buildRow(person.id, person.name));
    // 有班次但已不在门店员工列表里的人（调店、停用）：不排进来会让人以为班次丢了
    const known = new Set(rows.map((row) => row.userId));
    const orphans = [...new Set(shifts.map((row) => row.userId))].filter((userId) => !known.has(userId));
    if (orphans.length) {
      const users = await this.prisma.user.findMany({ where: { id: { in: orphans } } });
      const nameOf = new Map(users.map((user) => [user.id, user.name]));
      for (const userId of orphans) rows.push(buildRow(userId, nameOf.get(userId) || userId));
    }
    rows.sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));

    const cells = rows.flatMap((row) => row.cells);
    return {
      storeId: store.id,
      storeName: store.name,
      stores: stores.map((item) => ({ id: item.id, name: item.name })),
      from,
      to,
      today,
      days,
      rows,
      summary: {
        people: rows.filter((row) => row.plannedMinutes > 0).length,
        plannedMinutes: rows.reduce((sum, row) => sum + row.plannedMinutes, 0),
        actualMinutes: rows.reduce((sum, row) => sum + row.actualMinutes, 0),
        absentDays: cells.filter((cell) => cell.state === 'absent').length
      },
      limits: { maxRangeDays: MAX_RANGE_DAYS, pastEditDays: PAST_EDIT_DAYS, futureEditDays: FUTURE_EDIT_DAYS }
    };
  }

  /** 排一整天的一段班：同一人同一天同店只有一条，重复提交就是改。 */
  async save(
    staff: StaffContext,
    input: { storeId: string; userId: string; businessDate: string; startMin: number; endMin: number; note?: string }
  ) {
    const storeId = String(input.storeId || '').trim();
    const userId = String(input.userId || '').trim();
    const businessDate = String(input.businessDate || '').trim();
    if (!storeId) throw badRequest('请选择门店');
    if (!userId) throw badRequest('请选择员工');
    if (!DATE_RE.test(businessDate)) throw badRequest('日期格式应为 YYYY-MM-DD');

    const today = shanghaiDate();
    if (businessDate < addDays(today, -PAST_EDIT_DAYS)) {
      throw badRequest(`只能修改 ${PAST_EDIT_DAYS} 天以内的班表`);
    }
    if (businessDate > addDays(today, FUTURE_EDIT_DAYS)) {
      throw badRequest(`最多排到 ${FUTURE_EDIT_DAYS} 天以后`);
    }

    const { startMin, endMin } = input;
    if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) throw badRequest('班次时间应为整分钟');
    if (startMin < 0 || endMin > 1440) throw badRequest('班次时间应在 00:00–24:00 之间');
    if (endMin <= startMin) throw badRequest('结束时间要晚于开始时间（跨零点请拆成两天）');
    const note = String(input.note ?? '').trim().slice(0, 80);

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw notFound('门店不存在');
    assertStoreAccess(staff, storeId);
    const person = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userStores: { where: { storeId } } }
    });
    if (!person) throw notFound('员工不存在');
    // 只允许给「在这家店有岗」的人排班：跨店排班看着能用，实际会让人去错店
    if (!person.userStores.length) throw badRequest(`${person.name} 不属于 ${store.name}，请先调整门店归属`);

    const image = `${minuteText(startMin)}–${minuteText(endMin)}`;
    const previous = await this.prisma.plannedShift.findUnique({
      where: { storeId_userId_businessDate: { storeId, userId, businessDate } }
    });
    const shift = await this.prisma.plannedShift.upsert({
      where: { storeId_userId_businessDate: { storeId, userId, businessDate } },
      create: {
        id: newId('PS'),
        storeId,
        userId,
        businessDate,
        startMin,
        endMin,
        note,
        createdBy: staff.id
      },
      update: { startMin, endMin, note, createdBy: staff.id }
    });

    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: previous ? '修改班表' : '新增班表',
      detail: `${store.name}｜${businessDate}｜${person.name}：${
        previous ? `${minuteText(previous.startMin)}–${minuteText(previous.endMin)} → ` : ''
      }${image}${note ? `｜${note}` : ''}`,
      type: 'attendance',
      storeId
    });

    return { shift: this.mapShift(shift), plannedMinutes: endMin - startMin };
  }

  /** 清空某一天的班：按业务键删，前端不必先拿 id。 */
  async remove(staff: StaffContext, input: { storeId: string; userId: string; businessDate: string }) {
    const businessDate = String(input.businessDate || '').trim();
    if (!DATE_RE.test(businessDate)) throw badRequest('日期格式应为 YYYY-MM-DD');
    const storeId = String(input.storeId || '').trim();
    const userId = String(input.userId || '').trim();
    if (!storeId || !userId) throw badRequest('请选择门店与员工');
    assertStoreAccess(staff, storeId);

    const existing = await this.prisma.plannedShift.findUnique({
      where: { storeId_userId_businessDate: { storeId, userId, businessDate } }
    });
    if (!existing) throw notFound('这一天没有班次');

    const [store, person] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId } }),
      this.prisma.user.findUnique({ where: { id: userId } })
    ]);
    await this.prisma.plannedShift.delete({ where: { id: existing.id } });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '清空班表',
      detail: `${store?.name || storeId}｜${businessDate}｜${person?.name || userId}：${minuteText(
        existing.startMin
      )}–${minuteText(existing.endMin)}`,
      type: 'attendance',
      storeId
    });
    return { ok: true };
  }

  private mapShift(row: PlannedShift) {
    return { id: row.id, startMin: row.startMin, endMin: row.endMin, note: row.note };
  }
}