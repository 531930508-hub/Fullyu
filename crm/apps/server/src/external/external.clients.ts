import { isBusiness, type Business } from '@fullyu/crm-shared';

export type ExternalClient = {
  keyId: string;
  business: Business;
  /** 每个业务环境独立密钥；只在环境变量中配置，不入库、不进源码。 */
  secret: string;
};

/**
 * CRM_EXT_KEYS 形如：
 * {"ql-test":{"business":"ql","secret":"..."},"sx-test":{"business":"sx","secret":"..."}}
 * 未配置时拒绝所有外部请求，不提供内置默认密钥。
 */
export function externalClients(env: NodeJS.ProcessEnv = process.env): Map<string, ExternalClient> {
  const raw = (env.CRM_EXT_KEYS || '').trim();
  if (!raw) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('[config] CRM_EXT_KEYS 不是合法 JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('[config] CRM_EXT_KEYS 必须是 keyId → 客户端配置的对象');
  }
  const clients = new Map<string, ExternalClient>();
  for (const [keyId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const item = value as { business?: unknown; secret?: unknown } | null;
    if (!item || !isBusiness(item.business) || typeof item.secret !== 'string' || item.secret.length < 16) {
      throw new Error(`[config] 外部客户端 ${keyId} 需要合法 business 与至少 16 位 secret`);
    }
    clients.set(keyId, { keyId, business: item.business, secret: item.secret });
  }
  return clients;
}
