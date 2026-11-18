import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RequirePerm, Staff } from '../auth/decorators';
import { PermissionsGuard } from '../auth/permissions.guard';
import { StaffGuard } from '../auth/staff.guard';
import type { StaffContext } from '../common/auth.types';
import { StaffAdminService } from './staff-admin.service';

@Controller('staff')
@UseGuards(StaffGuard, PermissionsGuard)
@RequirePerm('crm:staff:edit')
export class StaffController {
  constructor(private readonly staffAdmin: StaffAdminService) {}

  @Get()
  list() {
    return this.staffAdmin.list();
  }

  @Post()
  create(
    @Body()
    body: { name?: unknown; username?: unknown; password?: unknown; roleIds?: unknown; active?: unknown },
    @Staff() staff: StaffContext
  ) {
    return this.staffAdmin.create(body, staff);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: unknown; roleIds?: unknown; active?: unknown },
    @Staff() staff: StaffContext
  ) {
    return this.staffAdmin.update(id, body, staff);
  }

  @Post(':id/password')
  resetPassword(
    @Param('id') id: string,
    @Body() body: { password?: unknown },
    @Staff() staff: StaffContext
  ) {
    return this.staffAdmin.resetPassword(id, body, staff);
  }
}