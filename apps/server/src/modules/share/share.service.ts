import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as QRCode from 'qrcode'
import { PrismaService } from '../../common/prisma.service'
import { WechatService } from '../../common/wechat/wechat.service'
import { BusinessException } from '../../common/exceptions/business.exception'

/**
 * 分享与扫码落地：
 * - 小程序卡片 / 海报共用同一套目标描述
 * - 二维码优先调用微信 getwxacodeunlimit（服务端专用），未配置微信凭据时回退为 H5 链接二维码
 * - scene 长度必须 ≤ 32，格式：<类型前缀><cuid>
 */
export type ShareType = 'course' | 'community' | 'event' | 'host' | 'invite'

const SCENE_PREFIX: Record<ShareType, string> = {
  course: 'k',
  community: 'c',
  event: 'e',
  host: 'h',
  invite: 'i',
}

const PREFIX_TYPE = Object.fromEntries(
  Object.entries(SCENE_PREFIX).map(([type, prefix]) => [prefix, type]),
) as Record<string, ShareType>

export interface ShareArtwork {
  /** custom=专用分享图；cover=使用封面；brand=品牌版式兜底 */
  source: 'custom' | 'cover' | 'brand'
  /** warm=暖棕；sage=橄榄；ink=墨色 */
  palette: 'warm' | 'sage' | 'ink'
  /** left=左对齐；center=居中 */
  layout: 'left' | 'center'
  /** source=custom 时的成品 5:4 图片地址 */
  imageUrl?: string
  updatedAt?: string
}

export interface SharePayload {
  type: ShareType
  id: string
  available: boolean
  /** normal / ended / restricted / unavailable */
  state: 'normal' | 'ended' | 'restricted' | 'unavailable'
  reason?: string
  title: string
  subtitle: string
  description?: string
  path: string
  scene: string
  /** 小程序卡片 5:4 图片 */
  imageUrl: string
  /** 海报二维码（PNG） */
  qrUrl: string
  artwork: ShareArtwork
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const value = JSON.parse(raw)
    return (value ?? fallback) as T
  } catch {
    return fallback
  }
}

@Injectable()
export class ShareService {
  private readonly logger = new Logger('ShareService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechat: WechatService,
    private readonly config: ConfigService,
  ) {}

  private get apiBase(): string {
    return (
      this.config.get<string>('PUBLIC_API_BASE') ||
      'https://api.fuyu.cn/api/v1'
    ).replace(/\/+$/, '')
  }

  private get h5Base(): string {
    return (this.config.get<string>('SHARE_H5_BASE') || 'https://presence.fuyu.cn').replace(/\/+$/, '')
  }

  encodeScene(type: ShareType, id: string): string {
    const scene = `${SCENE_PREFIX[type]}${id}`
    if (Buffer.byteLength(scene, 'utf8') > 32) {
      throw new BusinessException('分享标识超长，无法生成小程序码', 4009)
    }
    return scene
  }

  parseScene(scene: string): { type: ShareType; id: string } | null {
    if (!scene) return null
    const prefix = scene.slice(0, 1)
    const type = PREFIX_TYPE[prefix]
    if (!type) return null
    const id = scene.slice(1)
    return id ? { type, id } : null
  }

  parseArtwork(raw: string | null | undefined): ShareArtwork {
    const value = parseJson<Partial<ShareArtwork>>(raw, {})
    return {
      source: value.source === 'custom' || value.source === 'cover' ? value.source : 'brand',
      palette: value.palette === 'sage' || value.palette === 'ink' ? value.palette : 'warm',
      layout: value.layout === 'center' ? 'center' : 'left',
      imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : undefined,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
    }
  }

  private defaultArtImage(): string {
    return `${this.apiBase}/share/art/default-5x4.jpg`
  }

  /** 只允许网络图片作为分享卡片图；data URI/base64 无法被微信卡片使用 */
  private networkImage(value: string | null | undefined): string {
    if (!value) return ''
    return /^https?:\/\//i.test(value) ? value : ''
  }

  private communityImage(c: any, artwork: ShareArtwork): string {
    const custom = artwork.source === 'custom' ? this.networkImage(artwork.imageUrl) : ''
    const cover = this.networkImage(c.coverUrl)
    return custom || cover || this.defaultArtImage()
  }

