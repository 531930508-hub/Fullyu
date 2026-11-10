import type { ExternalChannelKey, Integrations, IntegrationsConfig } from './contracts';
import {
  DisabledLabelPrinter,
  DisabledMemberProvider,
  DisabledMiniProgramAuth,
  DisabledPaymentGateway,
  DisabledPlatformConnector,
  DisabledTeaMachine
} from './providers/disabled';
import {
  LocalAvatarStorage,
  MockLabelPrinter,
  MockMemberProvider,
  MockMiniProgramAuth,
  MockPaymentGateway,
  MockPlatformConnector,
  MockTeaMachine,
  NoopProfileSync
} from './providers/mock/index';
import { liveProviders, type LiveContext, type LiveProviderFactories } from './providers/live/index';

/**
 * 按配置组装一整套对外能力。
 *
 * - mock：全部走内置实现，方便本地开发、联调与验收；
 * - disabled：对应渠道走诚实失败实现，绝不静默回落到 mock 冒充真实能力；
 * - live：每项能力都必须在 providers/live/index.ts 注册真实实现；
 *   缺任何一项都会在启动/调用时立刻抛错——否则线上会「看起来接好了、其实没扣款」。
 *
 * 每个外部通道可由 INTEGRATIONS_<CHANNEL>_MODE 单独覆盖全局模式；
 * 头像存储与资料同步是本地能力，保持内置实现，不受 disabled 影响。
 */
export function createIntegrations(config: IntegrationsConfig): Integrations {
  const ctx: LiveContext = { config };

  const live = <K extends keyof LiveProviderFactories>(key: K): ReturnType<LiveProviderFactories[K]> => {
    const factory = liveProviders[key];
    if (!factory) {
      throw new Error(
        `[integrations] live 模式下缺少 ${key} 的真实实现：请在 packages/integrations/src/providers/live/index.ts 注册`
      );
    }
    return factory(ctx) as ReturnType<LiveProviderFactories[K]>;
  };

  const pick = <K extends ExternalChannelKey>(
    key: K,
    fallback: () => ReturnType<LiveProviderFactories[K]>,
    offline: () => ReturnType<LiveProviderFactories[K]>
  ): ReturnType<LiveProviderFactories[K]> => {
    const channelMode = config.channels[key];
    if (channelMode === 'live') return live(key);
    if (channelMode === 'disabled') return offline();
    return fallback();
  };

  // 头像与资料同步只区分内置 / live；本地磁盘与 no-op 实现在任何模式下都诚实。
  // avatar/profileSync 不是对外渠道（不在 ExternalChannelKey 里），但 live 全局模式下
  // 同样要求注册真实实现，因此 live() 的键空间是完整的 LiveProviderFactories。
  const local = <K extends 'avatar' | 'profileSync'>(key: K, fallback: () => ReturnType<LiveProviderFactories[K]>) =>
    config.mode === 'live' ? live(key) : fallback();

  return {
    printer: pick('printer', () => new MockLabelPrinter(), () => new DisabledLabelPrinter()),
    teaMachine: pick('teaMachine', () => new MockTeaMachine(), () => new DisabledTeaMachine()),
    payment: pick('payment', () => new MockPaymentGateway(), () => new DisabledPaymentGateway()),
    platform: pick('platform', () => new MockPlatformConnector(), () => new DisabledPlatformConnector()),
    member: pick('member', () => new MockMemberProvider(), () => new DisabledMemberProvider()),
    wechat: pick('wechat', () => new MockMiniProgramAuth({ appId: config.wechat.appId }), () => new DisabledMiniProgramAuth()),
    avatar: local('avatar', () => new LocalAvatarStorage({ root: config.upload.root, assetUrl: config.upload.assetUrl })),
    profileSync: local('profileSync', () => new NoopProfileSync())
  };
}

/** 供状态页 / 健康检查展示：每项能力当前的实现名与模式。 */
export function describeIntegrations(
  integrations: Integrations
): Record<keyof Integrations, { name: string; mode: string }> {
  return {
    printer: { name: integrations.printer.name, mode: integrations.printer.mode },
    teaMachine: { name: integrations.teaMachine.name, mode: integrations.teaMachine.mode },
    payment: { name: integrations.payment.name, mode: integrations.payment.mode },
    platform: { name: integrations.platform.name, mode: integrations.platform.mode },
    member: { name: integrations.member.name, mode: integrations.member.mode },
    wechat: { name: integrations.wechat.name, mode: integrations.wechat.mode },
    avatar: { name: integrations.avatar.name, mode: integrations.avatar.mode },
    profileSync: { name: integrations.profileSync.name, mode: integrations.profileSync.mode }
  };
}
