import { Module } from '@nestjs/common'
import { CourseService } from './course.service'
import { CourseController } from './course.controller'
import { CourseTasksService } from './course-tasks.service'
import { CourseWishService } from './course-wish.service'
import { CourseWishController } from './course-wish.controller'
import { SettlementModule } from '../settlement/settlement.module'
import { PaymentModule } from '../payment/payment.module'

@Module({
  imports: [SettlementModule, PaymentModule],
  controllers: [CourseController, CourseWishController],
  providers: [CourseService, CourseTasksService, CourseWishService],
  exports: [CourseService],
})
export class CourseModule {}
