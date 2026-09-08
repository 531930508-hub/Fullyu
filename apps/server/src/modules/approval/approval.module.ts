import { Module } from '@nestjs/common'
import { ApprovalService } from './approval.service'
import { ApprovalFlowService } from './approval-flow.service'
import { ApprovalController } from './approval.controller'
import { PaymentModule } from '../payment/payment.module'
import { StockModule } from '../scm/stock.service'

/**
 * 审批流引擎模块：全系统单据共用一套流程配置与推进逻辑。
 *
 * 依赖方向刻意做成单向 —— 引擎依赖 PaymentModule（强制退款）与 StockModule（库存调整生效），
 * 业务模块再依赖引擎发起审批，避免与进销存互相 import 形成环。
 * 导出 ApprovalService 供 Voucher / Order / Scm / Finance 模块发起审批。
 */
@Module({
  imports: [PaymentModule, StockModule],
  controllers: [ApprovalController],
  providers: [ApprovalService, ApprovalFlowService],
  exports: [ApprovalService, ApprovalFlowService],
})
export class ApprovalModule {}
