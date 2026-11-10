import { Module } from '@nestjs/common'
import { CourseService } from './course.service'
import { CourseController } from './course.controller'
import { CourseTasksService } from './course-tasks.service'
import { SettlementModule } from '../settlement/settlement.module'
import { PaymentModule } from '../payment/payment.module'

@Module({
  imports: [SettlementModule, PaymentModule],
  controllers: [CourseController],
  providers: [CourseService, CourseTasksService],
  exports: [CourseService],
})
export class CourseModule {}
