import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import type { DataScope } from '@fullyu/shared'

/** 后台管理员 JWT 载荷 */
export interface AdminJwtPayload {
  sub: string
  username: string
  type: 'admin'
  permissions: string[]
  /** 归属组织 id，行级权限基准；未绑定组织时为 null */
  orgId: string | null
  /** 多角色取最宽松后的数据行级范围 */
  dataScope: DataScope
  /** 角色标识列表，仅用于展示与日志 */
  roles: string[]
}

/** 挂载到 req.user 的当前管理员上下文 */
export interface AdminContext {
  adminId: string
  username: string
  permissions: string[]
  orgId: string | null
  dataScope: DataScope
  roles: string[]
}

/**
 * 后台管理员 JWT 策略（独立于小程序用户 jwt）。
 * 使用 ADMIN_JWT_SECRET 校验，validate 返回的对象挂载到 req.user。
 */
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('ADMIN_JWT_SECRET'),
    })
  }

  async validate(payload: AdminJwtPayload): Promise<AdminContext> {
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('无效的管理员令牌')
    }
    // 权限体系升级前签发的 token 没有 orgId / dataScope。若在这里兜默认值，
    // 行级范围会被收敛成 SELF，各列表静默变空——看起来像数据被清空了。
    // 直接判为失效，让前端清 token 跳登录页，比给一个空白页面可解释得多。
    if (payload.dataScope === undefined) {
      throw new UnauthorizedException('登录信息已过期，请重新登录')
    }
    return {
      adminId: payload.sub,
      username: payload.username,
      permissions: payload.permissions ?? [],
      orgId: payload.orgId ?? null,
      dataScope: payload.dataScope,
      roles: payload.roles ?? [],
    }
  }
}
