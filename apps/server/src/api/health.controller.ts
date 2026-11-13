import { Controller, Get } from '@nestjs/common';
import { describeIntegrations } from '@teahour/integrations';
import { HardwareService } from '../hardware/hardware.module';

@Controller()
export class HealthController {
  constructor(private readonly hardware: HardwareService) {}

  @Get('health')
  health() {
    const integrations = describeIntegrations(this.hardware.integrations);
    // 只统计对外硬件/渠道（支付/打印/泡茶机/外卖平台/微信）；会员在 CRM，不属于适配层。
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
      note: '支付、打印、泡茶机与外卖平台由适配层承接，未接入的渠道不会产生真实扣款或设备动作；会员以 CRM 卡为准'
    };
  }
}
