import { Module } from '@nestjs/common';
import { GameModule } from '../game/game.module';
import { BrandMemberController } from './brand-member.controller';
import { BrandMemberGuard } from './brand-member.guard';
import { BrandMemberService } from './brand-member.service';
import { GameSessionController } from './game-session.controller';
import { GameSessionGuard } from './game-session.guard';

@Module({
  imports: [GameModule],
  controllers: [BrandMemberController, GameSessionController],
  providers: [BrandMemberService, BrandMemberGuard, GameSessionGuard]
})
export class BrandMemberModule {}
