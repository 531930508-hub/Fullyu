import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerm, Staff } from '../auth/decorators';
import { parseInput } from '../common/zod';
import type { StaffContext } from '../common/auth.types';
import { AttendanceService } from '../attendance/attendance.service';
import { ShiftService } from '../attendance/shift.service';
import { AttendanceReportService } from '../attendance/report.service';
import { MAX_LABOR_RATE_CENTS, SettlementsService } from '../attendance/settlement.service';

const pointSchema = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).nullable().optional()
};

/** query 里的数字都是字符串，这里用 coerce；缺一个坐标就不做预判。 */
const queryPointSchema = {
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  accuracyM: z.coerce.number().min(0).max(100_000).optional()
};

/**
 * 员工自助 + 看板。权限刻意分开：
 * 打卡只需要 attendance:clock（店员有），看板需要 attendance:view（店长以上）。
 */
@Controller('attendance')
@UseGuards(StaffGuard, PermissionsGuard)
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly shifts: ShiftService,
    private readonly reports: AttendanceReportService,
    private readonly settlements: SettlementsService
  ) {}

  @Get('mine')
  @RequirePerm('attendance:clock')
  async mine(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ storeId: z.string().optional(), ...queryPointSchema }),
      query ?? {}
    );
    const point =
      input.lat != null && input.lng != null
        ? { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM ?? null }
        : null;
    return this.attendance.mine(staff, input.storeId, point);
  }

  /** 到店确认：坐标由服务端重算距离，前端传来的判断一律不信。 */
  @Post('clock-in')
  @RequirePerm('attendance:clock')
  async clockIn(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ storeId: z.string().min(1, '请选择门店'), ...pointSchema }),
      body
    );
    return this.attendance.clockIn(staff, input);
  }

  /** 离店确认：只记录坐标，不校验范围（见 service 注释）。 */
  @Post('clock-out')
  @RequirePerm('attendance:clock')
  async clockOut(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        lat: pointSchema.lat.nullable().optional(),
        lng: pointSchema.lng.nullable().optional(),
        accuracyM: pointSchema.accuracyM
      }),
      body ?? {}
    );
    return this.attendance.clockOut(staff, input);
  }

  @Post('requests/close')
  @RequirePerm('attendance:clock')
  async requestClose(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        sessionId: z.string().min(1),
        clockOutAt: z.number().int(),
        reason: z.string().max(200).optional()
      }),
      body
    );
    return this.attendance.requestClose(staff, {
      sessionId: input.sessionId,
      clockOutAtMs: input.clockOutAt,
      reason: input.reason ?? ''
    });
  }

  @Post('requests/backfill')
  @RequirePerm('attendance:clock')
  async requestBackfill(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        storeId: z.string().min(1, '请选择门店'),
        clockInAt: z.number().int(),
        clockOutAt: z.number().int(),
        reason: z.string().max(200).optional()
      }),
      body
    );
    return this.attendance.requestBackfill(staff, {
      storeId: input.storeId,
      clockInAtMs: input.clockInAt,
      clockOutAtMs: input.clockOutAt,
      reason: input.reason ?? ''
    });
  }

  @Post('requests/:id/cancel')
  @RequirePerm('attendance:clock')
  async cancelRequest(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.attendance.cancelRequest(staff, id);
  }

  @Get('board')
  @RequirePerm('attendance:view')
  async board(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      // storeId 不传表示「本人可见的全部门店」，供运营/区域岗位一次看全
      z.object({ storeId: z.string().min(1).optional(), date: z.string().optional() }),
      query
    );
    return this.attendance.board(staff, input);
  }

  // ---------- 排班（轻量：只管计划时段，不校验打卡） ----------

  /** 矩阵口径：人 × 天。不传日期默认本周（周一起算）。 */
  @Get('shifts')
  @RequirePerm('attendance:view')
  async shiftList(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        storeId: z.string().min(1).optional(),
        from: z.string().optional(),
        to: z.string().optional()
      }),
      query ?? {}
    );
    return this.shifts.list(staff, input);
  }

  /** 同一人同一天同店只有一条班：重复提交即覆盖，改动进操作日志。 */
  @Put('shifts')
  @RequirePerm('attendance:manage')
  async shiftSave(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        storeId: z.string().min(1, '请选择门店'),
        userId: z.string().min(1, '请选择员工'),
        businessDate: z.string().min(1, '请选择日期'),
        startMin: z.number().int('班次时间应为整分钟'),
        endMin: z.number().int('班次时间应为整分钟'),
        note: z.string().max(80).optional()
      }),
      body
    );
    return this.shifts.save(staff, input);
  }

  /** 清空某天的班：按 (门店, 员工, 日期) 删，前端不必先拿 id。 */
  @Delete('shifts')
  @RequirePerm('attendance:manage')
  async shiftRemove(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        storeId: z.string().min(1, '请选择门店'),
        userId: z.string().min(1, '请选择员工'),
        businessDate: z.string().min(1, '请选择日期')
      }),
      query ?? {}
    );
    return this.shifts.remove(staff, input);
  }

  // ---------- 考勤月报（只核工时，不含金额） ----------

  /** 月度核对：一人一行，附人×天明细；month 缺省为当月。 */
  @Get('report')
  @RequirePerm('attendance:view')
  async monthReport(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ storeId: z.string().min(1).optional(), month: z.string().optional() }),
      query ?? {}
    );
    return this.reports.month(staff, input);
  }

  // ---------- 劳务单价与月结（金额敏感，统一 attendance:settle） ----------

  /** 门店劳务单价：读得到的是「本人可见门店」，单价不随门店配置页外泄。 */
  @Get('labor-rates')
  @RequirePerm('attendance:settle')
  async laborRates(@Staff() staff: StaffContext) {
    return this.settlements.rates(staff);
  }

  @Put('labor-rates/:storeId')
  @RequirePerm('attendance:settle')
  async saveLaborRate(
    @Param('storeId') storeId: string,
    @Body() body: unknown,
    @Staff() staff: StaffContext
  ) {
    const input = parseInput(
      z.object({
        laborRatePerMinCents: z
          .number()
          .int('劳务单价应为整数（分/分钟）')
          .min(0, '劳务单价不能为负数')
          .max(MAX_LABOR_RATE_CENTS, '劳务单价超出上限，请确认单位是「分/分钟」'),
        note: z.string().max(80).optional()
      }),
      body
    );
    return this.settlements.saveRate(staff, storeId, input);
  }

  @Get('settlements')
  @RequirePerm('attendance:settle')
  async settlementsList(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ month: z.string().optional(), storeId: z.string().min(1).optional() }),
      query ?? {}
    );
    return this.settlements.list(staff, input);
  }

  /** 月结出单：不传 month 默认上一个月；草稿可反复重算，已入账的不动。 */
  @Post('settlements/generate')
  @RequirePerm('attendance:settle')
  async generateSettlements(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ month: z.string().optional(), storeId: z.string().min(1).optional() }),
      body ?? {}
    );
    return this.settlements.generate(staff, input);
  }

  /** 确认入账：调整额单独记录，金额 = 基础 + 调整；未闭合时段存在时硬阻断。 */
  @Post('settlements/:id/confirm')
  @RequirePerm('attendance:settle')
  async confirmSettlement(
    @Param('id') id: string,
    @Body() body: unknown,
    @Staff() staff: StaffContext
  ) {
    const input = parseInput(
      z.object({
        adjustmentCents: z.number().int('调整额应为整数（分）').optional(),
        adjustmentNote: z.string().max(200).optional(),
        note: z.string().max(200).optional()
      }),
      body ?? {}
    );
    return this.settlements.confirm(staff, id, input);
  }
}