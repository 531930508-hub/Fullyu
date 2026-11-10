import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { RequirePerm } from '../auth/decorators';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';

@Controller('points/ledger')
@UseGuards(StaffGuard, PermissionsGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  @RequirePerm('crm:member:view')
  list(
    @Query('memberId') memberId?: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('business') business?: string,
    @Query('ref') ref?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('size') size?: string
  ) {
    return this.ledger.query({ memberId, q, type, business, ref, from, to, page, size });
  }
}
