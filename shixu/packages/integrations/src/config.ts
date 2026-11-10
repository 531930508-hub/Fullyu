import type { ExternalChannelKey, IntegrationsConfig, IntegrationsMode } from './contracts';

export type ConfigInput = {
  /** 后端上传目录（本地头像存储用）。 */
  uploadRoot: string;
  /** 由 key 生成对外 URL。 */
  assetUrl: (key: string) => string;
  /** 默认取 process.env，测试可注入。 */
  env?: NodeJS.ProcessEnv;
};

const DEFAULT_APPID = 'wxd9e4e4568d1bc8bb';

/** 汇付凭证统一放在服务器目录；部署脚本只建目录并设权限，密钥内容不进代码与日志。 */
const DEFAULT_HUIFU_DIR = '/etc/teahour/huifu';

const DEFAULT_HUIFU_NOTIFY = 'https://teahour.fullyu.cn/api/hooks/payment/huifu-payment';

const CHANNEL_KEYS: ExternalChannelKey[] = ['printer', 'teaMachine', 'payment', 'platform', 'member', 'wechat'];

const trim = (value: string | undefined): string | undefined => {
  const text = value?.trim();
  return text ? text : undefined;
};

/** 门店映射表：非法 JSON 直接报错，避免静默用错商户号收款或把标签打到错误机器。 */
const parseStringMap = (value: string | undefined, name: string): Record<string, string> => {
  const text = trim(value);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, raw] of Object.entries(parsed || {})) {
      const mapped = String(raw ?? '').trim();
      if (key.trim() && mapped) result[key.trim()] = mapped;
    }
    return result;
  } catch {
    throw new Error(`${name} 必须是 {"门店ID":"对应值"} 形式的 JSON`);
  }
};

const clampNumber = (value: string | undefined, min: number, max: number, fallback: number): number => {
  const parsed = Number(trim(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
};

const parseMode = (value: string | undefined): IntegrationsMode => {
  const text = (value || '').trim().toLowerCase();
  if (!text || text === 'mock' || text === 'dev' || text === 'local') return 'mock';
  if (text === 'disabled' || text === 'off') return 'disabled';
  if (text === 'live' || text === 'prod' || text === 'production') return 'live';
  throw new Error(`INTEGRATIONS_MODE 只接受 mock / live / disabled，当前为「${value}」`);
};

/**
 * 从环境变量装配对接配置。
 *
 * - INTEGRATIONS_MODE：mock（开发默认）| live | disabled（生产默认）
 * - INTEGRATIONS_<CHANNEL>_MODE：按渠道覆盖，如 INTEGRATIONS_PAYMENT_MODE=live
 * - 生产环境未显式配置时默认 disabled，且禁止 mock——mock 只属于本地开发，
 *   不允许在生产里冒充支付/打印/会员等真实能力。
 * - WECHAT_APPID / WECHAT_APPSECRET / WECHAT_MCHID：小程序与微信支付凭证
 * - INTEGRATIONS_ENV：部署环境标识（如 staging / prod-sh），仅用于展示
 */
export function loadIntegrationsConfig(input: ConfigInput): IntegrationsConfig {
  const env = input.env || process.env;
  const isProduction = (env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const explicit = trim(env.INTEGRATIONS_MODE);

  const assertNotMock = (mode: IntegrationsMode, label: string) => {
    if (isProduction && mode === 'mock') {
      throw new Error(`${label}=mock 不允许在生产环境使用：请改用 live 或 disabled`);
    }
  };

  const mode = parseMode(explicit);
  // 只有显式写明的 mock 才拦截；开发环境的「默认 mock」不算违规配置。
  if (explicit) assertNotMock(mode, 'INTEGRATIONS_MODE');
  const resolved: IntegrationsMode = explicit ? mode : isProduction ? 'disabled' : 'mock';

  const channels = {} as Record<ExternalChannelKey, IntegrationsMode>;
  for (const key of CHANNEL_KEYS) {
    const override = trim(env[`INTEGRATIONS_${key.toUpperCase()}_MODE`]);
    const channelMode = parseMode(override);
    if (override) assertNotMock(channelMode, `INTEGRATIONS_${key.toUpperCase()}_MODE`);
    channels[key] = override ? channelMode : resolved;
  }

  return {
    mode: resolved,
    channels,
    env: trim(env.INTEGRATIONS_ENV) || trim(env.NODE_ENV) || 'local',
    wechat: {
      appId: trim(env.WECHAT_APPID) || DEFAULT_APPID,
      appSecret: trim(env.WECHAT_APPSECRET),
      mchId: trim(env.WECHAT_MCHID)
    },
    huifu: {
      sysId: trim(env.HUIFU_SYS_ID),
      productId: trim(env.HUIFU_PRODUCT_ID) || 'PAYUN',
      huifuId: trim(env.HUIFU_HUIFU_ID) || trim(env.HUIFU_MCH_ID),
      subAppId: trim(env.HUIFU_SUB_APPID) || trim(env.WECHAT_APPID) || DEFAULT_APPID,
      privateKeyPath: trim(env.HUIFU_PRIVATE_KEY_PATH) || `${DEFAULT_HUIFU_DIR}/merchant_private_key.pem`,
      publicKeyPath: trim(env.HUIFU_PUBLIC_KEY_PATH) || `${DEFAULT_HUIFU_DIR}/huifu_public_key.pem`,
      webhookKeyPath: trim(env.HUIFU_WEBHOOK_KEY_PATH) || `${DEFAULT_HUIFU_DIR}/webhook.key`,
      notifyUrl: trim(env.HUIFU_NOTIFY_URL) || DEFAULT_HUIFU_NOTIFY,
      apiBase: (trim(env.HUIFU_API_BASE) || 'https://api.huifu.com').replace(/\/+$/, ''),
      storeMerchants: parseStringMap(env.HUIFU_STORE_MERCHANTS, 'HUIFU_STORE_MERCHANTS'),
      timeoutMs: Math.min(Math.max(Number(env.HUIFU_TIMEOUT_MS) || 15_000, 3_000), 60_000)
    },
    upload: {
      root: input.uploadRoot,
      assetUrl: input.assetUrl
    },
    feie: {
      user: trim(env.FEIE_USER),
      ukey: trim(env.FEIE_UKEY),
      sn: trim(env.FEIE_SN),
      storeSn: parseStringMap(env.FEIE_STORE_SN, 'FEIE_STORE_SN'),
      apiBase: (trim(env.FEIE_API_BASE) || 'https://api.de.feieyun.com').replace(/\/+$/, ''),
      timeoutMs: clampNumber(env.FEIE_TIMEOUT_MS, 3_000, 30_000, 10_000),
      labelWidthMm: clampNumber(env.FEIE_LABEL_WIDTH_MM, 20, 104, 40),
      labelHeightMm: clampNumber(env.FEIE_LABEL_HEIGHT_MM, 10, 200, 30),
      labelGap: (() => {
        const gap = trim(env.FEIE_LABEL_GAP) || '2,0';
        if (!/^\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(gap)) {
          throw new Error('FEIE_LABEL_GAP 必须是 "间距,偏移" 形式，如 2,0');
        }
        return gap;
      })()
    }
  };
}
