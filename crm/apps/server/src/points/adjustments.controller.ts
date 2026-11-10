import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { AdjustmentsService, type BatchInput, type SingleInput } from './adjustments.service';
import { RequirePerm, Staff } from '../auth/decorators';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { hasPerm, type StaffContext } from '../common/auth.types';
import { forbidden } from '../common/errors';

@Controller('adjustments')
@UseGuards(StaffGuard, PermissionsGuard)
export class AdjustmentsController {
  constructor(private readonly adjustments: AdjustmentsService) {}

  @Post()
  @RequirePerm('crm:adjust:create')
  create(
    @Body() body: SingleInput,
    @Staff() staff: StaffContext,
    @Headers('idempotency-key') idemKey?: string
  ) {
    return this.adjustments.createSingle(body, staff, idemKey);
  }

  @Post('batch')
  @RequirePerm('crm:adjust:batch')
  batch(
    @Body() body: BatchInput,
    @Staff() staff: StaffContext,
    @Headers('idempotency-key') idemKey?: string
  ) {
    return this.adjustments.createBatch(body, staff, idemKey);
  }

  @Get()
  list(@Staff() staff: StaffContext) {
    this.assertRead(staff);
    return this.adjustments.list();
  }

  @Get(':id')
  detail(@Param('id') id: string, @Staff() staff: StaffContext) {
    this.assertRead(staff);
    return this.adjustments.detail(id);
  }

  @Post(':id/approve')
  @RequirePerm('crm:adjust:approve')
  approve(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @Staff() staff: StaffContext
  ) {
    return this.adjustments.decide(id, 'approve', body?.comment || '', staff);
  }

  @Post(':id/reject')
  @RequirePerm('crm:adjust:approve')
  reject(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @Staff() staff: StaffContext
  ) {
    return this.adjustments.decide(id, 'reject', body?.comment || '', staff);
  }

  private assertRead(staff: StaffContext) {
    if (!hasPerm(staff, 'crm:adjust:create') && !hasPerm(staff, 'crm:adjust:approve')) {
      throw forbidden('当前账号没有查看调整单的权限');
    }
  }
}
