import type { ZodType } from 'zod';
import { ApiError } from './errors';

export function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw new ApiError(400, '请求参数不完整或格式不正确', {
      code: 'VALIDATION',
      details: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    });
  }
  return result.data;
}
