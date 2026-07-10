import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../common/prisma.service'
import { WechatService } from '../../common/wechat/wechat.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly wechat: WechatService,
  ) {}

  /**
   * 微信小程序手机号一键登录
   * @param loginCode uni.login 返回的 code，用于换 openid
   * @param phoneCode getPhoneNumber 返回的 code，用于换手机号
   */
  async wechatPhoneLogin(loginCode: string, phoneCode: string) {
    // 1. 换取 openid / unionid
    const session = await this.wechat.code2Session(loginCode)
    // 2. 换取手机号
    const phone = await this.wechat.getPhoneNumber(phoneCode)

    // 3. 查找或创建用户（优先按 openId 匹配，其次手机号）
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ openId: session.openid }, { phone }] },
    })
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          nickname: `用户${phone.slice(-4)}`,
          openId: session.openid,
          unionId: session.unionid,
        },
      })
    } else if (!user.openId) {
      // 老用户补齐 openId
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { openId: session.openid, unionId: session.unionid },
      })
    }

    // 4. 生成 JWT token
    const token = this.jwtService.sign({
      sub: user.id,
      phone: user.phone,
      isTrainer: user.isTrainer,
    })

    return {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
        isTrainer: user.isTrainer,
      },
    }
  }

  /**
   * 后台管理员登录
   */
  async adminLogin(username: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { username },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    })

    if (!admin || !admin.isActive) {
      throw new BusinessException('用户名或密码错误', 4001)
    }

    const bcrypt = require('bcrypt')
    const isValid = await bcrypt.compare(password, admin.password)
    if (!isValid) {
      throw new BusinessException('用户名或密码错误', 4001)
    }

    // 提取权限列表（去重）；超管拥有通配 '*'
    const permissionCodes = admin.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => rp.permission.code),
    )
    const roleNames = admin.roles.map((ur) => ur.role.name)
    const permissions = roleNames.includes('SUPER_ADMIN')
      ? ['*']
      : Array.from(new Set(permissionCodes))

    const token = this.jwtService.sign(
      {
        sub: admin.id,
        username: admin.username,
        type: 'admin',
        permissions,
      },
      {
        secret: this.configService.get('ADMIN_JWT_SECRET'),
        expiresIn: this.configService.get('ADMIN_JWT_EXPIRES_IN', '24h'),
      },
    )

    return {
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        permissions,
      },
    }
  }
}
