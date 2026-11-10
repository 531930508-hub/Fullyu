/**
 * 运行配置守门：凡是「缺了不该静默降级」的配置都在这里集中校验。
 * 生产环境的密钥要求在模块加载时就会执行（app.module 顶部调用），保证带病配置起不来。
 */

const DEV_FALLBACK_SECRET = 'dev-only-teahour-secret-change-me-before-production';

const isProduction = (env: NodeJS.ProcessEnv): boolean =>
  (env.NODE_ENV || '').trim().toLowerCase() === 'production';

/**
 * JWT 签名密钥。
 * - 生产环境：必须显式提供 32 位以上、且不是开发默认值的密钥，否则直接抛错拒绝启动；
 * - 开发/测试环境：允许回落到占位密钥，方便本地一键启动。
 */
export function jwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const value = (env.JWT_SECRET || '').trim();
  if (isProduction(env)) {
    if (value.length < 32 || /change-me|dev-only/i.test(value)) {
      throw new Error('[config] 生产环境必须配置 32 位以上且非开发默认值的 JWT_SECRET 环境变量');
    }
    return value;
  }
  return value || DEV_FALLBACK_SECRET;
}

/** 后台与 H5 预览的默认来源；生产域名固定，本地开发端口全部列出。 */
const DEFAULT_CORS_ORIGINS = [
  'https://teahour.fullyu.cn',
  'http://localhost:5181',
  'http://127.0.0.1:5181',
  'http://localhost:5190',
  'http://127.0.0.1:5190',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // 顾客端 H5 本地开发固定 5174（vite.config.js strictPort），需与代理外的直连一致。
  'http://localhost:5174',
  'http://127.0.0.1:5174'
];

/**
 * 浏览器跨域来源白名单。
 * 小程序与服务器调用不带 Origin，必须放行；显式配置 `*` 会被忽略，
 * 避免一次误配置把 Bearer 接口重新暴露给任意站点。
 */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = (env.CORS_ORIGINS || '').trim();
  if (!raw) return [...DEFAULT_CORS_ORIGINS];
  return raw
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter((item) => item && item !== '*');
}

/**
 * 后台登录失败限流：同一来源+账号在窗口内失败 LOGIN_RATE_LIMIT 次后锁定。
 * 只统计失败，正常换班登录不占额度；默认 15 分钟窗口。
 */
export function loginRateLimit(env: NodeJS.ProcessEnv = process.env): { limit: number; windowMs: number } {
  const parsed = Number((env.LOGIN_RATE_LIMIT || '').trim());
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10;
  return { limit, windowMs: 15 * 60_000 };
}
