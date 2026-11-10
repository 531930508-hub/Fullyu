import { Global, Injectable, Module } from '@nestjs/common';
import { createIntegrations, loadIntegrationsConfig, type Integrations } from '@teahour/integrations';
import { UPLOAD_ROOT, assetUrl } from '../common/assets';

/**
 * 对外接口（支付 / 云打印 / 泡茶机 / 外卖平台 / 会员 / 微信 / 头像 / 资料同步）的接入点。
 *
 * 业务代码只依赖本类暴露的属性；所有厂商实现都在 packages/integrations 里完成，
 * 这个文件只是把对接包接进 Nest，不包含任何渠道逻辑 —— 对接期间不需要改这里。
 */
@Injectable()
export class HardwareService {
  readonly integrations: Integrations = createIntegrations(
    loadIntegrationsConfig({ uploadRoot: UPLOAD_ROOT, assetUrl })
  );

  get printer() {
    return this.integrations.printer;
  }

  get teaMachine() {
    return this.integrations.teaMachine;
  }

  get payment() {
    return this.integrations.payment;
  }

  get platform() {
    return this.integrations.platform;
  }

  get member() {
    return this.integrations.member;
  }

  get wechat() {
    return this.integrations.wechat;
  }

  get avatar() {
    return this.integrations.avatar;
  }

  get profileSync() {
    return this.integrations.profileSync;
  }
}

@Global()
@Module({
  providers: [HardwareService],
  exports: [HardwareService]
})
export class HardwareModule {}
