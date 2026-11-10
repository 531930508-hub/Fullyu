import { Module } from '@nestjs/common';
import { PointsService } from './points.service';
import { AdjustmentsService } from './adjustments.service';
import { AdjustmentsController } from './adjustments.controller';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';

@Module({
  controllers: [AdjustmentsController, LedgerController],
  providers: [PointsService, AdjustmentsService, LedgerService],
  exports: [PointsService, AdjustmentsService, LedgerService]
})
export class PointsModule {}
