import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator'

/** 统一响应结构 { code, message, data } */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/**
 * 全局响应转换拦截器：将 controller 返回值包装为 { code: 0, message: 'success', data }。
 * 标注 @SkipTransform() 的路由（如支付回调）保持原样输出。
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TRANSFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (skip) return next.handle()

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'success',
        data,
      })),
    )
  }
}
