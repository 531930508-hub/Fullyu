import { Controller, Get } from '@nestjs/common';
import { describeIntegrations } from '@teahour/integrations';
import { HardwareService } from '../hardware/hardware.module';
import { MembershipService } from '../crm/membership.service';

@Controller()
export class HealthController {
  constructor(
    private readonly hardware: HardwareService,
    private readonly membership: MembershipService
  ) {}

  @Get('health')
  health() {
    const integrations = describeIntegrations(this.hardware.integrations);
    // 只统计外部设备/支付渠道；会籍来自 CRM 缓存，单列展示，不再伪装成 mock 适配器。
    const modes = [
      ...new Set(
        (['payment', 'printer', 'teaMachine', 'platform', 'wechat'] as const).map(
          (key) => integrations[key].mode
        )
      )
    ];
    return {
      ok: true,
      time: Date.now(),
      // 对外接口当前整体模式：mock 表示全部为内置实现，未连接真实服务商。
      hardware: modes.length === 1 ? modes[0] : 'mixed',
      integrations,
      // crm = 会籍读 CRM 品牌卡（本地缓存）；local = 未接 CRM，只按本地库判定。
      membership: this.membership.sourceLabel,
      note: '支付、打印、泡茶机与平台由适配层承接，未接入的渠道不会产生真实扣款或设备动作；会籍以 CRM 品牌卡为准'
    };
  }
}
