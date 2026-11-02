import type {
  BrewCommand,
  BrewResult,
  DeviceStatus,
  LabelPrinter,
  MemberBenefit,
  MemberProvider,
  PaymentGateway,
  PaymentRequest,
  PaymentResult,
  PlatformConnector,
  PlatformOrder,
  PrintJobPayload,
  PrintResult,
  RefundRequest,
  TeaMachineAdapter
} from './contracts.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mock 云标签打印驱动。
 * 真实驱动（飞鹅 / 得力 / 其他云打印）只需实现 LabelPrinter，并把标签内容转换成厂商模板。
 */
export class MockLabelPrinter implements LabelPrinter {
  readonly name = 'mock-cloud-label';
  readonly mode = 'mock';
  private failure: string | null = null;

  failNext(error = '标签机离线（模拟）'): void {
    this.failure = error;
  }

  async print(job: PrintJobPayload): Promise<PrintResult> {
    await wait(20);
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      return { ok: false, error };
    }
    return { ok: true, providerRef: `PRINT-${job.orderNumber}-${Date.now()}` };
  }

  async status(): Promise<DeviceStatus> {
    return { online: true, mode: this.mode, detail: '本机模拟驱动，未连接真实标签机' };
  }
}

/**
 * 三台泡茶机的能力接口。
 * 当前版本不把机器调度放进下单主流程；真实设备接入时由门店设备网关调用。
 */
export class MockTeaMachine implements TeaMachineAdapter {
  readonly name = 'mock-tea-machine';
  readonly mode = 'mock';

  async status(): Promise<Array<DeviceStatus & { id: string; kind: string }>> {
    return [1, 2, 3].map((n) => ({
      id: `brew-${n}`,
      kind: 'tea-machine',
      online: true,
      mode: this.mode,
      detail: '模拟设备：已预留状态/开机/冲泡接口'
    }));
  }

  async brew(command: BrewCommand): Promise<BrewResult> {
    await wait(10);
    return {
      accepted: true,
      machineId: 'brew-1',
      detail: `模拟接收 ${command.productName} ${command.doseGrams}g；未实际启动设备`
    };
  }
}

export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock-payment';
  readonly mode = 'mock';
  private failNext = false;

  simulateFailure(): void {
    this.failNext = true;
  }

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    await wait(15);
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, error: '支付未完成（模拟失败）' };
    }
    return { ok: true, providerRef: `PAY-${request.reference}-${Date.now()}`, paidAt: Date.now() };
  }

  async refund(request: RefundRequest): Promise<PaymentResult> {
    await wait(10);
    return { ok: true, providerRef: `REF-${request.reference}-${Date.now()}`, paidAt: Date.now() };
  }

  async status(): Promise<DeviceStatus> {
    return { online: true, mode: this.mode, detail: '本机模拟支付网关，未连接微信/支付宝' };
  }
}

export class MockPlatformConnector implements PlatformConnector {
  readonly name = 'mock-platform';
  readonly mode = 'mock';

  async pullOrders(_since: number): Promise<PlatformOrder[]> {
    return [];
  }

  async acknowledge(_externalId: string): Promise<boolean> {
    return true;
  }
}

export class MockMemberProvider implements MemberProvider {
  readonly name = 'mock-member';
  readonly mode = 'mock';

  async verify(code: string): Promise<MemberBenefit | null> {
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^TH-[A-Z0-9-]{4,}$/.test(normalized)) return null;
    return { code: normalized, tier: 'annual', discountPerCupCents: 100, name: '时叙年会员' };
  }
}
