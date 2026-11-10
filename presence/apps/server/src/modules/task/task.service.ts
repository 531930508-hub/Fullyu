import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  /** 任务列表（后台） */
  async adminList(status?: string) {
    const where: any = {}
    if (status) where.status = status
    return this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { claims: true } } },
    })
  }

  /** 面向导师可见的任务（ALL 或指定该导师） */
  async listForTrainer(trainerId: string) {
    return this.prisma.task.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ scope: 'ALL' }, { specificTrainerIds: { array_contains: trainerId } }],
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(data: any) {
    return this.prisma.task.create({
      data: {
        title: data.title ?? '未命名任务',
        description: data.description ?? '',
        seedsReward: Number(data.seedsReward ?? 0),
        publisherCost: Number(data.publisherCost ?? 0),
        maxParticipants: Number(data.maxParticipants ?? 0),
        scope: data.scope === 'SPECIFIC' ? 'SPECIFIC' : 'ALL',
        specificTrainerIds: Array.isArray(data.specificTrainerIds) ? data.specificTrainerIds : [],
        status: data.status ?? 'PUBLISHED',
      },
    })
  }

  async update(id: string, data: any) {
    const payload: any = {}
    if (data.title !== undefined) payload.title = data.title
    if (data.description !== undefined) payload.description = data.description
    if (data.seedsReward !== undefined) payload.seedsReward = Number(data.seedsReward)
    if (data.publisherCost !== undefined) payload.publisherCost = Number(data.publisherCost)
    if (data.maxParticipants !== undefined) payload.maxParticipants = Number(data.maxParticipants)
    if (data.scope !== undefined) payload.scope = data.scope === 'SPECIFIC' ? 'SPECIFIC' : 'ALL'
    if (data.specificTrainerIds !== undefined) payload.specificTrainerIds = Array.isArray(data.specificTrainerIds) ? data.specificTrainerIds : []
    if (data.status !== undefined) payload.status = data.status
    return this.prisma.task.update({ where: { id }, data: payload })
  }

  async cancel(id: string) {
    return this.prisma.task.update({ where: { id }, data: { status: 'CANCELLED' } })
  }

  /** 导师领取任务 */
  async claim(taskId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 锁住任务行，串行化名额判断，避免并发领取突破 maxParticipants
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${taskId} FOR UPDATE`
      const task = await tx.task.findUnique({ where: { id: taskId } })
      if (!task || task.status !== 'PUBLISHED') {
        throw new BusinessException('任务不存在或已结束', 4070)
      }
      const exists = await tx.taskClaim.findUnique({
        where: { taskId_userId: { taskId, userId } },
      })
      if (exists) throw new BusinessException('已领取该任务', 4072)
      const claimed = await tx.taskClaim.count({ where: { taskId } })
      if (claimed >= task.maxParticipants) {
        throw new BusinessException('任务名额已满', 4071)
      }
      return tx.taskClaim.create({ data: { taskId, userId, status: 'CLAIMED' } })
    })
  }

  /** 审核完成任务 → 发放导师积分 */
  async complete(claimId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.taskClaim.findUnique({
        where: { id: claimId },
        include: { task: true },
      })
      if (!claim) throw new BusinessException('领取记录不存在', 4073)
      if (claim.status === 'COMPLETED') return claim

      // 条件更新：并发/重复审核只有一个事务能完成状态迁移，奖励只发一次
      const updated = await tx.taskClaim.updateMany({
        where: { id: claimId, status: 'CLAIMED' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
      if (!updated.count) return { success: true }

      const trainer = await tx.trainerProfile.findUnique({
        where: { userId: claim.userId },
      })
      if (trainer && claim.task.seedsReward > 0) {
        // 原子自增，避免并发审核时基于旧余额覆盖
        const rewarded = await tx.trainerProfile.update({
          where: { id: trainer.id },
          data: { seedsBalance: { increment: claim.task.seedsReward } },
        })
        await tx.seedsRecord.create({
          data: {
            trainerId: trainer.id,
            amount: claim.task.seedsReward,
            balance: rewarded.seedsBalance,
            type: 'TASK_REWARD',
            reason: `完成任务：${claim.task.title}`,
            relatedId: claim.taskId,
          },
        })
      }
      return { success: true }
    })
  }
}
