import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from './errors';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;

    if (exception instanceof ApiError) {
      response.status(exception.statusCode).json({
        error: exception.code || 'ERROR',
        message: exception.message,
        details: exception.details
      });
      return;
    }

    if (exception instanceof ZodError) {
      response.status(400).json({
        error: 'VALIDATION',
        message: '请求参数不完整或格式不正确',
        details: exception.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
      });
      return;
    }

    // 请求体超过上限时 express body-parser 抛的是普通 Error（status 413），
    // 不识别会落到 500 并写错误日志；这里返回明确的 413，便于前端提示压缩图片。
    const bodyError = exception as { type?: string; status?: number; statusCode?: number } | null;
    if (
      bodyError &&
      (bodyError.type === 'entity.too.large' || bodyError.status === 413 || bodyError.statusCode === 413)
    ) {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        error: 'PAYLOAD_TOO_LARGE',
        message: '请求内容过大，请压缩图片或减少数据量后重试'
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        // ThrottlerException 的原始文案是英文内部信息，不直接暴露给顾客/员工。
        response.status(HttpStatus.TOO_MANY_REQUESTS).json({
          error: 'TOO_MANY_REQUESTS',
          message: '操作过于频繁，请稍后再试'
        });
        return;
      }
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      response.status(status).json({
        error: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'ERROR',
        message: Array.isArray(message) ? message.join('；') : message
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'SERVER_ERROR',
      message: '服务暂时不可用，请稍后重试'
    });
  }
}
