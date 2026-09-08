import { Module, forwardRef } from '@nestjs/common'
import { PaymentService } from './payment.service'
import { PaymentController } from './payment.controller'
import { HuifuPayService } from './huifu-pay.service'
import { WaitlistModule } from '../waitlist/waitlist.module'

@Module({
  imports: [forwardRef(() => WaitlistModule)],
  controllers: [PaymentController],
  providers: [PaymentService, HuifuPayService],
  exports: [PaymentService, HuifuPayService],
})
export class PaymentModule {}
