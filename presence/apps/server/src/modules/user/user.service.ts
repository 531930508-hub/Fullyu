import { Injectable } from '@nestjs/common'
import { BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { isValidImageDataUrl, normalizeAvatarValue, normalizeImageDataUrl } from '../../common/image.util'
import { CrmClient, type CrmProfilePatch } from '../../common/crm/crm.client'

/** 生日统一按 +08 输出 YYYY-MM-DD，避免前端拿到 UTC 时间戳后错一天 */
const birthdayText = (value: Date | null | undefined): string | null =>
  value ? new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) : null

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
  private toSelfProfile<T extends { photo?: string | null; birthday?: Date | null }>(user: T) {
    const { photo, birthday, ...safe } = user
    return {
      ...safe,
      birthday: birthdayText(birthday),
      hasVerificationPhoto: isValidImageDataUrl(photo),
    }
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

  async updateProfile(
    userId: string,
    data: {
      nickname?: string
      avatar?: string
      language?: string
      /** 1=男 2=女；null 表示清空 */
      gender?: number | null
      /** YYYY-MM-DD；null 表示清空 */
      birthday?: string | null
    },
  ) {
    // 注意：个人核验照片 photo 不允许用户自助修改，仅后台或购卡链路录入
    const payload: {
      nickname?: string
      avatar?: string
      language?: string
      gender?: number | null
      birthday?: Date | null
    } = {}
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
    if (data.gender !== undefined) {
      if (data.gender !== null && data.gender !== 1 && data.gender !== 2) {
        throw new BadRequestException('性别只能是 1（男）、2（女）或空')
      }
      payload.gender = data.gender
    }
    if (data.birthday !== undefined) {
      if (data.birthday === null) {
        payload.birthday = null
      } else {
        const text = String(data.birthday).trim()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
          throw new BadRequestException('生日格式应为 YYYY-MM-DD')
        }
        const birthday = new Date(`${text}T00:00:00+08:00`)
        if (Number.isNaN(birthday.getTime())) {
          throw new BadRequestException('生日格式应为 YYYY-MM-DD')
        }
        if (birthday.getTime() > Date.now()) throw new BadRequestException('生日不能晚于今天')
        payload.birthday = birthday
      }
    }
    if (!Object.keys(payload).length) return this.findById(userId)

    // CRM 是会员资料账本，本地只是展示副本：先写 CRM 再写本地。
    // CRM 调不通就整单失败，避免出现「小程序改了、会员中心还是旧的」。
    const patch: CrmProfilePatch = {}
    if (payload.nickname !== undefined) patch.name = payload.nickname
    if (payload.gender !== undefined) patch.gender = payload.gender
    if (data.birthday !== undefined) patch.birthday = data.birthday === null ? null : String(data.birthday).trim()
    // 本地头像是压缩后的 base64，只有 http(s) 地址才推给 CRM。
    if (payload.avatar !== undefined && /^https?:\/\//i.test(payload.avatar)) {
      patch.avatarUrl = payload.avatar
    }
    if (Object.keys(patch).length) await this.pushProfile(userId, patch)

    const updated = await this.prisma.user.update({ where: { id: userId }, data: payload })
    return this.toSelfProfile(updated)
  }

  /**
   * 资料回写 CRM；老会话可能还没在 CRM 建档（404），补一次 resolve 再用本次值建档。
   * resolve 只补空字段，所以建档时把「本次的新值」一起带上。
   */
  private async pushProfile(userId: string, patch: CrmProfilePatch) {
    if (!this.crm.enabled) return
    const outcome = await this.crm.updateProfile(userId, patch)
    if (outcome === 'UPDATED') return
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return
    const localAvatar = user.avatar && /^https?:\/\//i.test(user.avatar) ? user.avatar : null
    await this.crm.resolve({
      localUserId: user.id,
      phone: user.phone,
      name: patch.name ?? user.nickname,
      unionId: user.unionId,
      openId: user.openId,
      gender: patch.gender !== undefined ? patch.gender : user.gender,
      birthday: patch.birthday !== undefined ? patch.birthday : birthdayText(user.birthday),
      avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : localAvatar,
    })
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
