import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { MembersService } from './members.service';
import { RequirePerm, Staff } from '../auth/decorators';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import type { StaffContext } from '../common/auth.types';

@Controller('members')
@UseGuards(StaffGuard, PermissionsGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePerm('crm:member:view')
  list(@Query('q') q?: string, @Query('business') business?: string) {
    return this.members.list({ q, business }).then((members) => ({ members }));
  }

  @Get(':id')
  @RequirePerm('crm:member:view')
  detail(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.members.detail(id, staff);
  }

  @Patch(':id/profile')
  @RequirePerm('crm:member:edit')
  updateProfile(
    @Param('id') id: string,
    @Body()
    body: {
      baseVersion: number;
      name?: string;
      gender?: number | null;
      birthday?: string | null;
      avatarUrl?: string | null;
    },
    @Staff() staff: StaffContext
  ) {
    return this.members.updateProfile(id, body, staff).then((member) => ({ member }));
  }
}
