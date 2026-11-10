import { Module } from '@nestjs/common';
import { GameModule } from '../game/game.module';
import { BrandMemberGuard } from '../brand-member/brand-member.guard';
import { ProgramAdminController, ProgramExternalController } from './program.controller';
import { ProgramService } from './program.service';
import { GiftQrService } from './gift-qr.service';
import { RetreatPaymentClient } from './retreat-payment.client';

@Module({
  imports: [GameModule],
  controllers: [ProgramExternalController, ProgramAdminController],
  providers: [ProgramService, GiftQrService, BrandMemberGuard, RetreatPaymentClient],
  exports: [ProgramService]
})
export class ProgramModule {}
