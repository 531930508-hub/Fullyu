import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap, catchError } from 'rxjs/operators'
import { throwError } from 'rxjs'

/**
 * 结构化请求日志与关键操作审计：
 * - 记录 method/url/耗时/状态
 * - 对写操作（POST/PUT/DELETE）记录操作者，便于审计
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest()
    const { method, originalUrl } = req
    const start = Date.now()
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start
        const actor = req.user?.id || req.user?.adminId || 'anonymous'
        const base = `${method} ${originalUrl} ${ms}ms`
        if (isMutation) {
          this.logger.log(`${base} actor=${actor}`)
        } else {
          this.logger.debug(base)
        }
      }),
      catchError((err) => {
        const ms = Date.now() - start
        const actor = req.user?.id || req.user?.adminId || 'anonymous'
        this.logger.warn(
          `${method} ${originalUrl} ${ms}ms actor=${actor} error=${err?.message}`,
        )
        return throwError(() => err)
      }),
    )
  }
}
