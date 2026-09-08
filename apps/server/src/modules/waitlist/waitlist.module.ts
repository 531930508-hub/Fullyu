import { Module, forwardRef } from '@nestjs/common'
import { WaitlistService } from './waitlist.service'
import { WaitlistController } from './waitlist.controller'
import { WaitlistAdminController } from './waitlist-admin.controller'
import { WaitlistTasksService } from './waitlist-tasks.service'
import { PaymentModule } from '../payment/payment.module'

@Module({
  imports: [forwardRef(() => PaymentModule)],
  controllers: [WaitlistController, WaitlistAdminController],
  providers: [WaitlistService, WaitlistTasksService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
