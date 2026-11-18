import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RequirePerm, Staff } from '../auth/decorators';
import { PermissionsGuard } from '../auth/permissions.guard';
import { StaffGuard } from '../auth/staff.guard';
import { hasPerm, type StaffContext } from '../common/auth.types';
import { forbidden } from '../common/errors';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(StaffGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@Staff() staff: StaffContext) {
    // 用户管理需要角色下拉，两个权限点任一即可读取。
    if (!hasPerm(staff, 'crm:role:edit') && !hasPerm(staff, 'crm:staff:edit')) {
      throw forbidden('当前账号没有该操作权限');
    }
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

  @Delete(':id')
  @RequirePerm('crm:role:edit')
  remove(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.roles.remove(id, staff);
  }
}
