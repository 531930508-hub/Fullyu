export class ApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, options: { code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, { code: 'BAD_REQUEST', details });
export const unauthorized = (message = '请先登录') =>
  new ApiError(401, message, { code: 'UNAUTHORIZED' });
export const forbidden = (message = '无权执行此操作') =>
  new ApiError(403, message, { code: 'FORBIDDEN' });
/**
 * 细分错误码：调用方传 `{ code: 'X' }`（且只有 code）时把它作为错误码返回，
 * 其余对象仍放进 details。避免业务码被通用码 CONFLICT/NOT_FOUND 吞掉。
 */
function split(fallback: string, details?: unknown): { code: string; details?: unknown } {
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const keys = Object.keys(details as object);
    const code = (details as { code?: unknown }).code;
    if (keys.length === 1 && typeof code === 'string' && code) return { code };
  }
  return { code: fallback, details };
}

export const notFound = (message = '记录不存在', details?: unknown) =>
  new ApiError(404, message, split('NOT_FOUND', details));
export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, message, split('CONFLICT', details));
export const unprocessable = (message: string, details?: unknown) =>
  new ApiError(422, message, { code: 'UNPROCESSABLE', details });
