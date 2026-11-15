import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ContentModule } from '../content/content.module';
import { CouponsModule } from '../coupons/coupons.module';
import { CrmModule } from '../crm/crm.module';
import { FinanceModule } from '../finance/finance.module';
import { LossesModule } from '../losses/losses.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminController } from './admin.controller';
import { AttendanceController } from './attendance.controller';
import { CustomerBrandMemberController, PublicBrandMemberController } from './customer-brand-member.controller';
import { CustomerController } from './customer.controller';
import { HealthController } from './health.controller';
import { CrmWebhookController } from './crm-webhook.controller';
import { HooksController } from './hooks.controller';
import { PrintAgentController } from './print-agent.controller';
import { StoreController } from './store.controller';

@Module({
  imports: [
    AdminModule,
    ApprovalsModule,
    AttendanceModule,
    CatalogModule,
    ContentModule,
    CouponsModule,
    CrmModule,
    FinanceModule,
    LossesModule,
    OrdersModule
  ],
  controllers: [
    AdminController,
    AttendanceController,
    CustomerController,
    CustomerBrandMemberController,
    PublicBrandMemberController,
    StoreController,
    PrintAgentController,
    HealthController,
    HooksController,
    CrmWebhookController
  ]
})
export class ApiModule {}
