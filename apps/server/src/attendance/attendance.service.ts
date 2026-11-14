import { Injectable } from '@nestjs/common';
import { Prisma, type Approval, type WorkSession } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { assertStoreAccess, type StaffContext } from '../common/auth.types';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../common/errors';
import { logAction } from '../common/logs';
import { newId } from '../common/ids';
import { describeGate, evaluateGate, haversineMeters, type GatePolicy } from './attendance.geo';
import {
  formatMinutes,
  minutesBetween,
  monthOf,
  monthRange,
  shanghaiDate,
  shanghaiTimeText
} from './attendance.time';

/** 一句「在店时段」少于 1 分钟当误点处理：不计工时、不进看板主表，但保留原始记录可追溯。 */
export const MIN_SEGMENT_MINUTES = 1;
/** 双击/断网重试的容忍窗：同店同人的重复到店确认直接返回同一段，不报「你已在店」。 */
const RETRY_WINDOW_MS = 90_000;

export const ATTENDANCE_APPROVAL_KIND = 'ATTENDANCE';
export const ATTENDANCE_POLICY_KEY = 'attendancePolicy';

export type AttendancePolicy = GatePolicy & {
  /** 单段上限（分钟）：超过即转 lapsed，避免忘点离店把工时无限拉长 */
  maxSegmentMinutes: number;
  /** 结算单价（分/分钟） */
  ratePerMinCents: number;
  /** 暂时只有月结；字段留着，个人/双周结不用改表 */
  settlementCycle: 'month';
  /** 门店级半径覆盖，例如 { 's-x': { radiusM: 150 } } */
  stores: Record<string, { radiusM?: number }>;
};

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
  radiusM: 100,
  accuracyCeilingM: 100,
  accuracyAllowanceM: 50,
  maxSegmentMinutes: 16 * 60,
  ratePerMinCents: 50,
  settlementCycle: 'month',
  stores: {}
};

export type AttendancePayload =
  | { mode: 'close'; sessionId: string; clockOutAt: number; reason: string }
  | { mode: 'backfill'; storeId: string; clockInAt: number; clockOutAt: number; reason: string };

export type MappedSession = {
  id: string;
  storeId: string;
  userId: string;
  businessDate: string;
  clockInAt: number;
  clockOutAt: number | null;
  /** 只有 closed 才有分钟数——这是「宁可少算不可虚增」的唯一实现点 */
  minutes: number;
  /** 进行中的段按到此刻累计，仅供展示，不进任何汇总 */
  liveMinutes: number;
  status: string;
  inDistanceM: number | null;
  inAccuracyM: number | null;
  outDistanceM: number | null;
  pendingApprovalId: string | null;
  /** 能否发起补离店 */
  adjustable: boolean;
  note: string;
};

