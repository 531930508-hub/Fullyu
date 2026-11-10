import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { RequirePerm, Staff } from '../auth/decorators';
import { PermissionsGuard } from '../auth/permissions.guard';
import { StaffGuard } from '../auth/staff.guard';
import type { StaffContext } from '../common/auth.types';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(StaffGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePerm('crm:role:edit')
  list() {
    return this.roles.list();
  }

  @Patch(':id')
  @RequirePerm('crm:role:edit')
  update(
    @Param('id') id: string,
    @Body() body: { perms?: string[] },
    @Staff() staff: StaffContext
  ) {
    return this.roles.update(id, body, staff);
  }
}
