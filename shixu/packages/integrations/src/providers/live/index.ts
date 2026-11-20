import type {
  AvatarStorageProvider,
  IntegrationsConfig,
  LabelPrinter,
  MiniProgramAuthProvider,
  PaymentGateway,
  PlatformConnector,
  ProfileSyncProvider,
  TeaMachineAdapter
} from '../../contracts';
import { WechatMiniProgramAuth } from './wechat';
import { HuifuPaymentGateway } from './huifu';
import { XpyunLabelPrinter } from './xpyun';
import { AgentLabelPrinter } from './agent';

export type LiveContext = {
  config: IntegrationsConfig;
};

/**
 * 真实实现的注册表。
 * 对接团队新增厂商实现后，只需在这里登记；其余代码一行都不用改。
 */
export type LiveProviderFactories = {
  printer: (ctx: LiveContext) => LabelPrinter;
  teaMachine: (ctx: LiveContext) => TeaMachineAdapter;
  payment: (ctx: LiveContext) => PaymentGateway;
  platform: (ctx: LiveContext) => PlatformConnector;
  wechat: (ctx: LiveContext) => MiniProgramAuthProvider;
  avatar: (ctx: LiveContext) => AvatarStorageProvider;
  profileSync: (ctx: LiveContext) => ProfileSyncProvider;
};

export const liveProviders: Partial<LiveProviderFactories> = {
  /**
   * 杯贴打印机按 PRINTER_DRIVER 分流：
   * - xpyun：芯烨 XP-420B 接条码云，服务端直推，门店不用开电脑（默认）；
   * - agent：芯烨 XP-420B 等 USB 桌面机，由门店打印代理领取 TSPL 任务。
   */
  printer: (ctx) =>
    ctx.config.printerDriver === 'agent'
      ? new AgentLabelPrinter()
      : new XpyunLabelPrinter(ctx.config.xpyun),
  /**
   * 汇付天下（斗拱 v2）服务商模式：小程序支付、收款码（C 扫 B）、顾客付款码（B 扫 C）与退款。
   * 凭证在首次调用时惰性读取，缺文件不会阻止服务启动，只会诚实地报告未就绪。
   */
  payment: (ctx) =>
    new HuifuPaymentGateway({
      ...ctx.config.huifu,
      storeMerchants: ctx.config.huifu.storeMerchants
    }),
  /**
   * 微信小程序登录与手机号已接真实开放接口。
   * 支付是否真实由独立支付渠道决定：这里把 channels.payment 透传给 prepayMode，
   * 支付仍为 mock 时不会把模拟回执伪装成真实扣款。
   */
  wechat: (ctx) =>
    new WechatMiniProgramAuth({
      appId: ctx.config.wechat.appId,
      appSecret: ctx.config.wechat.appSecret,
      paymentMode: ctx.config.channels.payment
    })
};
