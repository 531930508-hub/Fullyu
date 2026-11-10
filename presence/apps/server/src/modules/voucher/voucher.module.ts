import { Module } from '@nestjs/common'
import { VoucherService } from './voucher.service'
import { VoucherController } from './voucher.controller'
import { ApprovalModule } from '../approval/approval.module'

@Module({
  imports: [ApprovalModule],
  controllers: [VoucherController],
  providers: [VoucherService],
})
export class VoucherModule {}
