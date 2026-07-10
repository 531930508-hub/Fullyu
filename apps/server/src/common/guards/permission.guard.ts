import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSION_KEY } from '../decorators/require-permission.decorator'

/**
 * 权限守卫：读取 @RequirePermission() 声明的权限点，
 * 与当前登录管理员（req.user.permissions）比对。
 * 超级管理员（permissions 含 '*'）放行所有。
 * 需与 AdminJwtGuard 一起使用（先鉴权后校验权限）。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true

    const req = context.switchToHttp().getRequest()
    const permissions: string[] = req.user?.permissions ?? []

    if (permissions.includes('*')) return true

    const ok = required.every((code) => permissions.includes(code))
    if (!ok) {
      throw new ForbiddenException('无权限执行该操作')
    }
    return true
  }
}
