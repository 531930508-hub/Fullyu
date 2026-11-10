import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { trainerId?: string; courseId?: string }) {
    const where: any = {}
    if (query.trainerId) where.trainerId = query.trainerId
    if (query.courseId) where.courseId = query.courseId
    return this.prisma.settlement.findMany({ where, orderBy: { settledAt: 'desc' } })
  }

  /**
   * 为已结束课程生成结算：hours * rate = amount
   * rate 默认取导师等级配置的时薪
   */
  async settle(data: { courseId: string; hours: number; rate?: number }) {
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId },
      include: { trainer: true },
    })
    if (!course) throw new BusinessException('课程不存在', 4090)

    const existing = await this.prisma.settlement.findFirst({
      where: { courseId: data.courseId, trainerId: course.trainerId },
    })
    if (existing) throw new BusinessException('该课程已结算', 4091)

    const hours = Number(data.hours)
    if (!(hours > 0)) throw new BusinessException('结算工时必须大于0', 4092)

    // 优先取等级配置时薪
    let rate = data.rate !== undefined ? Number(data.rate) : 0
    if (!rate) {
      const levelConfig = await this.prisma.trainerLevel.findUnique({ where: { level: course.trainer.level } })
      rate = levelConfig ? Number(levelConfig.hourlyRate) : Number(course.trainer.hourlyRate)
    }
    if (!(rate > 0)) throw new BusinessException('结算时薪必须大于0', 4093)
    const amount = hours * rate

    return this.prisma.settlement.create({
      data: {
        trainerId: course.trainerId,
        trainerName: course.trainer.displayName,
        courseId: data.courseId,
        courseName: course.title,
        hours,
        rate,
        amount,
      },
    })
  }

  /**
   * 课程完成后自动触发结算（由 course 模块调用）
   */
  async autoSettle(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { trainer: true },
    })
    if (!course) return

    // 已结算则跳过
    const existing = await this.prisma.settlement.findFirst({
      where: { courseId, trainerId: course.trainerId },
    })
    if (existing) return

    // 计算课时
    const [sh, sm] = (course.startTime || '0:0').split(':').map(Number)
    const [eh, em] = (course.endTime || '0:0').split(':').map(Number)
    const hours = Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
    if (hours <= 0) return

    // 取等级时薪
    const levelConfig = await this.prisma.trainerLevel.findUnique({ where: { level: course.trainer.level } })
    const rate = levelConfig ? Number(levelConfig.hourlyRate) : Number(course.trainer.hourlyRate)
    if (rate <= 0) return

    await this.prisma.settlement.create({
      data: {
        trainerId: course.trainerId,
        trainerName: course.trainer.displayName,
        courseId,
        courseName: course.title,
        hours,
        rate,
        amount: hours * rate,
      },
    })
  }

  /**
   * 人工调整结算金额（单笔）
   */
  async adjust(id: string, data: { adjustedAmount: number; adjustNote: string }) {
    const settlement = await this.prisma.settlement.findUnique({ where: { id } })
    if (!settlement) throw new BusinessException('结算记录不存在', 4094)
    return this.prisma.settlement.update({
      where: { id },
      data: {
        adjustedAmount: data.adjustedAmount,
        adjustNote: data.adjustNote,
        status: 'ADJUSTED',
      },
    })
  }

  /**
   * 批量调整
   */
  async batchAdjust(items: Array<{ id: string; adjustedAmount: number; adjustNote: string }>) {
    const results = []
    for (const item of items) {
      results.push(await this.adjust(item.id, item))
    }
    return results
  }
}
