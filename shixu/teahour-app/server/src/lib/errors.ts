export class ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;

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
export const notFound = (message = '记录不存在') =>
  new ApiError(404, message, { code: 'NOT_FOUND' });
export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, message, { code: 'CONFLICT', details });
export const unprocessable = (message: string, details?: unknown) =>
  new ApiError(422, message, { code: 'UNPROCESSABLE', details });

export function assert(condition: unknown, error: Error): asserts condition {
  if (!condition) throw error;
}
