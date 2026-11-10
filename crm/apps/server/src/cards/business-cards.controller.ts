import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { BusinessCardsService, type BusinessCardUpdate } from './business-cards.service';
import { RequirePerm, Staff } from '../auth/decorators';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import type { StaffContext } from '../common/auth.types';

@Controller('business-cards')
@UseGuards(StaffGuard, PermissionsGuard)
export class BusinessCardsController {
  constructor(private readonly cards: BusinessCardsService) {}

  @Get()
  @RequirePerm('crm:card:view')
  async list(@Query('business') business?: string) {
    return { cards: await this.cards.list(business) };
  }

  @Patch(':business/:cardCode')
  @RequirePerm('crm:card:edit')
  update(
    @Param('business') business: string,
    @Param('cardCode') cardCode: string,
    @Body() body: BusinessCardUpdate,
    @Staff() staff: StaffContext
  ) {
    return this.cards.update(business, cardCode, body, staff);
  }
}
