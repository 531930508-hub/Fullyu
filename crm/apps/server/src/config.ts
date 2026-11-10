const DEV_FALLBACK_SECRET = 'dev-only-crm-secret-change-me-before-production';

const isProduction = (env: NodeJS.ProcessEnv): boolean =>
  (env.NODE_ENV || '').trim().toLowerCase() === 'production';

/** 生产环境必须显式配置 32 位以上、非开发默认值的 JWT_SECRET，否则拒绝启动。 */
export function jwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const value = (env.JWT_SECRET || '').trim();
  if (isProduction(env)) {
    if (value.length < 32 || /change-me|dev-only/i.test(value)) {
      throw new Error('[config] 生产环境必须配置 32 位以上且非开发默认值的 JWT_SECRET');
    }
    return value;
  }
  return value || DEV_FALLBACK_SECRET;
}

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = (env.CRM_CORS_ORIGINS || '').trim();
  if (raw) {
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item && item !== '*');
  }
  return ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5181', 'http://127.0.0.1:5181'];
}
