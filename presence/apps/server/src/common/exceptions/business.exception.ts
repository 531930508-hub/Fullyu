import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * 业务异常：用于服务层抛出可预期的业务错误。
 * code 为业务错误码（非 0），message 为提示文案。
 */
export class BusinessException extends HttpException {
  readonly bizCode: number

  constructor(message: string, bizCode = 1, httpStatus = HttpStatus.BAD_REQUEST) {
    super(message, httpStatus)
    this.bizCode = bizCode
  }
}
