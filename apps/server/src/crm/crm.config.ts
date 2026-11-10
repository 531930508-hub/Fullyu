/**
 * 会员中心（CRM）接入配置。
 *
 * - 默认关闭：未设置 CRM_BASE_URL 且未显式开启时，顾客流程完全沿用本地库，
 *   保证未接入阶段与测试环境行为不变；
 * - 一旦开启，CRM 就是会员身份与积分的唯一账本，调用失败必须报错，不能静默回退本地 0 分；
 * - 密钥只从环境变量读取，不写入源码、日志或测试快照。
 */

export type CrmConfig = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs: number;
};

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);
const KEY_ID = /^[A-Za-z0-9._:-]{1,64}$/;

const isProduction = (env: NodeJS.ProcessEnv): boolean =>
  (env.NODE_ENV || '').trim().toLowerCase() === 'production';

const fail = (message: string): never => {
  throw new Error(`[config] ${message}`);
};

export function crmConfig(env: NodeJS.ProcessEnv = process.env): CrmConfig | null {
  const flag = (env.CRM_ENABLED || '').trim().toLowerCase();
  const baseUrl = (env.CRM_BASE_URL || '').trim().replace(/\/+$/, '');

  // 显式关闭优先；未写开关但给了地址时视为开启，减少漏配。
  if (FALSY.has(flag)) return null;
  if (!TRUTHY.has(flag) && !baseUrl) return null;

  if (!baseUrl) fail('已开启 CRM，但缺少 CRM_BASE_URL');
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) fail('CRM_BASE_URL 必须是 http(s) 地址');
  if (
    isProduction(env) &&
    !/^https:/i.test(baseUrl) &&
    !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(baseUrl)
  ) {
    fail('生产环境的 CRM_BASE_URL 必须使用 HTTPS（本机回环地址除外）');
  }

  const keyId = (env.CRM_KEY_ID || '').trim();
  if (!KEY_ID.test(keyId)) fail('已开启 CRM，但 CRM_KEY_ID 缺失或格式不正确');

  const secret = (env.CRM_SECRET || '').trim();
  if (secret.length < 16) fail('已开启 CRM，但 CRM_SECRET 缺失或少于 16 位');

  const parsedTimeout = Number((env.CRM_TIMEOUT_MS || '').trim());
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? Math.min(15_000, Math.max(300, Math.round(parsedTimeout)))
      : 3000;

  return { baseUrl, keyId, secret, timeoutMs };
}
