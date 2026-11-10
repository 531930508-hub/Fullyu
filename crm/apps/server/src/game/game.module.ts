import { Module } from '@nestjs/common';
import { BrandMemberGuard } from '../brand-member/brand-member.guard';
import { GameAdminController, GameExternalController } from './game.controller';
import { GameService } from './game.service';
import { RulesService } from './rules.service';

@Module({
  controllers: [GameExternalController, GameAdminController],
  providers: [GameService, RulesService, BrandMemberGuard],
  exports: [GameService, RulesService]
})
export class GameModule {}
