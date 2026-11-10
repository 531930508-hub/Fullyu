/**
 * 品牌会员（Full愈年卡 / 月卡）CRM 接入配置。
 *
 * 与旧会员积分接口（x-crm-*）分开配置，因为品牌会员使用 X-Fy 签名、独立密钥，
 * 且业务归属由密钥决定。默认关闭；没有显式密钥时绝不向 CRM 发起请求，
 * 更不能由前端直连 CRM（前端无法安全持有签名密钥）。
 */

export type BrandMemberConfig = {
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

export function brandMemberConfig(
  env: NodeJS.ProcessEnv = process.env
): BrandMemberConfig | null {
  const flag = (env.BRAND_CRM_ENABLED || '').trim().toLowerCase();
  const baseUrl = (env.BRAND_CRM_BASE_URL || env.CRM_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const keyId = (env.BRAND_CRM_KEY_ID || '').trim();
  const secret = (env.BRAND_CRM_SECRET || '').trim();

  // 显式关闭优先。未写开关时，只有同时给了 key 与 secret 才视为开启，
  // 避免只填了 CRM_BASE_URL 就把品牌会员入口误开成半配置状态。
  if (FALSY.has(flag)) return null;
  if (!TRUTHY.has(flag) && !(keyId && secret)) return null;

  if (!baseUrl) fail('已开启品牌会员 CRM，但缺少 BRAND_CRM_BASE_URL');
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) fail('BRAND_CRM_BASE_URL 必须是 http(s) 地址');
  if (
    isProduction(env) &&
    !/^https:/i.test(baseUrl) &&
    !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(baseUrl)
  ) {
    fail('生产环境的 BRAND_CRM_BASE_URL 必须使用 HTTPS（本机回环地址除外）');
  }
  if (!KEY_ID.test(keyId)) fail('已开启品牌会员 CRM，但 BRAND_CRM_KEY_ID 缺失或格式不正确');
  if (secret.length < 16) fail('已开启品牌会员 CRM，但 BRAND_CRM_SECRET 缺失或少于 16 位');

  const parsedTimeout = Number((env.BRAND_CRM_TIMEOUT_MS || '').trim());
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? Math.min(15_000, Math.max(300, Math.round(parsedTimeout)))
      : 3000;

  return { baseUrl, keyId, secret, timeoutMs };
}
