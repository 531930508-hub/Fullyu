import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class TrainerService {
  constructor(private readonly prisma: PrismaService) {}

  /** 导师列表（后台/小程序均可用） */
  async list(query: { keyword?: string; level?: number }) {
    const where: any = {}
    if (query.level) where.level = Number(query.level)
    if (query.keyword) {
      where.displayName = { contains: query.keyword, mode: 'insensitive' }
    }
    return this.prisma.trainerProfile.findMany({
      where,
      orderBy: { level: 'desc' },
      include: { user: { select: { phone: true, nickname: true, avatar: true } } },
    })
  }

  async detail(id: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id },
      include: { user: true, seedsRecords: { orderBy: { createdAt: 'desc' }, take: 50 } },
    })
    if (!trainer) throw new BusinessException('导师不存在', 4040)
    return trainer
  }

  /** 创建导师档案（需已有用户），并标记 isTrainer */
  async create(data: any) {
    const { userId, ...rest } = data
    if (!userId) throw new BusinessException('缺少关联用户', 4041)
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isTrainer: true } })
      return tx.trainerProfile.create({ data: { userId, ...rest } })
    })
  }

  async update(id: string, data: any) {
    const { userId, ...rest } = data
    return this.prisma.trainerProfile.update({ where: { id }, data: rest })
  }

  /** 调整导师 Seeds 余额（后台手动） */
  async adjustSeeds(id: string, amount: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const trainer = await tx.trainerProfile.findUnique({ where: { id } })
      if (!trainer) throw new BusinessException('导师不存在', 4040)
      const balance = trainer.seedsBalance + amount
      if (balance < 0) throw new BusinessException('Seeds 余额不足', 4042)
      await tx.seedsRecord.create({
        data: { trainerId: id, amount, balance, type: 'ADMIN_ADJUST', reason },
      })
      return tx.trainerProfile.update({
        where: { id },
        data: { seedsBalance: balance },
      })
    })
  }
}
