import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { BusinessException } from '../exceptions/business.exception'

/**
 * 全局异常过滤器：统一错误响应为 { code, message, data: null }。
 * - BusinessException：返回其 bizCode 与业务文案
 * - HttpException：返回对应 HTTP 状态与文案
 * - 其他未捕获错误：记录日志并返回 500 通用文案
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter')

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR
    let bizCode = 500
    let message = '服务器内部错误'

    if (exception instanceof BusinessException) {
      httpStatus = exception.getStatus()
      bizCode = exception.bizCode
      message = exception.message
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus()
      bizCode = httpStatus
      const res = exception.getResponse()
      message =
        typeof res === 'string'
          ? res
          : ((res as any)?.message ?? exception.message)
      if (Array.isArray(message)) message = message.join('; ')
    } else if (exception instanceof Error) {
      // 服务层直接 throw new Error(...) 的兜底，视为业务提示
      httpStatus = HttpStatus.BAD_REQUEST
      bizCode = 1
      message = exception.message || message
      this.logger.error(exception.message, exception.stack)
    } else {
      this.logger.error('Unknown exception', JSON.stringify(exception))
    }

    if (httpStatus >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${message}`)
    }

    response.status(httpStatus).json({
      code: bizCode,
      message,
      data: null,
    })
  }
}
