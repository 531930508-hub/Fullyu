import { Module } from '@nestjs/common'
import { OrderService } from './order.service'
import { OrderController } from './order.controller'
import { OrderAdminController } from './order-admin.controller'
import { EnrollmentService } from './enrollment.service'
import { OrderTasksService } from './order-tasks.service'
import { WaitlistModule } from '../waitlist/waitlist.module'
import { ApprovalModule } from '../approval/approval.module'
import { PaymentModule } from '../payment/payment.module'

@Module({
  imports: [WaitlistModule, ApprovalModule, PaymentModule],
  controllers: [OrderController, OrderAdminController],
  providers: [OrderService, EnrollmentService, OrderTasksService],
  exports: [OrderService, EnrollmentService],
})
export class OrderModule {}