const isUniqueViolation = (error: unknown, field?: string): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;
  if (!field) return true;
  const target = error.meta?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes(field);
};

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 配置 ----------

  async policy(db: Pick<Prisma.TransactionClient, 'setting'> = this.prisma): Promise<AttendancePolicy> {
    let row: { valueJson: string } | null = null;
    try {
      row = await db.setting.findUnique({ where: { key: ATTENDANCE_POLICY_KEY } });
    } catch {
      row = null;
    }
    if (!row) return { ...DEFAULT_ATTENDANCE_POLICY };
    try {
      const parsed = JSON.parse(row.valueJson) as Partial<AttendancePolicy>;
      return {
        ...DEFAULT_ATTENDANCE_POLICY,
        ...parsed,
        stores: parsed.stores ?? {}
      };
    } catch {
      return { ...DEFAULT_ATTENDANCE_POLICY };
    }
  }

  private gatePolicyFor(policy: AttendancePolicy, storeId: string): GatePolicy {
    const override = policy.stores?.[storeId]?.radiusM;
    return {
      radiusM: typeof override === 'number' && override >= 0 ? override : policy.radiusM,
      accuracyCeilingM: policy.accuracyCeilingM,
      accuracyAllowanceM: policy.accuracyAllowanceM
    };
  }

  // ---------- 映射 ----------

  mapSession(row: WorkSession, nowMs = Date.now()): MappedSession {
    const closed = row.status === 'closed' && row.clockOutAt;
    const minutes = closed ? Math.max(0, minutesBetween(row.clockInAt, row.clockOutAt!)) : 0;
    const liveMinutes =
      row.status === 'open' ? Math.max(0, minutesBetween(row.clockInAt, new Date(nowMs))) : 0;
    return {
      id: row.id,
      storeId: row.storeId,
      userId: row.userId,
      businessDate: row.businessDate,
      clockInAt: row.clockInAt.getTime(),
      clockOutAt: row.clockOutAt ? row.clockOutAt.getTime() : null,
      minutes,
      liveMinutes,
      status: row.status,
      inDistanceM: row.inDistanceM,
      inAccuracyM: row.inAccuracyM,
      outDistanceM: row.outDistanceM,
      pendingApprovalId: row.pendingApprovalId,
      adjustable: row.status === 'open' || row.status === 'lapsed',
      note: row.note
    };
  }

  // ---------- 到店 / 离店 ----------

  async clockIn(
    staff: StaffContext,
    input: { storeId: string; lat: number; lng: number; accuracyM?: number | null }
  ) {
    assertStoreAccess(staff, input.storeId);
    const store = await this.prisma.store.findUnique({ where: { id: input.storeId } });
    if (!store) throw notFound('门店不存在');

    const policy = await this.policy();
    const gate = evaluateGate({
      point: { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM ?? null },
      store: { lat: store.lat, lng: store.lng },
      policy: this.gatePolicyFor(policy, store.id)
    });
    const now = new Date();

    if (!gate.ok) {
      const message = describeGate(gate, store.name);
      await logAction(this.prisma, {
        actorId: staff.id,
        actorName: staff.name,
        action: '到店确认被拒',
        detail: `${message}｜门市坐标 ${store.lat},${store.lng}｜上报 ${input.lat},${input.lng}`,
        type: 'attendance',
        storeId: store.id
      });
      throw new ApiError(409, message, {
        code: `GATE_${gate.reason.toUpperCase()}`,
        details: gate
      });
    }

    const existing = await this.prisma.workSession.findUnique({ where: { openKey: staff.id } });
    if (existing) {
      // 90 秒内同店重复提交 = 双击或网络重试，返回第一段，不制造第二段
      if (
        existing.storeId === store.id &&
        now.getTime() - existing.clockInAt.getTime() <= RETRY_WINDOW_MS
      ) {
        return { session: this.mapSession(existing), gate, replay: true };
      }
      throw new ApiError(
        409,
        `你已在店（${shanghaiTimeText(existing.clockInAt)} 起），如已离开请先做离店确认`,
        { code: 'OPEN_SESSION_EXISTS', details: { session: this.mapSession(existing) } }
      );
    }

    let row: WorkSession;
    try {
      row = await this.prisma.workSession.create({
        data: {
          id: newId('WS'),
          storeId: store.id,
          userId: staff.id,
          businessDate: shanghaiDate(now),
          clockInAt: now,
          inLat: input.lat,
          inLng: input.lng,
          inAccuracyM: input.accuracyM != null ? Math.round(input.accuracyM) : null,
          inDistanceM: gate.distanceM,
          status: 'open',
          openKey: staff.id
        }
      });
    } catch (error) {
      // 并发双击：唯一索引挡住第二个，按「已有一段进行中」处理而不是 500
      if (isUniqueViolation(error, 'open_key')) {
        throw new ApiError(409, '你已有一段进行中的在店时段', { code: 'OPEN_SESSION_EXISTS' });
      }
      throw error;
    }

    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '到店确认',
      detail: `${store.name}｜距店 ${gate.distanceM}m（限 ${gate.limitM}m）`,
      type: 'attendance',
      storeId: store.id
    });

    return { session: this.mapSession(row), gate, replay: false };
  }

  /**
   * 离店确认：不校验位置。
   * 理由是离店是「闭合」动作——要求走回店里才能点，结果会是段永远 open、
   * 16 小时后转待补签、全店垫付类补签堆成山。坐标只记录留档。
   */
  async clockOut(
    staff: StaffContext,
    input: { lat?: number | null; lng?: number | null; accuracyM?: number | null }
  ) {
    const session = await this.prisma.workSession.findUnique({ where: { openKey: staff.id } });
    if (!session) {
      throw new ApiError(
        409,
        '当前没有进行中的在店时段；如果你忘了点「到店确认」，可以点「补签」发起申请',
        { code: 'NO_OPEN_SESSION' }
      );
    }

    const policy = await this.policy();
    const now = new Date();
    const minutes = minutesBetween(session.clockInAt, now);

    if (minutes > policy.maxSegmentMinutes) {
      await this.lapse(session.id);
      throw new ApiError(
        409,
        `这段在店时间已超过 ${Math.round(policy.maxSegmentMinutes / 60)} 小时，已转为待补签；请发起补签说明离店时间`,
        { code: 'SEGMENT_TOO_LONG' }
      );
    }

    const voided = minutes < MIN_SEGMENT_MINUTES;
    const store = await this.prisma.store.findUnique({ where: { id: session.storeId } });
    const outDistanceM =
      input.lat != null && input.lng != null && store
        ? Math.round(haversineMeters({ lat: input.lat, lng: input.lng }, { lat: store.lat, lng: store.lng }))
        : null;

    // 条件更新：并发两次离店只有一个胜者，败者拿到 409 而不是覆盖时间
    const claim = await this.prisma.workSession.updateMany({
      where: { id: session.id, status: 'open', openKey: staff.id },
      data: {
        clockOutAt: now,
        status: voided ? 'voided' : 'closed',
        openKey: null,
        outLat: input.lat ?? null,
        outLng: input.lng ?? null,
        outAccuracyM: input.accuracyM != null ? Math.round(input.accuracyM) : null,
        outDistanceM,
        note: voided ? '在店不足 1 分钟，按误点处理不计工时' : ''
      }
    });
    if (!claim.count) throw conflict('这段在店时段已经结束，请刷新后再操作');

    const fresh = await this.prisma.workSession.findUnique({ where: { id: session.id } });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '离店确认',
      detail: `${shanghaiTimeText(session.clockInAt)}–${shanghaiTimeText(now)}｜${formatMinutes(minutes)}`,
      type: 'attendance',
      storeId: session.storeId
    });

    return {
      session: this.mapSession(fresh!),
      minutes,
      voided
    };
  }

  // ---------- 补签申请 ----------

  /** 补离店：修补已有段，批准后按申报时间闭合。注意同时释放 openKey，让他能马上开始下一段。 */
  async requestClose(
    staff: StaffContext,
    input: { sessionId: string; clockOutAtMs: number; reason: string }
  ) {
    const session = await this.prisma.workSession.findUnique({ where: { id: input.sessionId } });
    if (!session) throw notFound('在店时段不存在');
    if (session.userId !== staff.id) throw forbidden('只能补自己的在店时段');
    if (session.status !== 'open' && session.status !== 'lapsed') {
      throw conflict('这段在店时段已处理，不需要再补离店');
    }
    if (session.pendingApprovalId) throw conflict('这段已有一个待审批的补签申请');

    const policy = await this.policy();
    const out = new Date(input.clockOutAtMs);
    const now = Date.now();
    if (!Number.isFinite(out.getTime())) throw badRequest('离店时间格式不正确');
    if (out.getTime() <= session.clockInAt.getTime()) throw badRequest('离店时间必须晚于到店时间');
    if (out.getTime() > now) throw badRequest('离店时间不能晚于现在');
    const minutes = minutesBetween(session.clockInAt, out);
    if (minutes < MIN_SEGMENT_MINUTES) throw badRequest('补的时段不足 1 分钟，请检查时间');
    if (minutes > policy.maxSegmentMinutes) {
      throw badRequest(`单段不能超过 ${Math.round(policy.maxSegmentMinutes / 60)} 小时，请核对时间`);
    }
    await this.assertNoOverlap(this.prisma, staff.id, session.clockInAt, out, session.id);

    const reason = input.reason.trim();
    const approval = await this.prisma.$transaction(async (tx) => {
      const row = await tx.approval.create({
        data: {
          id: newId('A'),
          kind: ATTENDANCE_APPROVAL_KIND,
          status: 'pending',
          executionStatus: '',
          amountCents: 0,
          storeId: session.storeId,
          summary: `补离店 · ${session.businessDate} ${shanghaiTimeText(session.clockInAt)}–${shanghaiTimeText(out)}（${formatMinutes(minutes)}）`,
          payloadJson: JSON.stringify({
            mode: 'close',
            sessionId: session.id,
            clockOutAt: out.getTime(),
            reason
          } satisfies AttendancePayload),
          requestedBy: staff.id,
          createdAt: new Date()
        }
      });
      const claim = await tx.workSession.updateMany({
        where: { id: session.id, status: session.status, pendingApprovalId: null },
        data: { status: 'pending_close', pendingApprovalId: row.id, openKey: null }
      });
      if (!claim.count) throw conflict('这段在店时段已被处理');
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '发起补离店申请',
        detail: `${session.businessDate} ${shanghaiTimeText(session.clockInAt)}–${shanghaiTimeText(out)}｜${reason || '未填原因'}`,
        type: 'attendance',
        storeId: session.storeId
      });
      return row;
    });

    const fresh = await this.prisma.workSession.findUnique({ where: { id: session.id } });
    return { approvalId: approval.id, session: this.mapSession(fresh!) };
  }

  /**
   * 补签到店：整段补录，不建占位段——被驳回时无需清理。
   * 必须同时给到店和离店时间；人还在店里就直接点「到店确认」开始计时，不需要补签。
   */
  async requestBackfill(
    staff: StaffContext,
    input: { storeId: string; clockInAtMs: number; clockOutAtMs: number; reason: string }
  ) {
    assertStoreAccess(staff, input.storeId);
    const store = await this.prisma.store.findUnique({ where: { id: input.storeId } });
    if (!store) throw notFound('门店不存在');

    const policy = await this.policy();
    const inAt = new Date(input.clockInAtMs);
    const outAt = new Date(input.clockOutAtMs);
    const now = Date.now();
    if (!Number.isFinite(inAt.getTime()) || !Number.isFinite(outAt.getTime())) {
      throw badRequest('时间格式不正确');
    }
    if (inAt.getTime() >= outAt.getTime()) throw badRequest('到店时间必须早于离店时间');
    if (outAt.getTime() > now) throw badRequest('离店时间不能晚于现在');
    const minutes = minutesBetween(inAt, outAt);
    if (minutes < MIN_SEGMENT_MINUTES) throw badRequest('补签的时段不足 1 分钟，请检查时间');
    if (minutes > policy.maxSegmentMinutes) {
      throw badRequest(`单段不能超过 ${Math.round(policy.maxSegmentMinutes / 60)} 小时，请核对时间`);
    }
    await this.assertNoOverlap(this.prisma, staff.id, inAt, outAt, null);

    const reason = input.reason.trim();
    const approval = await this.prisma.approval.create({
      data: {
        id: newId('A'),
        kind: ATTENDANCE_APPROVAL_KIND,
        status: 'pending',
        executionStatus: '',
        amountCents: 0,
        storeId: store.id,
        summary: `补签到店 · ${shanghaiDate(inAt)} ${shanghaiTimeText(inAt)}–${shanghaiTimeText(outAt)}（${formatMinutes(minutes)}）`,
        payloadJson: JSON.stringify({
          mode: 'backfill',
          storeId: store.id,
          clockInAt: inAt.getTime(),
          clockOutAt: outAt.getTime(),
          reason
        } satisfies AttendancePayload),
        requestedBy: staff.id,
        createdAt: new Date()
      }
    });

    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '发起补签到店申请',
      detail: `${store.name}｜${shanghaiDate(inAt)} ${shanghaiTimeText(inAt)}–${shanghaiTimeText(outAt)}｜${reason || '未填原因'}`,
      type: 'attendance',
      storeId: store.id
    });

    return { approvalId: approval.id, minutes };
  }

  /** 撤回自己的未决申请：填错时间不用等驳回。 */
  async cancelRequest(staff: StaffContext, approvalId: string) {
    const approval = await this.prisma.approval.findUnique({ where: { id: approvalId } });
    if (!approval) throw notFound('申请不存在');
    if (approval.kind !== ATTENDANCE_APPROVAL_KIND) throw badRequest('该申请不是补签申请');
    if (approval.requestedBy !== staff.id) throw forbidden('只能撤回自己发起的申请');
    if (approval.status !== 'pending') throw conflict('该申请已处理，无法撤回');

    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.approval.updateMany({
        where: { id: approvalId, status: 'pending' },
        data: { status: 'rejected', comment: '本人撤回', resultNote: '本人撤回', decidedAt: new Date(), executionStatus: 'rejected' }
      });
      if (!claim.count) throw conflict('该申请已处理');
      await this.releaseSession(tx, approval);
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '撤回补签申请',
        detail: approval.summary,
        type: 'attendance',
        storeId: approval.storeId
      });
    });
    return { ok: true };
  }

  // ---------- 审批执行（由 ApprovalsService 在事务内调用） ----------

  /** 批准：index 段与审批行同事务，失败整体回滚，不会出现「批了但没算」。 */
  async applyApproval(
    tx: Prisma.TransactionClient,
    approval: Approval,
    approver: StaffContext
  ): Promise<string> {
    const payload = JSON.parse(approval.payloadJson) as AttendancePayload;
    const now = new Date();

    if (payload.mode === 'close') {
      const session = await tx.workSession.findUnique({ where: { id: payload.sessionId } });
      if (!session) throw notFound('在店时段不存在');
      if (session.status !== 'pending_close' || session.pendingApprovalId !== approval.id) {
        throw conflict('该在店时段已被其他操作处理');
      }
      const out = new Date(payload.clockOutAt);
      const minutes = minutesBetween(session.clockInAt, out);
      const voided = minutes < MIN_SEGMENT_MINUTES;
      const claim = await tx.workSession.updateMany({
        where: { id: session.id, status: 'pending_close', pendingApprovalId: approval.id },
        data: {
          clockOutAt: out,
          status: voided ? 'voided' : 'closed',
          openKey: null,
          pendingApprovalId: null,
          adjustedBy: approver.id,
          adjustedAt: now,
          adjustReason: payload.reason
        }
      });
      if (!claim.count) throw conflict('该在店时段已被其他操作处理');
      return `已补记离店 ${shanghaiTimeText(out)}，计入 ${formatMinutes(minutes)}`;
    }

    const store = await tx.store.findUnique({ where: { id: payload.storeId } });
    if (!store) throw notFound('门店不存在');
    if (!approval.requestedBy) throw badRequest('该申请缺少申请人，无法补记');
    const inAt = new Date(payload.clockInAt);
    const outAt = new Date(payload.clockOutAt);
    await this.assertNoOverlap(tx, approval.requestedBy, inAt, outAt, null);
    const minutes = minutesBetween(inAt, outAt);
    await tx.workSession.create({
      data: {
        id: newId('WS'),
        storeId: store.id,
        userId: approval.requestedBy,
        businessDate: shanghaiDate(inAt),
        clockInAt: inAt,
        clockOutAt: outAt,
        inLat: store.lat,
        inLng: store.lng,
        inAccuracyM: null,
        inDistanceM: null,
        status: 'closed',
        openKey: null,
        note: '补签到店（审批通过）',
        adjustedBy: approver.id,
        adjustedAt: now,
        adjustReason: payload.reason
      }
    });
    return `已补记 ${formatMinutes(minutes)}`;
  }

  /** 驳回：把段退回 lapsed，让员工能改时间重新申报，而不是卡死在「申请中」。 */
  async releaseSession(tx: Prisma.TransactionClient, approval: Approval): Promise<void> {
    let payload: AttendancePayload;
    try {
      payload = JSON.parse(approval.payloadJson) as AttendancePayload;
    } catch {
      return;
    }
    if (payload.mode !== 'close') return;
    await tx.workSession.updateMany({
      where: { id: payload.sessionId, status: 'pending_close', pendingApprovalId: approval.id },
      data: { status: 'lapsed', pendingApprovalId: null }
    });
  }

  // ---------- 定时兜底 ----------

  /** 超过上限仍未离店 → lapsed，工时归 0 等补签。宁可少算，不可虚增。 */
  async sweepLapsed(now: Date = new Date()): Promise<number> {
    const policy = await this.policy();
    const cutoff = new Date(now.getTime() - policy.maxSegmentMinutes * 60_000);
    const result = await this.prisma.workSession.updateMany({
      where: { status: 'open', clockInAt: { lt: cutoff } },
      data: { status: 'lapsed', openKey: null, note: '超过上限未离店，已转待补签' }
    });
    return result.count;
  }

  private async lapse(sessionId: string) {
    await this.prisma.workSession.updateMany({
      where: { id: sessionId, status: 'open' },
      data: { status: 'lapsed', openKey: null, note: '超过上限未离店，已转待补签' }
    });
  }

  // ---------- 查询 ----------

  /** 本人的今日时间轴 + 本月合计；店员端只给自己看，所以不含单价。 */
  /**
   * 本人视图。带上当前定位读数时顺带返回一次围栏预判（preview）：
   * 前端在按下「到店确认」之前就要知道会不会通过，且必须与服务端的判定同一份代码，
   * 否则会出现「界面说在范围内、点下去被拒」。
   */
  async mine(
    staff: StaffContext,
    storeId?: string,
    point?: { lat: number; lng: number; accuracyM?: number | null } | null
  ) {
    const now = new Date();
    const today = shanghaiDate(now);
    const month = monthOf(today);
    const { start, end } = monthRange(month);

    const [open, todaySessions, closedThisMonth, pendingCount, unresolvedRows, stores] =
      await Promise.all([
        this.prisma.workSession.findUnique({ where: { openKey: staff.id } }),
        this.prisma.workSession.findMany({
          where: { userId: staff.id, businessDate: today },
          orderBy: { clockInAt: 'asc' }
        }),
        this.prisma.workSession.findMany({
          where: {
            userId: staff.id,
            status: 'closed',
            businessDate: { gte: start, lte: end }
          }
        }),
        this.prisma.workSession.count({ where: { userId: staff.id, status: 'pending_close' } }),
        // 取行而不是 count：跨天的待补签（昨天忘了点离店）也要能在页面上找到并处理
        this.prisma.workSession.findMany({
          where: { userId: staff.id, status: { in: ['open', 'pending_close', 'lapsed'] } },
          orderBy: { clockInAt: 'desc' }
        }),
        staff.allStores
          ? this.prisma.store.findMany({ where: { open: true }, orderBy: { name: 'asc' } })
          : this.prisma.store.findMany({ where: { id: { in: staff.storeIds } }, orderBy: { name: 'asc' } })
      ]);

    const monthMinutes = closedThisMonth.reduce(
      (sum, row) => sum + minutesBetween(row.clockInAt, row.clockOutAt!),
      0
    );
    const days = new Set(closedThisMonth.map((row) => row.businessDate)).size;
    const policy = await this.policy();
    const preferred = storeId || open?.storeId || stores[0]?.id;
    const previewStore = stores.find((item) => item.id === preferred);

    return {
      today,
      now: now.getTime(),
      open: open ? this.mapSession(open, now.getTime()) : null,
      sessions: todaySessions.map((row) => this.mapSession(row, now.getTime())),
      pendingCount,
      unresolvedCount: unresolvedRows.length,
      unresolved: unresolvedRows.map((row) => this.mapSession(row, now.getTime())),
      month: { label: month, minutes: monthMinutes, days },
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        short: store.short,
        address: store.address,
        lat: store.lat,
        lng: store.lng
      })),
      policy: {
        radiusM: preferred ? this.gatePolicyFor(policy, preferred).radiusM : policy.radiusM,
        accuracyCeilingM: policy.accuracyCeilingM,
        accuracyAllowanceM: policy.accuracyAllowanceM,
        maxSegmentMinutes: policy.maxSegmentMinutes
      },
      // 与 clockIn 走完全同一条判定（evaluateGate），避免「预览通过、提交被拒」。
      // 只认这名员工可见的门店：拿别人的门店 id 来问距离没有意义。
      preview:
        point && previewStore
          ? evaluateGate({
              point,
              store: previewStore,
              policy: this.gatePolicyFor(policy, previewStore.id)
            })
          : null
    };
  }

  /**
   * 在店看板：某店（或全部可见门店）某天的全部时段，按人聚合。
   * 运营/区域岗位不一定能看单店配置，所以范围默认取「本人可见的门店」，
   * 传了 storeId 才收窄——这条路径用 assertStoreAccess 守住越权。
   */
  async board(staff: StaffContext, input: { storeId?: string; date?: string }) {
    const allStores = staff.allStores
      ? await this.prisma.store.findMany({ where: { open: true }, orderBy: { name: 'asc' } })
      : await this.prisma.store.findMany({
          where: { id: { in: staff.storeIds } },
          orderBy: { name: 'asc' }
        });
    let scope = allStores;
    if (input.storeId) {
      assertStoreAccess(staff, input.storeId);
      scope = allStores.filter((item) => item.id === input.storeId);
      if (!scope.length) throw notFound('门店不存在');
    }
    if (!scope.length) throw badRequest('没有可查看的门店');

    const storeIds = scope.map((item) => item.id);
    const storeNameOf = new Map(scope.map((item) => [item.id, item.name]));
    const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : shanghaiDate();
    const now = Date.now();

    const sessions = await this.prisma.workSession.findMany({
      where: { storeId: { in: storeIds }, businessDate: date },
      orderBy: { clockInAt: 'asc' }
    });
    const userIds = [...new Set(sessions.map((row) => row.userId))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } } })
      : [];
    const nameOf = new Map(users.map((user) => [user.id, user.name]));

    const byUser = new Map<string, MappedSession[]>();
    for (const row of sessions) {
      const mapped = this.mapSession(row, now);
      const list = byUser.get(row.userId) || [];
      list.push(mapped);
      byUser.set(row.userId, list);
    }

    const rows = [...byUser.entries()]
      .map(([userId, list]) => ({
        userId,
        name: nameOf.get(userId) || userId,
        // 跨店看板时，每段都要说清是哪家店，否则「在店中」看不出人在哪儿
        storeNames: [...new Set(list.map((item) => storeNameOf.get(item.storeId) || item.storeId))],
        sessions: list,
        minutes: list.reduce((sum, item) => sum + item.minutes, 0),
        liveMinutes: list.reduce((sum, item) => sum + item.liveMinutes, 0),
        unresolved: list.filter((item) =>
          ['open', 'pending_close', 'lapsed'].includes(item.status)
        ).length
      }))
      .sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));

    const unresolvedList = rows.flatMap((row) =>
      row.sessions
        .filter((item) => ['open', 'pending_close', 'lapsed'].includes(item.status))
        .map((item) => ({
          sessionId: item.id,
          userId: row.userId,
          name: row.name,
          storeName: storeNameOf.get(item.storeId) || item.storeId,
          status: item.status,
          businessDate: item.businessDate,
          clockInAt: item.clockInAt,
          liveMinutes: item.liveMinutes
        }))
    );

    const policy = await this.policy();
    return {
      storeId: scope.length === 1 ? scope[0].id : null,
      storeName: scope.length === 1 ? scope[0].name : '全部门店',
      // 下拉里始终给全部可见门店：否则选了单店后，切不回另一家
      stores: allStores.map((item) => ({ id: item.id, name: item.name })),
      date,
      now,
      policy: {
        // 跨店看板时半径可能因店而异，展示口默认值，单店时用该店的
        radiusM: this.gatePolicyFor(policy, scope[0].id).radiusM
      },
      rows,
      onDuty: rows
        .filter((row) => row.sessions.some((item) => item.status === 'open'))
        .map((row) => {
          const current = row.sessions.find((item) => item.status === 'open')!;
          return {
            userId: row.userId,
            name: row.name,
            storeName: storeNameOf.get(current.storeId) || current.storeId,
            clockInAt: current.clockInAt,
            liveMinutes: current.liveMinutes
          };
        }),
      unresolved: unresolvedList,
      summary: {
        peopleCount: rows.length,
        totalMinutes: rows.reduce((sum, row) => sum + row.minutes, 0),
        liveMinutes: rows.reduce((sum, row) => sum + row.liveMinutes, 0),
        unresolvedCount: unresolvedList.length,
        pendingApprovals: unresolvedList.filter((item) => item.status === 'pending_close').length
      }
    };
  }

  // ---------- 内部校验 ----------

  /** 同一人的时段不得重叠：段求和的口径下，重叠等于重复计费。 */
  private async assertNoOverlap(
    db: Pick<Prisma.TransactionClient, 'workSession'>,
    userId: string,
    start: Date,
    end: Date,
    excludeId: string | null
  ) {
    if (!userId) return;
    const rows = await db.workSession.findMany({
      where: {
        userId,
        status: { in: ['open', 'pending_close', 'closed'] },
        clockInAt: { lt: end },
        ...(excludeId ? { id: { not: excludeId } } : {})
      }
    });
    const now = new Date();
    for (const row of rows) {
      const rowEnd = row.clockOutAt ?? now;
      if (rowEnd.getTime() > start.getTime()) {
        throw conflict(
          `与已有在店时段（${row.businessDate} ${shanghaiTimeText(row.clockInAt)}–${row.clockOutAt ? shanghaiTimeText(row.clockOutAt) : '进行中'}）重叠，请先处理那一段`
        );
      }
    }
  }
}