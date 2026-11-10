import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class TrainerLevelService {
  constructor(private readonly prisma: PrismaService) {}

  /** 等级列表（按 sort 升序） */
  async list() {
    return this.prisma.trainerLevel.findMany({ orderBy: { sort: 'asc' } })
  }

  async create(data: { level: number; name: string; hourlyRate?: number; sort?: number }) {
    const level = Number(data.level)
    if (!level) throw new BusinessException('请填写等级数值', 4043)
    const exists = await this.prisma.trainerLevel.findUnique({ where: { level } })
    if (exists) throw new BusinessException('该等级已存在', 4044)
    return this.prisma.trainerLevel.create({
      data: {
        level,
        name: data.name,
        hourlyRate: data.hourlyRate ?? 0,
        sort: data.sort ?? level,
      },
    })
  }

  async update(
    id: string,
    data: { name?: string; hourlyRate?: number; sort?: number },
  ) {
    return this.prisma.trainerLevel.update({
      where: { id },
      data: {
        name: data.name,
        hourlyRate: data.hourlyRate,
        sort: data.sort,
      },
    })
  }

  async remove(id: string) {
    await this.prisma.trainerLevel.delete({ where: { id } })
    return { success: true }
  }
}
