import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceSweeper } from './attendance.sweeper';

@Module({
  providers: [AttendanceService, AttendanceSweeper],
  exports: [AttendanceService]
})
export class AttendanceModule {}