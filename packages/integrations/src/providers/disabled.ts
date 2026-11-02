import type {
  DeviceStatus,
  LabelPrinter,
  MemberBenefit,
  MemberProvider,
  MiniProgramAuthProvider,
  MiniProgramSession,
  PaymentGateway,
  PaymentRequest,
  PaymentResult,
  PhoneNumberRequest,
  PhoneNumberResult,
  PlatformConnector,
  PlatformOrder,
  PrepayRequest,
  PrepayResult,
  PrintJobPayload,
  PrintResult,
  RefundRequest,
  TeaMachineAdapter,
  BrewCommand,
  BrewResult
} from '../contracts';

/**
 * disabled 模式的诚实失败实现。
 *
 * 规则：能明确表达「未执行」的返回 not-ok 结果；可能被误读成「成功但没有数据」的
 * 一律抛错。绝不返回空数组、null 折扣这类看起来像正常业务结果的值来掩盖未接入。
 */

const disabledStatus = (channel: string): DeviceStatus => ({
  online: false,
  mode: 'disabled',
  detail: `${channel} 未启用：设置 INTEGRATIONS_${channel.toUpperCase()}_MODE 后接入`
});

const refuse = (channel: string): Error =>
  new Error(`[integrations] ${channel} 处于 disabled 模式：操作未执行，请先完成该渠道接入`);

export class DisabledLabelPrinter implements LabelPrinter {
  readonly name = '打印未启用';
  readonly mode = 'disabled';

  async print(_job: PrintJobPayload): Promise<PrintResult> {
    return { ok: false, error: '打印能力未启用（disabled），任务保留待接入后重试' };
  }

  async status(): Promise<DeviceStatus> {
    return disabledStatus('printer');
  }
}

export class DisabledTeaMachine implements TeaMachineAdapter {
  readonly name = '泡茶机未启用';
  readonly mode = 'disabled';

  async status(): Promise<Array<DeviceStatus & { id: string; kind: string }>> {
    return [{ ...disabledStatus('teaMachine'), id: 'none', kind: 'tea-machine' }];
  }

  async brew(_command: BrewCommand): Promise<BrewResult> {
    return { accepted: false, detail: '泡茶机未启用（disabled），请人工制作' };
  }
}

export class DisabledPaymentGateway implements PaymentGateway {
  readonly name = '支付未启用';
  readonly mode = 'disabled';

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    void request;
    return { ok: false, error: '支付能力未启用（disabled），未扣款' };
  }

  async refund(request: RefundRequest): Promise<PaymentResult> {
    void request;
    return { ok: false, error: '退款能力未启用（disabled），未退款' };
  }

  async status(): Promise<DeviceStatus> {
    return disabledStatus('payment');
  }
}

export class DisabledPlatformConnector implements PlatformConnector {
  readonly name = '外卖平台未接入';
  readonly mode = 'disabled';

  async pullOrders(_since: number): Promise<PlatformOrder[]> {
    throw refuse('外卖平台');
  }

  async acknowledge(_externalId: string): Promise<boolean> {
    throw refuse('外卖平台');
  }
}

export class DisabledMemberProvider implements MemberProvider {
  readonly name = '会员体系未接入';
  readonly mode = 'disabled';

  async verify(_code: string): Promise<MemberBenefit | null> {
    // 验证失败按「无权益」处理：不给折扣是安全方向的失败。
    return null;
  }
}

export class DisabledMiniProgramAuth implements MiniProgramAuthProvider {
  readonly name = '微信能力未启用';
  readonly mode = 'disabled';
  readonly prepayMode = 'disabled';
  readonly appId = '';

  async code2Session(_code: string): Promise<MiniProgramSession> {
    throw refuse('微信登录');
  }

  async phoneNumber(_request: PhoneNumberRequest): Promise<PhoneNumberResult> {
    throw refuse('微信手机号');
  }

  async prepay(_request: PrepayRequest): Promise<PrepayResult> {
    return { ok: false, error: '微信支付未启用（disabled）' };
  }

  async status(): Promise<DeviceStatus> {
    return disabledStatus('wechat');
  }
}
