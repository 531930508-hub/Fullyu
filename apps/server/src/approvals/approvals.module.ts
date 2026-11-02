import { Module } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { OrdersModule } from '../orders/orders.module';
import { LossesModule } from '../losses/losses.module';

@Module({
  imports: [OrdersModule, LossesModule],
  providers: [ApprovalsService],
  exports: [ApprovalsService]
})
export class ApprovalsModule {}
