import { Module } from '@nestjs/common'
import { TrainerService } from './trainer.service'
import { TrainerController } from './trainer.controller'
import { TrainerLevelService } from './trainer-level.service'
import { TrainerLevelController } from './trainer-level.controller'

@Module({
  controllers: [TrainerController, TrainerLevelController],
  providers: [TrainerService, TrainerLevelService],
  exports: [TrainerService],
})
export class TrainerModule {}
