import { Module, forwardRef } from '@nestjs/common'
import { PaymentService } from './payment.service'
import { PaymentController } from './payment.controller'
import { HuifuPayService } from './huifu-pay.service'
import { RefundReconcileTasksService } from './refund-reconcile.tasks.service'
import { WaitlistModule } from '../waitlist/waitlist.module'
import { MemberModule } from '../member/member.module'

@Module({
  imports: [forwardRef(() => WaitlistModule), MemberModule],
  controllers: [PaymentController],
  providers: [PaymentService, HuifuPayService, RefundReconcileTasksService],
  exports: [PaymentService, HuifuPayService],
})
export class PaymentModule {}
