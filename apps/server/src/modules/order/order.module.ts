import { Module } from '@nestjs/common'
import { OrderService } from './order.service'
import { OrderController } from './order.controller'
import { OrderAdminController } from './order-admin.controller'
import { EnrollmentService } from './enrollment.service'
import { OrderTasksService } from './order-tasks.service'
import { WaitlistModule } from '../waitlist/waitlist.module'

@Module({
  imports: [WaitlistModule],
  controllers: [OrderController, OrderAdminController],
  providers: [OrderService, EnrollmentService, OrderTasksService],
  exports: [OrderService, EnrollmentService],
})
export class OrderModule {}
