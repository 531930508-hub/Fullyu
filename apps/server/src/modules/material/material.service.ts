import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'

@Injectable()
export class MaterialService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.material.findMany({ orderBy: { createdAt: 'desc' } })
  }

  async create(data: any) {
    return this.prisma.material.create({ data })
  }

  async update(id: string, data: any) {
    return this.prisma.material.update({ where: { id }, data })
  }

  async remove(id: string) {
    await this.prisma.material.delete({ where: { id } })
    return { success: true }
  }
}
