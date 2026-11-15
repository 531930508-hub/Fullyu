import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { SettlementsService } from './settlement.service';
import { ShiftService } from './shift.service';
import { AttendanceReportService } from './report.service';
import { AttendanceSweeper } from './attendance.sweeper';

@Module({
  providers: [AttendanceService, AttendanceSweeper, SettlementsService, ShiftService, AttendanceReportService],
  exports: [AttendanceService, SettlementsService, ShiftService, AttendanceReportService]
})
export class AttendanceModule {}