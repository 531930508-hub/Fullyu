import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePerm } from '../auth/decorators';
import { PermissionsGuard } from '../auth/permissions.guard';
import { StaffGuard } from '../auth/staff.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(StaffGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('monthly')
  @RequirePerm('crm:report:view')
  monthly(@Query('month') month?: string) {
    return this.reports.monthly(month);
  }
}
