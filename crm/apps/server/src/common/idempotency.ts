import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { conflict } from './errors';

/** 稳定序列化：对象键排序，数组保持顺序，避免同内容不同键序被当成冲突。 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

export const hashRequest = (body: unknown): string =>
  createHash('sha256').update(canonical(body)).digest('hex');

/**
 * 同一幂等键 + 同内容返回原结果；同键异内容返回 409。
 * 键在动作成功后写入；并发下由主键唯一约束兜底，失败方重读结果。
 */
export async function runIdempotent<T>(
  db: PrismaClientLike,
  key: string | undefined,
  body: unknown,
  action: () => Promise<T>
): Promise<T> {
  if (!key) return action();
  const requestHash = hashRequest(body);
  const existing = await db.idempotencyKey.findUnique({ where: { key } });
  if (existing) return replay<T>(existing.requestHash, existing.resultJson, requestHash);
  const result = await action();
  try {
    await db.idempotencyKey.create({
      data: { key, requestHash, resultJson: JSON.stringify(result) }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const row = await db.idempotencyKey.findUnique({ where: { key } });
      if (row) return replay<T>(row.requestHash, row.resultJson, requestHash);
    }
    throw error;
  }
  return result;
}

function replay<T>(storedHash: string, resultJson: string, requestHash: string): T {
  if (storedHash !== requestHash) throw conflict('相同幂等键但请求内容不同');
  return JSON.parse(resultJson) as T;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}

export type PrismaClientLike = {
  idempotencyKey: {
    findUnique(args: { where: { key: string } }): Promise<{ requestHash: string; resultJson: string } | null>;
    create(args: {
      data: { key: string; requestHash: string; resultJson: string };
    }): Promise<unknown>;
  };
};
