import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../common/prisma.service'

/**
 * 小程序用户 JWT 策略。
 *
 * 每次请求回查一次 users 行（与导师门户同口径）：JWT 只证明「签名对得住」，不证明账号还在。
 * 生产踩过的坑：换库 / 重建账号后，旧 token 依然验签通过（各环境 JWT_SECRET 曾共用同一个占位值），
 * 于是 /user/profile 返回 data:null，小程序只能显示「资料加载失败」，点重试永远是 null；
 * 积分、订单、优惠券还会静默返回 0 / 空数组，用户会以为资产被清零。
 * 所以这里把「subject 查无此人」判成 401：客户端收到 401 会清登录态、重新走微信登录，会话自愈。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    })
  }

  async validate(payload: { sub: string; phone: string; isTrainer: boolean }) {
    if (!payload?.sub) throw new UnauthorizedException('登录状态已失效，请重新登录')
    // 只查主键，开销等同一次点查；不额外拉字段，也不拿库里的值覆盖载荷。
    const account = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    })
    if (!account) throw new UnauthorizedException('登录状态已失效，请重新登录')
    return {
      userId: payload.sub,
      phone: payload.phone,
      isTrainer: payload.isTrainer,
    }
  }
}
