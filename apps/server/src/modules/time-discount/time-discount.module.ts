import { Module } from '@nestjs/common'
import { TimeDiscountService } from './time-discount.service'
import { TimeDiscountController } from './time-discount.controller'

@Module({
  controllers: [TimeDiscountController],
  providers: [TimeDiscountService],
})
export class TimeDiscountModule {}
