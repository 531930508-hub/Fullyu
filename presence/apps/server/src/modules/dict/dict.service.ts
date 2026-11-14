import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class DictService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全部值集（含选项） */
  async listSets() {
    return this.prisma.dictSet.findMany({
      orderBy: { createdAt: 'asc' },
      include: { items: { orderBy: { sort: 'asc' } } },
    })
  }

  /** 按 code 获取启用中的选项（前端/小程序取值） */
  async getItems(code: string) {
    if (!code) return []
    const set = await this.prisma.dictSet.findUnique({
      where: { code },
      include: { items: { where: { enabled: true }, orderBy: { sort: 'asc' } } },
    })
    return set?.items ?? []
  }

  async createSet(data: { code: string; name: string; desc?: string }) {
    const exists = await this.prisma.dictSet.findUnique({ where: { code: data.code } })
    if (exists) throw new BusinessException('值集编码已存在', 4100)
    return this.prisma.dictSet.create({ data: { ...data, system: false } })
  }

  async updateSet(id: string, data: { name?: string; desc?: string }) {
    return this.prisma.dictSet.update({ where: { id }, data })
  }

  async removeSet(id: string) {
    const set = await this.prisma.dictSet.findUnique({ where: { id } })
    if (!set) throw new BusinessException('值集不存在', 4101)
    if (set.system) throw new BusinessException('系统内置值集不可删除', 4102)
    await this.prisma.dictSet.delete({ where: { id } })
    return { success: true }
  }

  /** 覆盖式保存某值集的全部选项 */
  async saveItems(
    setId: string,
    items: { value: string; label: string; labelEn?: string; color?: string; enabled?: boolean; sort?: number }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.dictItem.deleteMany({ where: { setId } })
      if (items.length) {
        await tx.dictItem.createMany({
          data: items.map((i, idx) => ({
            setId,
            value: i.value,
            label: i.label,
            labelEn: i.labelEn || null,
            color: i.color,
            enabled: i.enabled ?? true,
            sort: i.sort ?? idx + 1,
          })),
        })
      }
      return tx.dictSet.findUnique({
        where: { id: setId },
        include: { items: { orderBy: { sort: 'asc' } } },
      })
    })
  }
}
