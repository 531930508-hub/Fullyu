import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { DailySweepService } from './daily-sweep';
import { PrintingService } from '../printing/printing.service';
import { FinanceModule } from '../finance/finance.module';
import { HardwareModule } from '../hardware/hardware.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [FinanceModule, HardwareModule, CouponsModule],
  providers: [OrdersService, PrintingService, DailySweepService],
  exports: [OrdersService, PrintingService]
})
export class OrdersModule {}
