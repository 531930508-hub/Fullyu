import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { BrandCardsService, type VersionInput } from './brand-cards.service';
import { RequirePerm, Staff } from '../auth/decorators';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import type { StaffContext } from '../common/auth.types';

@Controller('brand-cards')
@UseGuards(StaffGuard, PermissionsGuard)
export class BrandCardsController {
  constructor(private readonly cards: BrandCardsService) {}

  @Get()
  @RequirePerm('crm:card:view')
  async list() {
    return { products: await this.cards.list() };
  }

  @Get(':code')
  @RequirePerm('crm:card:view')
  detail(@Param('code') code: string) {
    return this.cards.detail(code);
  }

  @Post()
  @RequirePerm('crm:card:edit')
  create(
    @Body() body: { code?: string; name?: string; sort?: number },
    @Staff() staff: StaffContext
  ) {
    return this.cards.createProduct(body, staff);
  }

  @Post(':code/versions')
  @RequirePerm('crm:card:edit')
  createVersion(
    @Param('code') code: string,
    @Body() body: VersionInput,
    @Staff() staff: StaffContext
  ) {
    return this.cards.createVersion(code, body, staff);
  }

  @Post(':code/versions/:version/activate')
  @RequirePerm('crm:card:edit')
  activate(
    @Param('code') code: string,
    @Param('version', ParseIntPipe) version: number,
    @Staff() staff: StaffContext
  ) {
    return this.cards.activate(code, version, staff);
  }
}
