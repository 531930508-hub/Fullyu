import { Injectable } from '@nestjs/common'
import { BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { isValidImageDataUrl, normalizeAvatarValue, normalizeImageDataUrl } from '../../common/image.util'
import { CrmClient } from '../../common/crm/crm.client'

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmClient,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        trainerProfile: true,
      },
    })
    return user ? this.toSelfProfile(user) : null
  }

  /**
   * 自助资料只返回「是否已有有效核验照片」的布尔值，不把照片本体下发到客户端；
   * 历史脏数据（非图片字符串）按缺失处理，促使下次购卡重新上传。
   */
  private toSelfProfile<T extends { photo?: string | null }>(user: T) {
    const { photo, ...safe } = user
    return { ...safe, hasVerificationPhoto: isValidImageDataUrl(photo) }
  }

  /** 后台用户列表（关键字搜索手机号/昵称） */
  async adminList(query: { keyword?: string }) {
    const where: any = {}
    if (query.keyword) {
      where.OR = [
        { phone: { contains: query.keyword } },
        { nickname: { contains: query.keyword } },
      ]
    }
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  }

  async updateProfile(userId: string, data: { nickname?: string; avatar?: string; language?: string }) {
    // 注意：个人核验照片 photo 不允许用户自助修改，仅后台或购卡链路录入
    const payload: { nickname?: string; avatar?: string; language?: string } = {}
    if (data.nickname !== undefined) {
      const nickname = String(data.nickname || '').trim()
      if (!nickname) throw new BadRequestException('昵称不能为空')
      if (nickname.length > 20) throw new BadRequestException('昵称不能超过 20 个字符')
      payload.nickname = nickname
    }
    if (data.avatar !== undefined) {
      const avatar = normalizeAvatarValue(data.avatar)
      if (avatar === null) {
        throw new BadRequestException('头像格式不正确，请重新选择图片后上传')
      }
      payload.avatar = avatar
    }
    if (data.language !== undefined) {
      if (data.language !== 'zh' && data.language !== 'en') {
        throw new BadRequestException('不支持的语言设置')
      }
      payload.language = data.language
    }
    if (!Object.keys(payload).length) return this.findById(userId)
    const updated = await this.prisma.user.update({ where: { id: userId }, data: payload })
    return this.toSelfProfile(updated)
  }

  /** 后台更新用户个人核验照片（用户不可自助修改） */
  async adminUpdatePhoto(userId: string, photo: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new BadRequestException('用户不存在')
    const normalized = normalizeImageDataUrl(photo)
    if (!normalized) {
      throw new BadRequestException('照片必须是 JPG / PNG / WEBP 图片，且不超过 5MB')
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { photo: normalized },
    })
    return this.toSelfProfile(updated)
  }

  async getPointsBalance(userId: string): Promise<number> {
    // 接入 CRM 后积分以会员中心为唯一账本；本地 pointsRecord 只作历史遗留数据。
    if (this.crm.enabled) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, phone: true, nickname: true, unionId: true, openId: true },
      })
      if (!user) return 0
      const known = await this.crm.getByLocalUser(user.id)
      if (known) return known.balance
      // 开启 CRM 前登录的老会话没有会员身份，读取时补一次解析。
      const member = await this.crm.resolve({
        localUserId: user.id,
        phone: user.phone,
        name: user.nickname,
        unionId: user.unionId,
        openId: user.openId,
      })
      return member.balance
    }
    const latest = await this.prisma.pointsRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return latest?.balance ?? 0
  }

  async getPointsHistory(userId: string, page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      this.prisma.pointsRecord.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pointsRecord.count({ where: { userId } }),
    ])
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }
}
