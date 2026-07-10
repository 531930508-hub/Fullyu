import { Controller, Post, Body, Param, Req, UseGuards } from '@nestjs/common'
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
  @ApiOperation({ summary: '创建微信 JSAPI 支付（返回小程序调起参数）' })
  async createPayment(@Req() req: any, @Param('orderId') orderId: string) {
    return this.paymentService.createPayment(orderId, req.user.userId)
  }

  @Post('notify')
  @Public()
  @SkipTransform()
  @ApiOperation({ summary: '微信支付结果回调' })
  async notify(@Req() req: any) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body)
    return this.paymentService.handleNotify(rawBody)
  }

  @Post('refund-notify')
  @Public()
  @SkipTransform()
  @ApiOperation({ summary: '微信退款结果回调' })
  async refundNotify(@Req() req: any) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body)
    return this.paymentService.handleRefundNotify(rawBody)
  }
}
