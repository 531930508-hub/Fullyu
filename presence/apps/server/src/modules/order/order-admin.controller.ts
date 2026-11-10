import { Controller, Get, Post, Param, Body, Query, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { OrderService } from './order.service'
import { ApprovalService } from '../approval/approval.service'
import { PaymentService } from '../payment/payment.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('订单（后台）')
@Controller('order-admin')
export class OrderAdminController {
  constructor(
    private readonly orderService: OrderService,
    private readonly approvalService: ApprovalService,
    private readonly paymentService: PaymentService,
  ) {}

  @Get()
  @AdminAuth('order:view')
  @ApiOperation({ summary: '后台订单列表' })
  async list(
    @Query('status') status?: string,
    @Query('orderType') orderType?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.orderService.adminList({ status, orderType, keyword })
  }

  @Post(':id/force-refund')
  @AdminAuth('order:refund')
  @ApiOperation({ summary: '强制退款（客诉特殊处理，经二次审批）' })
  async forceRefund(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { amount?: number; reason?: string },
  ) {
    const amount = body?.amount && body.amount > 0 ? Number(body.amount) : 0
    const reason = body?.reason || '强制退款'
    const summary = `强制退款：订单 ${id}${amount > 0 ? ` 退 ¥${amount}` : ' 全额退'}（${reason}）`
    const approval = await this.approvalService.submit({
      bizType: 'ORDER_FORCE_REFUND',
      summary,
      amount,
      payload: { orderId: id, refundAmount: amount, reason },
      requesterId: req.user.adminId,
    })
    if (approval) {
      return { pendingApproval: true, approvalId: approval.id }
    }
    return this.paymentService.forceRefund(id, amount || undefined, reason)
  }
}
