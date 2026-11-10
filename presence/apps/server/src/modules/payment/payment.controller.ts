import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { PaymentService } from './payment.service'
import { Public } from '../../common/decorators/public.decorator'
import { SkipTransform } from '../../common/decorators/skip-transform.decorator'

@ApiTags('支付')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('jsapi/:orderId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建汇付聚合支付（返回小程序调起参数）' })
  async createPayment(@Req() req: any, @Param('orderId') orderId: string) {
    return this.paymentService.createPayment(orderId, req.user.userId)
  }

  @Get('status/:orderId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询本人订单支付状态（小程序支付结果确认）' })
  async status(@Req() req: any, @Param('orderId') orderId: string) {
    return this.paymentService.queryStatus(orderId, req.user.userId)
  }

  @Post('notify')
  @Public()
  @SkipTransform()
  @ApiOperation({ summary: '汇付支付结果回调' })
  async notify(@Req() req: any) {
    return this.paymentService.handleNotify(this.rawForm(req))
  }

  @Post('refund-notify')
  @Public()
  @SkipTransform()
  @ApiOperation({ summary: '汇付退款结果回调' })
  async refundNotify(@Req() req: any) {
    return this.paymentService.handleRefundNotify(this.rawForm(req))
  }

  /** 汇付回调为 form 提交；优先取原始报文，降级时由已解析 body 重建 */
  private rawForm(req: any): string {
    if (req.rawBody) return req.rawBody.toString('utf8')
    return new URLSearchParams(req.body ?? {}).toString()
  }
}
