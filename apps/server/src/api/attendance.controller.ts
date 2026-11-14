import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerm, Staff } from '../auth/decorators';
import { parseInput } from '../common/zod';
import type { StaffContext } from '../common/auth.types';
import { AttendanceService } from '../attendance/attendance.service';

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
  constructor(private readonly attendance: AttendanceService) {}

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
}