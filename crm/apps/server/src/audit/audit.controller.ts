import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { RequirePerm } from '../auth/decorators';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';

@Controller('audit')
@UseGuards(StaffGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePerm('crm:audit:view')
  async list(
    @Query('action') action?: string,
    @Query('actor') actor?: string,
    @Query('q') q?: string
  ) {
    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = { contains: action };
    if (actor) where.actorName = { contains: actor };
    if (q) {
      where.OR = [
        { detail: { contains: q } },
        { target: { contains: q } },
        { action: { contains: q } }
      ];
    }
    const logs = await this.prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, take: 100 });
    return { logs };
  }
}
