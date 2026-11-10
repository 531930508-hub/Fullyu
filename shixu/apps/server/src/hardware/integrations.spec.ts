/**
 * 对外接口对接层的装配规则。
 *
 * 重点不是「mock 能跑」，而是 live 模式必须显式接齐：少接一项就在启动时失败，
 * 不允许静默回落到内置实现，否则线上会出现「看起来接好了、其实没扣款」。
 */
import { createIntegrations, describeIntegrations, loadIntegrationsConfig } from '@teahour/integrations';

const baseInput = {
  uploadRoot: '/tmp/teahour-integrations-test',
  assetUrl: (key: string) => `https://cdn.example.com/${key}`
};

describe('integrations 装配', () => {
  it('默认 mock 模式：八项能力都由内置实现接管', () => {
    const config = loadIntegrationsConfig({ ...baseInput, env: {} });
    expect(config.mode).toBe('mock');

    const integrations = createIntegrations(config);
    const described = describeIntegrations(integrations);
    expect(described.payment).toEqual({ name: 'mock-payment', mode: 'mock' });
    expect(described.printer.mode).toBe('mock');
    expect(described.teaMachine.mode).toBe('mock');
    expect(described.platform.mode).toBe('mock');
    expect(described.member.mode).toBe('mock');
    expect(described.wechat.mode).toBe('mock');
    expect(described.avatar).toEqual({ name: 'local-disk', mode: 'local' });
    expect(described.profileSync).toEqual({ name: 'pending-user-center', mode: 'noop' });
  });

  it('微信 AppID 从环境变量读取，缺省用已配置的正式 AppID', () => {
    const fallback = loadIntegrationsConfig({ ...baseInput, env: {} });
    expect(fallback.wechat.appId).toBe('wxd9e4e4568d1bc8bb');

    const custom = loadIntegrationsConfig({ ...baseInput, env: { WECHAT_APPID: 'wx-test-appid' } });
    expect(custom.wechat.appId).toBe('wx-test-appid');
  });

  it('INTEGRATIONS_MODE 只接受 mock / live / disabled', () => {
    expect(loadIntegrationsConfig({ ...baseInput, env: { INTEGRATIONS_MODE: 'live' } }).mode).toBe('live');
    expect(loadIntegrationsConfig({ ...baseInput, env: { INTEGRATIONS_MODE: 'disabled' } }).mode).toBe('disabled');
    expect(() => loadIntegrationsConfig({ ...baseInput, env: { INTEGRATIONS_MODE: 'staging' } })).toThrow(
      /只接受 mock \/ live \/ disabled/
    );
  });

  it('disabled 渠道走诚实失败实现，不回落 mock', async () => {
    const config = loadIntegrationsConfig({ ...baseInput, env: { INTEGRATIONS_MODE: 'disabled' } });
    const integrations = createIntegrations(config);
    expect(integrations.payment.mode).toBe('disabled');
    const charge = await integrations.payment.charge({ amountCents: 1, method: 'wechat', reference: 'x' });
    expect(charge.ok).toBe(false);
    expect(charge.error).toMatch(/未扣款/);
    expect(integrations.printer.mode).toBe('disabled');
    // 头像存储是本地能力，disabled 下仍然可用
    expect(integrations.avatar.mode).toBe('local');
  });

  it('live 模式下缺少任何一项真实实现都会在启动时抛错', () => {
    // 打印已接飞鹅；用尚未接真实实现的泡茶机验证「缺一项就启动失败」这条不变量。
    const config = loadIntegrationsConfig({
      ...baseInput,
      env: {
        INTEGRATIONS_MODE: 'live',
        FEIE_USER: 'test-user',
        FEIE_UKEY: 'test-ukey',
        FEIE_SN: 'SN-DEFAULT'
      }
    });
    expect(() => createIntegrations(config)).toThrow(/缺少 teaMachine 的真实实现/);
    expect(() => createIntegrations(config)).toThrow(/providers\/live\/index\.ts/);
  });

  it('内置支付实现不接收回调，调用入口必须报 501 而不是假装成功', async () => {
    const integrations = createIntegrations(loadIntegrationsConfig({ ...baseInput, env: {} }));
    expect(integrations.payment.handleCallback).toBeUndefined();
  });
});
