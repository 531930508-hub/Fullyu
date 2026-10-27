import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { StorageService } from '../../common/storage/storage.service'

export interface BannerInput {
  title: string
  subtitle?: string
  bg?: string
  imageUrl?: string
  linkType?: string
  linkValue?: string
  sortOrder?: number
  isActive?: boolean
}

@Injectable()
export class BannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 上传接口返回的是 OSS 临时签名 URL。数据库只保存对象 key；
   * 同时兼容历史数据中的完整签名 URL，并保留外部永久 URL。
   */
  private normalizeImageRef(value?: string | null): string | null {
    if (!value) return null
    if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '')

    try {
      const url = new URL(value)
      const isSignedOssUrl =
        url.searchParams.has('OSSAccessKeyId') &&
        url.searchParams.has('Expires') &&
        url.searchParams.has('Signature')
      if (isSignedOssUrl) return decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    } catch {
      return value
    }

    return value
  }

  private withFreshImageUrl<T extends { imageUrl: string | null }>(banner: T): T {
    const imageRef = this.normalizeImageRef(banner.imageUrl)
    if (!imageRef || /^https?:\/\//i.test(imageRef)) return banner
    return { ...banner, imageUrl: this.storage.signedUrl(imageRef) }
  }

  /** 小程序首页：仅返回启用的 Banner，按排序升序 */
  async listActive() {
    const banners = await this.prisma.banner.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return banners.map((banner) => this.withFreshImageUrl(banner))
  }

  /** 后台：全部 Banner */
  async adminList() {
    const banners = await this.prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return banners.map((banner) => this.withFreshImageUrl(banner))
  }

  async create(input: BannerInput) {
    if (!input.title) throw new BusinessException('标题不能为空', 4000)
    return this.prisma.banner.create({
      data: {
        title: input.title,
        subtitle: input.subtitle ?? null,
        bg: input.bg ?? null,
        imageUrl: this.normalizeImageRef(input.imageUrl),
        linkType: input.linkType ?? 'none',
        linkValue: input.linkValue ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    })
  }

  async update(id: string, input: BannerInput) {
    const exist = await this.prisma.banner.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('Banner 不存在', 4040)
    return this.prisma.banner.update({
      where: { id },
      data: {
        title: input.title ?? exist.title,
        subtitle: input.subtitle ?? null,
        bg: input.bg ?? null,
        imageUrl: this.normalizeImageRef(input.imageUrl),
        linkType: input.linkType ?? exist.linkType,
        linkValue: input.linkValue ?? null,
        sortOrder: input.sortOrder ?? exist.sortOrder,
        isActive: input.isActive ?? exist.isActive,
      },
    })
  }

  async setStatus(id: string, isActive: boolean) {
    const exist = await this.prisma.banner.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('Banner 不存在', 4040)
    return this.prisma.banner.update({ where: { id }, data: { isActive } })
  }

  async remove(id: string) {
    const exist = await this.prisma.banner.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('Banner 不存在', 4040)
    await this.prisma.banner.delete({ where: { id } })
    return { success: true }
  }
}
