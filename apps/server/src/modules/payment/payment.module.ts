import { Module } from '@nestjs/common'
import { PaymentService } from './payment.service'
import { PaymentController } from './payment.controller'
import { WechatPayService } from './wechat-pay.service'

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, WechatPayService],
  exports: [PaymentService, WechatPayService],
})
export class PaymentModule {}
