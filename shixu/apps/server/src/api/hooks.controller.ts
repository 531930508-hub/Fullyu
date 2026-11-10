import { Body, Controller, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { badRequest, notFound, notImplemented } from '../common/errors';
import { HardwareService } from '../hardware/hardware.module';
import { OrdersService } from '../orders/orders.service';

type RawBodyRequest = Request & { rawBody?: string };

/**
 * 外部渠道主动回调的唯一入口。
 *
 * 验签、解密全部由 packages/integrations 里的支付实现完成；
 * 这里只做三件事：把原始请求交给渠道实现、用业务规则核对金额/商户后落账、按渠道要求应答。
 *
 * 回调地址按渠道实现名拼接：POST /api/hooks/payment/{provider.name}
 */
@Controller('hooks')
export class HooksController {
  constructor(
    private readonly hardware: HardwareService,
    private readonly orders: OrdersService
  ) {}

  @Post('payment/:provider')
  @HttpCode(200)
  async payment(
    @Param('provider') provider: string,
    @Body() body: unknown,
    @Req() req: RawBodyRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    const gateway = this.hardware.payment;
    if (provider !== gateway.name) {
      throw notFound(`未接入的支付渠道：${provider}（当前为 ${gateway.name}）`);
    }
    if (!gateway.handleCallback) {
      throw notImplemented(`支付渠道 ${gateway.name} 未实现回调处理`);
    }
    const result = await gateway.handleCallback({
      headers: req.headers as Record<string, string | string[] | undefined>,
      rawBody: req.rawBody ?? '',
      body
    });
    // 验签失败必须非 2xx：渠道会据此重试，也避免把伪造通知当成已处理。
    if (!result.ok) throw badRequest(result.error || '回调校验未通过');
    // 汇付等渠道要求成功时原样应答纯文本 success，否则会持续重发。
    const ack = gateway.callbackAck;
    if (ack) res.type('text/plain; charset=utf-8');

    if (result.kind === 'refund') {
      // 退款结果、对账单等通知类回调：没有待落账的支付单。
      if (!result.reference || !result.refundStatus) return ack || { ok: true, applied: false };
      const outcome = await this.orders.applyRefundCallback({
        reference: result.reference,
        providerRef: result.providerRef,
        amountCents: result.amountCents,
        merchantId: result.merchantId,
        status: result.refundStatus,
        error: result.error
      });
      if (ack) return ack;
      return { ok: true, kind: 'refund', applied: outcome === 'succeeded', status: outcome };
    }

    if (!result.reference) return ack || { ok: true, applied: false };
    const outcome = await this.orders.settlePaymentCallback({
      reference: result.reference,
      providerRef: result.providerRef,
      amountCents: result.amountCents,
      merchantId: result.merchantId,
      // 旧渠道只返回 reference 表示支付成功；新渠道会显式给出 status。
      status: result.status || 'paid',
      error: result.error
    });
    if (ack) return ack;
    if (outcome === 'blocked-cancelled') {
      return {
        ok: true,
        applied: false,
        blocked: '订单已取消，迟到支付成功未落账，资金待人工退款/对账'
      };
    }
    return { ok: true, applied: outcome === 'applied' || outcome === 'duplicate' };
  }
}
