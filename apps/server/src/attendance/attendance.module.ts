import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { SettlementsService } from './settlement.service';
import { AttendanceSweeper } from './attendance.sweeper';

@Module({
  providers: [AttendanceService, AttendanceSweeper, SettlementsService],
  exports: [AttendanceService, SettlementsService]
})
export class AttendanceModule {}