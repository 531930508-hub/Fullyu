import { allowedOrigins, jwtSecret, loginRateLimit } from './config';
import { loadIntegrationsConfig } from '@teahour/integrations';
import { resolveSeedCredential, shouldSeedTransactions, wipeAllowed } from './seed-config';

describe('运行配置安全', () => {
  describe('jwtSecret', () => {
    it('生产环境缺少或过弱的 JWT_SECRET 必须启动失败', () => {
      expect(() => jwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
      expect(() => jwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
      expect(() =>
        jwtSecret({
          NODE_ENV: 'production',
          JWT_SECRET: 'dev-only-teahour-secret-change-me-before-production'
        })
      ).toThrow(/JWT_SECRET/);
    });

    it('生产环境合法密钥可用，开发环境保持默认', () => {
      const strong = 'x'.repeat(32);
      expect(jwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong })).toBe(strong);
      expect(jwtSecret({})).toBeTruthy();
      expect(jwtSecret({ NODE_ENV: 'test' })).toBeTruthy();
    });
  });

  describe('CORS 与登录限流', () => {
    it('CORS 只允许显式来源，空来源（小程序/服务端调用）放行，其它来源拒绝', () => {
      const defaults = allowedOrigins({});
      expect(defaults).toContain('https://teahour.fullyu.cn');
      expect(defaults).toContain('http://localhost:5181');
      expect(defaults).not.toContain('*');

      const custom = allowedOrigins({
        CORS_ORIGINS: 'https://admin.example.com, https://shop.example.com'
      });
      expect(custom).toEqual(['https://admin.example.com', 'https://shop.example.com']);
    });

    it('登录失败默认 10 次 / 15 分钟，可用环境变量调整，非法值回落默认', () => {
      expect(loginRateLimit({})).toEqual({ limit: 10, windowMs: 15 * 60_000 });
      expect(loginRateLimit({ LOGIN_RATE_LIMIT: '5' })).toEqual({ limit: 5, windowMs: 15 * 60_000 });
      expect(loginRateLimit({ LOGIN_RATE_LIMIT: '0' })).toEqual({ limit: 10, windowMs: 15 * 60_000 });
      expect(loginRateLimit({ LOGIN_RATE_LIMIT: 'abc' })).toEqual({ limit: 10, windowMs: 15 * 60_000 });
    });
  });

  describe('loadIntegrationsConfig', () => {
    const base = { uploadRoot: '/tmp/uploads', assetUrl: (key: string) => `/assets/${key}` };

    it('开发环境默认全部 mock', () => {
      const cfg = loadIntegrationsConfig({ ...base, env: {} });
      expect(cfg.mode).toBe('mock');
      expect(cfg.channels.payment).toBe('mock');
      expect(cfg.channels.wechat).toBe('mock');
      expect(cfg.channels.printer).toBe('mock');
    });

    it('生产环境未显式配置时默认全部 disabled，且不允许 mock 冒充真实能力', () => {
      const cfg = loadIntegrationsConfig({ ...base, env: { NODE_ENV: 'production' } });
      expect(cfg.mode).toBe('disabled');
      expect(Object.values(cfg.channels).every((mode) => mode === 'disabled')).toBe(true);

      expect(() =>
        loadIntegrationsConfig({ ...base, env: { NODE_ENV: 'production', INTEGRATIONS_MODE: 'mock' } })
      ).toThrow(/mock/);
    });

    it('支持按渠道覆盖：全局关闭、单独启用支付', () => {
      const cfg = loadIntegrationsConfig({
        ...base,
        env: { INTEGRATIONS_MODE: 'disabled', INTEGRATIONS_PAYMENT_MODE: 'live' }
      });
      expect(cfg.mode).toBe('disabled');
      expect(cfg.channels.payment).toBe('live');
      expect(cfg.channels.printer).toBe('disabled');
    });
  });

  describe('种子数据开关', () => {
    it('随机凭证足够强且每次不同，环境变量优先', () => {
      const explicit = resolveSeedCredential({ SEED_PASSWORD: 'known-pass-123' });
      expect(explicit).toEqual({ password: 'known-pass-123', generated: false });

      const first = resolveSeedCredential({});
      const second = resolveSeedCredential({});
      expect(first.generated).toBe(true);
      expect(first.password.length).toBeGreaterThanOrEqual(16);
      expect(first.password).not.toMatch(/^teahour/i);
      expect(first.password).not.toBe(second.password);
    });

    it('只有显式开启才写入演示交易', () => {
      expect(shouldSeedTransactions({})).toBe(false);
      expect(shouldSeedTransactions({ SEED_TRANSACTIONS: '0' })).toBe(false);
      expect(shouldSeedTransactions({ SEED_TRANSACTIONS: '1' })).toBe(true);
    });

    it('生产环境拒绝重置数据库，除非显式 SEED_FORCE=1', () => {
      expect(() => wipeAllowed({ NODE_ENV: 'production' })).toThrow(/SEED_FORCE/);
      expect(wipeAllowed({ NODE_ENV: 'production', SEED_FORCE: '1' })).toBe(true);
      expect(wipeAllowed({ NODE_ENV: 'test', SEED_FORCE: '1' })).toBe(true);
      expect(wipeAllowed({})).toBe(false);
    });
  });
});
