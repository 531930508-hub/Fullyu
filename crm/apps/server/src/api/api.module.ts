import { Controller, Get, Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { PointsModule } from '../points/points.module';
import { AuditModule } from '../audit/audit.module';
import { CardsModule } from '../cards/cards.module';
import { ExternalModule } from '../external/external.module';
import { BrandMemberModule } from '../brand-member/brand-member.module';
import { GameModule } from '../game/game.module';
import { ReportsModule } from '../reports/reports.module';
import { SyncModule } from '../sync/sync.module';
import { RolesModule } from '../roles/roles.module';
import { ProgramModule } from '../program/program.module';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'crm' };
  }
}

@Module({
  imports: [MembersModule, PointsModule, AuditModule, CardsModule, ExternalModule, GameModule, ReportsModule, SyncModule, RolesModule, BrandMemberModule, ProgramModule],
  controllers: [HealthController]
})
export class ApiModule {}
