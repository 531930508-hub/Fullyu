import { Module } from '@nestjs/common';
import { QueueController, SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [SyncController, QueueController],
  providers: [SyncService],
  exports: [SyncService]
})
export class SyncModule {}
