import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        memberCards: { where: { status: { not: 'EXPIRED' } } },
        trainerProfile: true,
      },
    })
  }

  /** 后台用户列表（关键字搜索手机号/昵称） */
  async adminList(query: { keyword?: string }) {
    const where: any = {}
    if (query.keyword) {
      where.OR = [
        { phone: { contains: query.keyword } },
        { nickname: { contains: query.keyword, mode: 'insensitive' } },
      ]
    }
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        memberCards: { where: { status: 'ACTIVE' }, orderBy: { endDate: 'desc' }, take: 1 },
      },
    })
  }

  async updateProfile(userId: string, data: { nickname?: string; avatar?: string; language?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    })
  }

  async getPointsBalance(userId: string): Promise<number> {
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
