import type { TsplLabelStyle } from '@teahour/integrations';

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

/**
 * 杯贴打印：门店打印代理的令牌表。
 *
 * 芯烨 XP-420B 是 USB 机，只能由营业台电脑上的代理拉任务。代理没有后台账号，
 * 用「门店 → 一次性长随机串」的令牌证明身份：拿 sh 的令牌只能领 sh 的任务。
 * 表为空时 agent 接口一律 401 —— 绝不允许无凭据的设备来取杯贴内容（含顾客称呼）。
 */
export function printAgentTokens(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const raw = (env.PRINT_AGENT_TOKENS || '').trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('PRINT_AGENT_TOKENS 必须是 {"门店ID":"令牌"} 形式的 JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('PRINT_AGENT_TOKENS 必须是 {"门店ID":"令牌"} 形式的 JSON');
  }
  const result: Record<string, string> = {};
  for (const [storeId, token] of Object.entries(parsed as Record<string, unknown>)) {
    const key = String(storeId || '').trim();
    const value = String(token ?? '').trim();
    if (!key || value.length < 16) {
      throw new Error('PRINT_AGENT_TOKENS 每个门店都要给 16 位以上令牌，缺一不可');
    }
    result[key] = value;
  }
  return result;
}

/**
 * TSPL 标签与打印参数（芯烨 XP-420B，203dpi）。
 * 40×60mm = 320×480 dots；默认字体 TSS24.BF2 是简体中文点阵，代理侧会转 GB18030。
 */
export function tsplLabelStyle(env: NodeJS.ProcessEnv = process.env): TsplLabelStyle {
  const num = (raw: string | undefined, fallback: number, min: number, max: number): number => {
    const parsed = Number((raw || '').trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.max(Math.round(parsed), min), max);
  };
  return {
    widthMm: num(env.TSPL_LABEL_WIDTH_MM, 40, 20, 104),
    heightMm: num(env.TSPL_LABEL_HEIGHT_MM, 60, 20, 300),
    gapMm: num(env.TSPL_LABEL_GAP_MM, 2, 0, 10),
    gapOffsetMm: 0,
    fontCn: (env.TSPL_FONT_CN || '').trim() || 'TSS24.BF2',
    density: num(env.TSPL_DENSITY, 8, 0, 15),
    speed: num(env.TSPL_SPEED, 4, 1, 6),
    timeZone: (env.LABEL_TIME_ZONE || '').trim() || 'Asia/Shanghai'
  };
}

/** 杯贴上的求助电话（门店直线或品牌客服号）；未配置时不印，不拿占位号码凑数。 */
export function servicePhone(env: NodeJS.ProcessEnv = process.env): string {
  return (env.TEAHOUR_SERVICE_PHONE || '').trim();
}
