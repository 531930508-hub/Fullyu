import type {
  DeviceStatus,
  PaymentGateway,
  PaymentRequest,
  PaymentResult,
  RefundRequest
} from '../../contracts';
import { wait } from './util';

/**
 * 内置支付实现：不产生任何真实扣款，也不接收回调。
 *
 * 真实实现（微信支付 / 支付宝 / 聚合支付）要点：
 * - charge：微信 JSAPI 下单拿 prepay_id，或当面付刷码；必须校验金额与门店商户号。
 * - refund：按原支付单号退款，部分退款要累加金额，不能超过原单。
 * - handleCallback：用原始请求体验签，幂等地把「已支付」结果交回业务层（reference = 我们的 orderId）。
 */
export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock-payment';
  readonly mode = 'mock';
  private failNext = false;

  /** 自检用：让下一次扣款失败，验证失败落库与重试提示。 */
  simulateFailure(): void {
    this.failNext = true;
  }

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    await wait(15);
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, error: '支付未完成，请重试' };
    }
    // 与真实渠道一致：同一 reference（商户订单号）的扣款幂等，返回同一渠道单号。
    // 并发重发或超时重试时，业务层依靠它收敛，不会对同一订单扣两次款。
    return { ok: true, providerRef: `PAY-${request.reference}`, paidAt: Date.now() };
  }

  async refund(request: RefundRequest): Promise<PaymentResult> {
    await wait(10);
    return { ok: true, providerRef: `REF-${request.reference}-${Date.now()}`, paidAt: Date.now() };
  }

  async status(): Promise<DeviceStatus> {
    return { online: true, mode: this.mode, detail: '适配层已就绪，尚未配置微信/支付宝商户' };
  }
}
