/**
 * 种子数据开关：把「会不会写入演示数据 / 会不会清库 / 密码从哪来」集中成可测试的纯函数。
 * seed.ts 只消费这里的结论，保证本地开发与测试环境默认干净、生产默认拒绝。
 */
import { randomBytes } from 'node:crypto';

export type SeedCredential = {
  /** 账号初始密码。 */
  password: string;
  /** true 表示是随机生成的：调用方负责把密码写到安全位置，绝不能打印到日志。 */
  generated: boolean;
};

/**
 * 种子账号凭证：优先 SEED_PASSWORD 环境变量；未提供时随机生成强密码。
 * 固定的演示密码只允许通过显式环境变量提供，代码里不再内置默认值。
 */
export function resolveSeedCredential(env: NodeJS.ProcessEnv = process.env): SeedCredential {
  const explicit = (env.SEED_PASSWORD || '').trim();
  if (explicit) return { password: explicit, generated: false };
  return { password: randomBytes(18).toString('base64url'), generated: true };
}

/** 演示交易（订单 / 流水 / 报表数据）只在显式 SEED_TRANSACTIONS=1 时写入；默认种子库是干净的。 */
export function shouldSeedTransactions(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SEED_TRANSACTIONS === '1';
}

/**
 * 是否允许清空重建数据库：非生产环境需显式 SEED_FORCE=1；
 * 生产环境默认直接抛错拦一道，只有同样显式传 SEED_FORCE=1 才放行——
 * 防止种子脚本误连生产库时默认清空。
 */
export function wipeAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const forced = env.SEED_FORCE === '1';
  if ((env.NODE_ENV || '').trim().toLowerCase() === 'production' && !forced) {
    throw new Error('[seed] 生产环境拒绝执行清库种子；如确需重置请先隔离环境并显式设置 SEED_FORCE=1');
  }
  return forced;
}
