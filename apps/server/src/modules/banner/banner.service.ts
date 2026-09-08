import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

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
  constructor(private readonly prisma: PrismaService) {}

  /** 小程序首页：仅返回启用的 Banner，按排序升序 */
  async listActive() {
    return this.prisma.banner.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
  }

  /** 后台：全部 Banner */
  async adminList() {
    return this.prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
  }

  async create(input: BannerInput) {
    if (!input.title) throw new BusinessException('标题不能为空', 4000)
    return this.prisma.banner.create({
      data: {
        title: input.title,
        subtitle: input.subtitle ?? null,
        bg: input.bg ?? null,
        imageUrl: input.imageUrl ?? null,
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
        imageUrl: input.imageUrl ?? null,
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
