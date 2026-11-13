import type { ZodType } from 'zod';
import { ApiError } from './errors';

export function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }));
    // schema 里写了中文提示（例如“初始密码至少 8 位”）时优先透出，
    // 否则前端只能拿到泛化的“请求参数不完整或格式不正确”，用户不知道改哪一项。
    const friendly = details.find((detail) => /[\u4e00-\u9fa5]/.test(detail.message))?.message;
    throw new ApiError(400, friendly || '请求参数不完整或格式不正确', {
      code: 'VALIDATION',
      details
    });
  }
  return result.data;
}
