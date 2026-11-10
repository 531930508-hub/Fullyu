import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RequirePerm, Staff } from '../auth/decorators';
import { PermissionsGuard } from '../auth/permissions.guard';
import { StaffGuard } from '../auth/staff.guard';
import type { StaffContext } from '../common/auth.types';
import { SyncService } from './sync.service';

@Controller('sync')
@UseGuards(StaffGuard, PermissionsGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('status')
  @RequirePerm('crm:sync:view')
  status() {
    return this.sync.status();
  }

  @Get('events')
  @RequirePerm('crm:sync:view')
  events(
    @Query('status') status?: string,
    @Query('business') business?: string,
    @Query('limit') limit?: string
  ) {
    return this.sync.events({ status, business, limit });
  }

  @Post('run')
  @HttpCode(200)
  @RequirePerm('crm:sync:retry')
  run() {
    return this.sync.deliverDue();
  }

  @Post('events/:id/retry')
  @HttpCode(200)
  @RequirePerm('crm:sync:retry')
  retry(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.sync.retryEvent(id, staff);
  }
}

@Controller('queue')
@UseGuards(StaffGuard, PermissionsGuard)
export class QueueController {
  constructor(private readonly sync: SyncService) {}

  @Get()
  @RequirePerm('crm:queue:handle')
  list() {
    return this.sync.queue();
  }

  @Post(':id/retry')
  @HttpCode(200)
  @RequirePerm('crm:queue:handle')
  retry(@Param('id') id: string, @Staff() staff: StaffContext, @Body() _body: unknown) {
    return this.sync.retryEvent(id, staff, true);
  }
}