  private fmtDate(d: Date | string): string {
    const date = d instanceof Date ? d : new Date(d)
    const m = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${date.getFullYear()}-${m}-${day}`
  }

  private eventEndAt(e: { eventDate: Date | string; time: string; endTime?: string | null }): Date {
    const date = this.fmtDate(e.eventDate)
    const end = e.endTime || e.time || '23:59'
    const value = new Date(`${date}T${end}:00`)
    return Number.isFinite(value.getTime()) ? value : new Date(`${date}T23:59:59`)
  }

  private basePayload(type: ShareType, id: string, scene: string): SharePayload {
    return {
      type,
      id,
      available: true,
      state: 'normal',
      title: '',
      subtitle: '',
      path: '',
      scene,
      imageUrl: this.defaultArtImage(),
      qrUrl: `${this.apiBase}/share/qrcode?scene=${encodeURIComponent(scene)}`,
      artwork: { source: 'brand', palette: 'warm', layout: 'left' },
    }
  }

  private unavailable(type: ShareType, id: string, reason: string): SharePayload {
    const p = this.basePayload(type, id, '')
    p.available = false
    p.state = 'unavailable'
    p.reason = reason
    p.title = '内容不可用'
    p.subtitle = reason
    return p
  }

  /** 解析分享目标；公开信息为主，邀请制社群不暴露私密详情 */
  async getPayload(type: ShareType, id: string): Promise<SharePayload> {
    if (!id) throw new BusinessException('缺少分享目标', 4000)
    const scene = this.encodeScene(type, id)
    const p = this.basePayload(type, id, scene)

    if (type === 'community') {
      const c = await this.prisma.community.findFirst({
        where: { id, status: 'APPROVED', isActive: true },
      })
      if (!c) return this.unavailable(type, id, '社群已下架或删除')
      const artwork = this.parseArtwork(c.shareArtwork)
      p.artwork = artwork
      p.imageUrl = this.communityImage(c, artwork)
      p.title = c.name
      p.path = `/pages/community-detail/index?id=${id}`
      if (c.visibility === 'INVITE_ONLY') {
        p.state = 'restricted'
        p.subtitle = '仅限受邀成员查看'
        p.description = '该社群不公开内容，请通过主理人邀请加入。'
        return p
      }
      p.subtitle = c.slogan || c.ownerName || 'Full愈 社群'
      p.description = c.description || c.slogan || ''
      return p
    }

    if (type === 'event') {
      const e = await this.prisma.communityEvent.findUnique({
        where: { id },
        include: { community: true },
      })
      if (!e || !e.isActive) return this.unavailable(type, id, '活动已删除或停用')
      const c = e.community
      if (!c || c.status !== 'APPROVED' || !c.isActive) {
        return this.unavailable(type, id, '所属社群已下架')
      }
      if (e.scope === 'INTERNAL') {
        return this.unavailable(type, id, '该活动仅对社群成员开放')
      }
      const artwork = this.parseArtwork(e.shareArtwork || c.shareArtwork)
      p.artwork = artwork
      p.imageUrl = this.communityImage(c, artwork)
      p.title = e.title
      p.subtitle = `${this.fmtDate(e.eventDate)} ${e.time || ''} · ${e.venue || c.name}`.trim()
      p.description = e.description || c.name
      p.path = `/pages/community-event-detail/index?id=${e.id}&cid=${e.communityId}`
      if (this.eventEndAt(e).getTime() <= Date.now()) {
        p.state = 'ended'
      }
      return p
    }

    if (type === 'host') {
      const user = await this.prisma.user.findUnique({ where: { id } })
      const c = await this.prisma.community.findFirst({
        where: { ownerUserId: id, status: 'APPROVED', isActive: true },
        orderBy: { createdAt: 'asc' },
      })
      if (!user || !c) return this.unavailable(type, id, '主理人主页不可用')
      const artwork = this.parseArtwork(c.shareArtwork)
      p.artwork = artwork
      p.imageUrl = this.communityImage(c, artwork)
      p.title = `${user.nickname} · 社群主理人`
      p.subtitle = c.name
      p.description = c.slogan || ''
      p.path = `/pages/community-detail/index?id=${c.id}&host=${id}`
      return p
    }

    if (type === 'invite') {
      const invite = await this.prisma.communityInvite.findUnique({
        where: { id },
        include: { community: true },
      })
      if (!invite || !invite.isActive) return this.unavailable(type, id, '邀请已失效')
      if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
        return this.unavailable(type, id, '邀请已过期')
      }
      if (invite.quota > 0 && invite.usedCount >= invite.quota) {
        return this.unavailable(type, id, '邀请名额已满')
      }
      const c = invite.community
      if (!c || c.status !== 'APPROVED' || !c.isActive) {
        return this.unavailable(type, id, '所属社群已下架')
      }
      const artwork = this.parseArtwork(c.shareArtwork)
      p.artwork = artwork
      p.imageUrl = this.communityImage(c, artwork)
      p.title = invite.name
      p.subtitle = invite.kind === 'WAIVER'
        ? `${c.name} · 免年费加入`
        : invite.kind === 'REDUCE'
          ? `${c.name} · 立减 ¥${(invite.amount / 100).toFixed(2)}`
          : `${c.name} · 社群邀请`
      p.description = '领取后仍需满足入群审核条件；邀请不替代审核。'
      p.path = `/pages/share-landing/index?scene=${scene}`
      return p
    }

    // 课程
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { trainer: { select: { displayName: true } } },
    })
    if (!course || course.status !== 'PUBLISHED') {
      return this.unavailable(type, id, '课程已下架或未发布')
    }
    p.title = course.title
    p.subtitle = `${this.fmtDate(course.startDate)} · ${course.trainer?.displayName || 'Full愈'}`
    p.description = course.description?.replace(/<[^>]+>/g, '').slice(0, 80) || ''
    p.imageUrl = this.networkImage(course.coverImage) || this.defaultArtImage()
    p.path = `/pages/course-detail/index?id=${course.id}`
    const end = new Date(`${this.fmtDate(course.endDate)}T${course.endTime || '23:59'}:00`)
    if (Number.isFinite(end.getTime()) && end.getTime() <= Date.now()) {
      p.state = 'ended'
    }
    return p
  }

  /** 生成二维码 PNG：优先小程序码，未配置或失败时回退 H5 链接码 */
  async getQrBuffer(scene: string): Promise<{ buffer: Buffer; engine: 'wechat' | 'h5' }> {
    const parsed = this.parseScene(scene)
    if (!parsed) throw new BusinessException('无效的分享标识', 4000)

    const appId = this.config.get<string>('WECHAT_APP_ID')
    const appSecret = this.config.get<string>('WECHAT_APP_SECRET')
    if (appId && appSecret) {
      try {
        const mpState = this.config.get<string>('WECHAT_MP_STATE', 'formal')
        const envVersion = mpState === 'trial' ? 'trial' : mpState === 'develop' ? 'develop' : 'release'
        const buffer = await this.wechat.getUnlimitedQrCode({
          scene,
          page: 'pages/share-landing/index',
          envVersion,
        })
        return { buffer, engine: 'wechat' }
      } catch (e) {
        this.logger.warn(`小程序码生成失败，回退 H5 二维码: ${(e as Error).message}`)
      }
    }

    const url = `${this.h5Base}/#/pages/share-landing/index?scene=${encodeURIComponent(scene)}`
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 430,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#3a2a1a', light: '#ffffff' },
    })
    return { buffer, engine: 'h5' }
  }

  /** 扫码落地：返回目标与可用性，不返回任何私密成员信息 */
  async resolveScene(scene: string) {
    const parsed = this.parseScene(scene)
    if (!parsed) {
      return { available: false, state: 'unavailable', reason: '二维码无效或已过期' }
    }
    const payload = await this.getPayload(parsed.type, parsed.id)
    return {
      available: payload.available,
      state: payload.state,
      reason: payload.reason || '',
      type: payload.type,
      id: payload.id,
      title: payload.title,
      subtitle: payload.subtitle,
      path: payload.path,
      imageUrl: payload.imageUrl,
    }
  }

  /** 社群/活动分享视觉配置（后台保存） */
  async saveArtwork(input: {
    communityId?: string
    eventId?: string
    artwork: Partial<ShareArtwork>
  }) {
    const artwork: ShareArtwork = {
      source: input.artwork.source === 'custom' || input.artwork.source === 'cover' ? input.artwork.source : 'brand',
      palette: input.artwork.palette === 'sage' || input.artwork.palette === 'ink' ? input.artwork.palette : 'warm',
      layout: input.artwork.layout === 'center' ? 'center' : 'left',
      imageUrl: typeof input.artwork.imageUrl === 'string' ? input.artwork.imageUrl : undefined,
      updatedAt: new Date().toISOString(),
    }
    if (input.eventId) {
      const event = await this.prisma.communityEvent.findUnique({
        where: { id: input.eventId },
        select: { id: true, community: { select: { shareArtwork: true } } },
      })
      if (!event) throw new BusinessException('活动不存在', 4040)
      const saved = await this.prisma.communityEvent.update({
        where: { id: input.eventId },
        data: { shareArtwork: JSON.stringify(artwork) },
        select: { shareArtwork: true },
      })
      return { artwork: this.parseArtwork(saved.shareArtwork) }
    }
    if (!input.communityId) throw new BusinessException('缺少社群或活动', 4000)
    const exist = await this.prisma.community.findUnique({
      where: { id: input.communityId },
      select: { id: true },
    })
    if (!exist) throw new BusinessException('社群不存在', 4040)
    const saved = await this.prisma.community.update({
      where: { id: input.communityId },
      data: { shareArtwork: JSON.stringify(artwork) },
      select: { shareArtwork: true },
    })
    return { artwork: this.parseArtwork(saved.shareArtwork) }
  }

  /** 分享目标候选（后台预览用） */
  async previewTargets(communityId: string) {
    const c = await this.prisma.community.findUnique({
      where: { id: communityId },
      select: {
        id: true, name: true, ownerUserId: true, coverUrl: true, shareArtwork: true,
        events: {
          where: { isActive: true },
          orderBy: [{ eventDate: 'asc' }, { time: 'asc' }],
          select: { id: true, title: true, eventDate: true, time: true },
        },
      },
    })
    if (!c) throw new BusinessException('社群不存在', 4040)
    return {
      community: { type: 'community', id: c.id, title: c.name },
      host: c.ownerUserId ? { type: 'host', id: c.ownerUserId, title: '主理人主页' } : null,
      events: c.events.map((e) => ({
        type: 'event',
        id: e.id,
        title: e.title,
        date: `${this.fmtDate(e.eventDate)} ${e.time}`.trim(),
      })),
    }
  }
}
