import { Module } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { OrdersModule } from '../orders/orders.module';
import { LossesModule } from '../losses/losses.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [OrdersModule, LossesModule, AttendanceModule],
  providers: [ApprovalsService],
  exports: [ApprovalsService]
})
export class ApprovalsModule {}
