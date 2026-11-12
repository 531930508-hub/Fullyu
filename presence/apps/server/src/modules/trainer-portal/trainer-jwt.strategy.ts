import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../common/prisma.service'

/** 导师门户 JWT 载荷 */
export interface TrainerJwtPayload {
  sub: string
  type: 'trainer'
  trainerId: string
  phone: string
}

/** 挂载到 req.user 的导师上下文。trainerId 只来自服务端解析，绝不接收前端传参。 */
export interface TrainerContext {
  userId: string
  trainerId: string
  phone: string
  displayName: string
}

/**
 * 导师门户 JWT 策略（独立于小程序用户与后台管理员）。
 * 每次请求都回查数据库：导师离职、解绑、账号停用后旧 token 立即失效，
 * 避免「已注销的导师还能看学员名单」这类越权。
 */
@Injectable()
export class TrainerJwtStrategy extends PassportStrategy(Strategy, 'trainer-jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('TRAINER_JWT_SECRET') || configService.get('JWT_SECRET'),
    })
  }

  async validate(payload: TrainerJwtPayload): Promise<TrainerContext> {
    if (payload.type !== 'trainer') {
      throw new UnauthorizedException('无效的导师令牌')
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        phone: true,
        isTrainer: true,
        trainerProfile: { select: { id: true, displayName: true, status: true } },
      },
    })
    if (!user || !user.isTrainer || !user.trainerProfile) {
      throw new UnauthorizedException('导师身份已失效，请重新登录')
    }
    if (user.trainerProfile.status !== 'ACTIVE') {
      throw new UnauthorizedException('账号已停用，请联系教务')
    }
    return {
      userId: user.id,
      trainerId: user.trainerProfile.id,
      phone: user.phone,
      displayName: user.trainerProfile.displayName,
    }
  }
}