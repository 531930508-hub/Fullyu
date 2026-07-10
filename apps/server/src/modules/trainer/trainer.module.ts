import { Module } from '@nestjs/common'
import { TrainerService } from './trainer.service'
import { TrainerController } from './trainer.controller'

@Module({
  controllers: [TrainerController],
  providers: [TrainerService],
  exports: [TrainerService],
})
export class TrainerModule {}
