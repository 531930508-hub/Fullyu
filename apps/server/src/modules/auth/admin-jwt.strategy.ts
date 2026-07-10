import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'

/** 后台管理员 JWT 载荷 */
export interface AdminJwtPayload {
  sub: string
  username: string
  type: 'admin'
  permissions: string[]
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

  async validate(payload: AdminJwtPayload) {
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('无效的管理员令牌')
    }
    return {
      adminId: payload.sub,
      username: payload.username,
      permissions: payload.permissions ?? [],
    }
  }
}
