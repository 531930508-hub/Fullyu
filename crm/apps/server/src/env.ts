import fs from 'node:fs';
import path from 'node:path';

type ProcessWithEnvFile = typeof process & { loadEnvFile?: (file?: string) => void };

/**
 * 本地开发读取 apps/server/.env。
 * 已存在的环境变量优先，测试与部署注入不会被文件覆盖。
 */
export function loadLocalEnv(): void {
  if (process.env.DATABASE_URL) return;
  const file = path.join(__dirname, '..', '.env');
  try {
    if (fs.existsSync(file)) (process as ProcessWithEnvFile).loadEnvFile?.(file);
  } catch {
    // 没有 .env 时由部署环境注入；缺 DATABASE_URL 会在 Prisma 初始化时明确报错。
  }
}
