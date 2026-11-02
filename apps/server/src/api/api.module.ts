import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CouponsModule } from '../coupons/coupons.module';
import { FinanceModule } from '../finance/finance.module';
import { LossesModule } from '../losses/losses.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminController } from './admin.controller';
import { CustomerController } from './customer.controller';
import { HealthController } from './health.controller';
import { HooksController } from './hooks.controller';
import { StoreController } from './store.controller';

@Module({
  imports: [AdminModule, ApprovalsModule, CatalogModule, CouponsModule, FinanceModule, LossesModule, OrdersModule],
  controllers: [AdminController, CustomerController, StoreController, HealthController, HooksController]
})
export class ApiModule {}
