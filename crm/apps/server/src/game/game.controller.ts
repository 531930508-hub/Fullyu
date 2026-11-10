import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  BrandMemberGuard,
  type BrandMemberRequest
} from '../brand-member/brand-member.guard';
import { RequirePerm, Staff } from '../auth/decorators';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import type { StaffContext } from '../common/auth.types';
import { GameService, type EarnInput, type RefundInput, type RollInput } from './game.service';
import { RulesService } from './rules.service';

/** 三端愈行之旅：会话、掷骰、得骰与退款收回。 */
@Controller('v1/brand-member')
@UseGuards(BrandMemberGuard)
export class GameExternalController {
  constructor(private readonly game: GameService) {}

  @Get('game')
  session(@Query() query: { business?: string; localUserId?: string }, @Req() req: BrandMemberRequest) {
    return this.game.session(query, req.fy!);
  }

  @Post('game/roll')
  @HttpCode(201)
  roll(
    @Body() body: RollInput,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: BrandMemberRequest
  ) {
    return this.game.roll(body, req.fy!, idempotencyKey);
  }

  @Post('dice/earn')
  @HttpCode(200)
  earn(@Body() body: EarnInput, @Req() req: BrandMemberRequest) {
    return this.game.earn(body, req.fy!);
  }

  @Post('dice/refund')
  @HttpCode(200)
  refund(@Body() body: RefundInput, @Req() req: BrandMemberRequest) {
    return this.game.refund(body, req.fy!);
  }
}

/** CRM 后台：规则版本与礼物交付。 */
@Controller()
@UseGuards(StaffGuard, PermissionsGuard)
export class GameAdminController {
  constructor(
    private readonly rules: RulesService,
    private readonly game: GameService
  ) {}

  @Get('rules')
  @RequirePerm('crm:config:edit')
  listRules() {
    return this.rules.list();
  }

  @Post('rules/:key/versions')
  @RequirePerm('crm:config:edit')
  createVersion(
    @Param('key') key: string,
    @Body() body: Record<string, unknown>,
    @Staff() staff: StaffContext
  ) {
    return this.rules.createVersion(key, body, staff);
  }

  @Post('rules/:key/versions/:version/cancel')
  @HttpCode(200)
  @RequirePerm('crm:config:edit')
  cancelVersion(
    @Param('key') key: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: Record<string, unknown>,
    @Staff() staff: StaffContext
  ) {
    return this.rules.cancelVersion(key, version, body, staff);
  }

  @Get('game/prizes')
  @RequirePerm('crm:member:view')
  prizes(@Query('status') status?: string) {
    return this.game.listPrizes(status);
  }

  @Post('game/prizes/:id/collect')
  @HttpCode(200)
  @RequirePerm('crm:member:edit')
  collect(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Staff() staff: StaffContext
  ) {
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) : '';
    return this.game.collectPrize(id, note, staff);
  }
}
