import { applyDecorators, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth } from '@nestjs/swagger'
import { PermissionGuard } from '../guards/permission.guard'
import { RequirePermission } from './require-permission.decorator'

/**
 * 后台接口鉴权组合装饰器：管理员 JWT + 权限点校验。
 * 用法：@AdminAuth('course:create')
 */
export function AdminAuth(...permissions: string[]) {
  return applyDecorators(
    UseGuards(AuthGuard('admin-jwt'), PermissionGuard),
    RequirePermission(...permissions),
    ApiBearerAuth(),
  )
}
