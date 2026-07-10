import { Module } from '@nestjs/common'
import { WaitlistService } from './waitlist.service'
import { WaitlistController } from './waitlist.controller'
import { WaitlistTasksService } from './waitlist-tasks.service'
import { PaymentModule } from '../payment/payment.module'

@Module({
  imports: [PaymentModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistTasksService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
