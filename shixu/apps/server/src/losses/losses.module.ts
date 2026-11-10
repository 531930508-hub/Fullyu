import { Module } from '@nestjs/common';
import { LossesService } from './losses.service';

@Module({
  providers: [LossesService],
  exports: [LossesService]
})
export class LossesModule {}
