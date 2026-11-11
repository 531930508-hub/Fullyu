import { Controller, Get, Post, Param, Body, Query, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { OrderService } from './order.service'
import { ApprovalService } from '../approval/approval.service'
import { PaymentService } from '../payment/payment.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { BusinessException } from '../../common/exceptions/business.exception'

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

  @Get(':id/refunds')
  @AdminAuth('order:view')
  @ApiOperation({ summary: '订单退款台账（累计已退/剩余可退/各次流水）' })
  async refundSummary(@Param('id') id: string) {
    return this.paymentService.refundSummary(id)
  }

  @Post(':id/refunds/:refundId/retry')
  @AdminAuth('order:refund')
  @ApiOperation({ summary: '重试结果待确认的退款流水（同一流水号，网关幂等）' })
  async retryRefund(
    @Request() req: any,
    @Param('id') id: string,
    @Param('refundId') refundId: string,
  ) {
    return this.paymentService.retryRefund(id, refundId, {
      id: req.user?.adminId,
      name: req.user?.name || req.user?.username,
    })
  }

  @Post(':id/refunds/:refundId/confirm-failed')
  @AdminAuth('order:refund')
  @ApiOperation({ summary: '人工确认该笔退款未发生（对账后作废流水，可重新发起）' })
  async confirmRefundFailed(
    @Param('id') id: string,
    @Param('refundId') refundId: string,
  ) {
    return this.paymentService.confirmRefundFailed(id, refundId)
  }

  @Post(':id/refunds/:refundId/query')
  @AdminAuth('order:refund')
  @ApiOperation({ summary: '主动向网关查询退款结果（回调丢失时使用，查到即按回调口径结算）' })
  async queryRefund(@Param('id') id: string, @Param('refundId') refundId: string) {
    return this.paymentService.queryRefundStatus(id, refundId)
  }

  @Post(':id/refund-query')
  @AdminAuth('order:refund')
  @ApiOperation({ summary: '主动查询旧版退款（改造前未落流水，按订单定位）' })
  async queryLegacyRefund(@Param('id') id: string) {
    return this.paymentService.queryRefundStatus(id)
  }

  @Post(':id/refund-confirm-failed')
  @AdminAuth('order:refund')
  @ApiOperation({ summary: '人工确认旧版退款未发生（无流水时按订单作废，可重新发起）' })
  async confirmLegacyRefundFailed(@Param('id') id: string) {
    return this.paymentService.confirmRefundFailed(id)
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
    // 提交前先按退款台账拦截：退款处理中或已退完的订单不允许再发起
    const summary = await this.paymentService.refundSummary(id)
    if (!summary.canForceRefund) {
      throw new BusinessException('该订单当前不可发起强制退款（退款处理中或可退金额已退完）', 4026)
    }
    if (amount > 0 && Math.round(amount * 100) > summary.remainingFen) {
      throw new BusinessException(
        `退款金额超过可退金额（可退 ¥${(summary.remainingFen / 100).toFixed(2)}）`,
        4026,
      )
    }
    // 审批必须按「实际退款金额」路由：不填金额时 amount=0 表示退剩余全部，
    // 若直接拿 0 去匹配流程，会命中最低档规则甚至无规则免审，大额退款等于绕过审批。
    const routeAmount = amount > 0 ? amount : summary.remainingFen / 100
    const operator = { id: req.user?.adminId, name: req.user?.name || req.user?.username }
    const approval = await this.approvalService.submit({
      bizType: 'ORDER_FORCE_REFUND',
      bizId: id,
      summary: `强制退款：订单 ${id}${amount > 0 ? ` 退 ¥${amount}` : ` 退剩余全部 ¥${routeAmount.toFixed(2)}`}（${reason}）`,
      amount: routeAmount,
      payload: { orderId: id, refundAmount: amount, reason },
      requesterId: req.user.adminId,
    })
    if (approval) {
      return { pendingApproval: true, approvalId: approval.id }
    }
    return this.paymentService.forceRefund(id, amount || undefined, reason, operator)
  }
}
