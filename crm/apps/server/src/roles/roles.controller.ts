import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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

  @Post()
  @RequirePerm('crm:role:edit')
  create(
    @Body() body: { name?: unknown; description?: unknown; perms?: unknown },
    @Staff() staff: StaffContext
  ) {
    return this.roles.create(body, staff);
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
