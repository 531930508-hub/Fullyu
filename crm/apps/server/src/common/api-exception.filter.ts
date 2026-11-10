import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
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

    const bodyError = exception as { type?: string; status?: number; statusCode?: number } | null;
    if (
      bodyError &&
      (bodyError.type === 'entity.too.large' || bodyError.status === 413 || bodyError.statusCode === 413)
    ) {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        error: 'PAYLOAD_TOO_LARGE',
        message: '请求内容过大，请减少数据量后重试'
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      response.status(status).json({
        error: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'ERROR',
        message: Array.isArray(message) ? message.join('；') : message
      });
      return;
    }

    // 未预期错误不让调用方看到内部信息，但服务端必须留下堆栈。
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'SERVER_ERROR',
      message: '服务暂时不可用，请稍后重试'
    });
  }
}
