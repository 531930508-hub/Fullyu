import type {
  DeviceStatus,
  PaymentCallback,
  PaymentCallbackResult,
  PaymentGateway,
  PaymentRequest,
  PaymentResult,
  RefundRequest
} from '../../contracts';

/**
 * 真实支付渠道的骨架示例（不会被注册、也不参与运行）。
 *
 * 接真实支付时：复制本文件为 payment.wechat.ts / payment.alipay.ts，
 * 按厂商文档补全方法体，再到 ../live/index.ts 注册即生效。
 *
 * 实现时必须满足：
 * 1. charge 校验金额、门店商户号、订单号，禁止客户端传入金额直接透传；
 * 2. refund 记录每次退款金额，累计不得超过原支付金额；
 * 3. handleCallback 用 rawBody 验签，幂等（同一回调重复到达只落账一次），
 *    只返回 reference（业务侧 orderId），由业务层决定改单；
 * 4. 任何签名 / 金额校验失败都返回 ok:false，不要抛异常给业务层。
 */
export class WechatPayGatewayExample implements PaymentGateway {
  readonly name = 'example-wechat-pay';
  readonly mode = 'live';

  async charge(_request: PaymentRequest): Promise<PaymentResult> {
    throw new Error('示例实现：请按微信支付 JSAPI 文档补全 charge');
  }

  async refund(_request: RefundRequest): Promise<PaymentResult> {
    throw new Error('示例实现：请按微信支付退款文档补全 refund');
  }

  async status(): Promise<DeviceStatus> {
    return { online: false, mode: this.mode, detail: '示例实现未接入' };
  }

  async handleCallback(_request: PaymentCallback): Promise<PaymentCallbackResult> {
    throw new Error('示例实现：请用 rawBody 验签后返回 reference');
  }
}
