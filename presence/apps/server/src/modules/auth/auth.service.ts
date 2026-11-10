import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { widestDataScope, type DataScope } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { WechatService } from '../../common/wechat/wechat.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { PasswordPolicyService } from '../../common/password-policy.service'
import { resolveVisibleOrgIds } from '../../common/utils/data-scope.util'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly wechat: WechatService,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {
    // 仅本地开发：开关开启时打印醒目警告。
    // 注意：本项目本地与 ECS 共用 .env.local（均 NODE_ENV=production），故不能靠 NODE_ENV 区分；
    // DEV_LOGIN_ENABLED 只通过本地启动命令传入（不写入任何文件），生产启动时天然不存在。
    if (this.configService.get('DEV_LOGIN_ENABLED') === 'true') {
      console.warn(
        '⚠️  [DEV LOGIN] 已启用 /auth/dev/login（手机号免微信登录）——仅限本地开发，生产环境请勿开启！',
      )
    }
  }

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
   * 【仅本地开发】手机号快捷登录：跳过微信授权，按手机号查/建用户并发 token。
   * 默认关闭，仅当启动时显式传入 DEV_LOGIN_ENABLED=true 才生效。
   * 该开关不写入 .env.local / git / 镜像，只存于本地启动命令，生产启动时无此变量→无处可漏。
   */
  async devLogin(phone: string) {
    // 仅认显式开关 DEV_LOGIN_ENABLED（通过启动命令传入，不落文件），生产环境无此变量→默认关闭
    const enabled = this.configService.get('DEV_LOGIN_ENABLED') === 'true'
    if (!enabled) {
      // 关闭时对外表现为“接口不存在”，不泄露任何信息
      throw new BusinessException('接口不存在', 4004)
    }
    const normalizedPhone = (phone || '').trim()
    if (!/^1\d{10}$/.test(normalizedPhone)) {
      throw new BusinessException('请输入有效的手机号', 4000)
    }
    let user = await this.prisma.user.findFirst({ where: { phone: normalizedPhone } })
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: normalizedPhone,
          nickname: `用户${normalizedPhone.slice(-4)}`,
        },
      })
    }
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
        org: { select: { id: true, name: true, shortName: true, type: true } },
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
    const isSuper = roleNames.includes('SUPER_ADMIN')
    const permissions = isSuper ? ['*'] : Array.from(new Set(permissionCodes))

    // 多角色取最宽松的数据行级范围；超管恒为 ALL
    const dataScope: DataScope = isSuper
      ? 'ALL'
      : widestDataScope(admin.roles.map((ur) => ur.role.dataScope as DataScope))

    const token = this.jwtService.sign(
      {
        sub: admin.id,
        username: admin.username,
        type: 'admin',
        permissions,
        orgId: admin.orgId ?? null,
        dataScope,
        roles: roleNames,
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
        roles: roleNames,
        dataScope,
        org: admin.org
          ? { id: admin.org.id, name: admin.org.name, shortName: admin.org.shortName, type: admin.org.type }
          : null,
        mustChangePassword: this.passwordPolicy.shouldForceChange()
          ? (admin.mustChangePassword ?? false)
          : false,
      },
    }
  }

  /**
   * 当前登录管理员的权限画像。
   * 前端刷新页面后以此为权威数据源重建菜单与按钮可见性，
   * 避免仅依赖 localStorage（可被用户修改）。
   */
  async adminProfile(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      include: {
        org: { select: { id: true, name: true, shortName: true, type: true } },
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    })
    if (!admin || !admin.isActive) {
      throw new BusinessException('登录已失效，请重新登录', 4001)
    }

    const roleNames = admin.roles.map((ur) => ur.role.name)
    const isSuper = roleNames.includes('SUPER_ADMIN')
    const permissions = isSuper
      ? ['*']
      : Array.from(
          new Set(admin.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
        )
    const dataScope: DataScope = isSuper
      ? 'ALL'
      : widestDataScope(admin.roles.map((ur) => ur.role.dataScope as DataScope))

    // 行级范围内可见的组织 id，前端用于预置门店筛选器
    const visibleOrgIds = await resolveVisibleOrgIds(this.prisma, {
      orgId: admin.orgId ?? null,
      dataScope,
    })

    return {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      permissions,
      roles: roleNames,
      roleLabels: admin.roles.map((ur) => ur.role.description || ur.role.name),
      dataScope,
      org: admin.org
        ? { id: admin.org.id, name: admin.org.name, shortName: admin.org.shortName, type: admin.org.type }
        : null,
      visibleOrgIds,
      mustChangePassword: this.passwordPolicy.shouldForceChange()
        ? (admin.mustChangePassword ?? false)
        : false,
    }
  }

  /**
   * 后台管理员修改密码
   */
  async adminChangePassword(adminId: string, oldPassword: string, newPassword: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } })
    if (!admin) throw new BusinessException('用户不存在', 4004)

    const bcrypt = require('bcrypt')
    const isValid = await bcrypt.compare(oldPassword, admin.password)
    if (!isValid) throw new BusinessException('原密码错误', 4001)

    // 强度与「不能沿用原密码」都归密码策略管，测试阶段关掉策略后只拦空密码
    if (this.passwordPolicy.get().enabled && newPassword === oldPassword) {
      throw new BusinessException('新密码不能与原密码相同', 4002)
    }
    this.passwordPolicy.assertValid(newPassword)

    const hashed = await bcrypt.hash(newPassword, 10)
    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { password: hashed, mustChangePassword: false },
    })
    return { success: true }
  }
}
