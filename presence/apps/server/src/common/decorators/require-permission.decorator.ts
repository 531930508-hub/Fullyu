import { SetMetadata } from '@nestjs/common'

/** 权限点元数据 key */
export const PERMISSION_KEY = 'requiredPermission'

/**
 * 声明访问该后台接口所需的权限点 code，如 'course:create'。
 * 与 AdminJwtStrategy + PermissionGuard 配合使用。
 */
export const RequirePermission = (...codes: string[]) =>
  SetMetadata(PERMISSION_KEY, codes)
