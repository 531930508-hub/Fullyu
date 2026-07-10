import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { trainerId?: string }) {
    const where: any = {}
    if (query.trainerId) where.trainerId = query.trainerId
    return this.prisma.settlement.findMany({ where, orderBy: { settledAt: 'desc' } })
  }

  /**
   * 为已结束课程生成结算：hours * rate = amount
   * rate 默认取导师 hourlyRate，可覆盖
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

    const rate = data.rate ?? Number(course.trainer.hourlyRate)
    const amount = data.hours * rate

    return this.prisma.settlement.create({
      data: {
        trainerId: course.trainerId,
        courseId: data.courseId,
        hours: data.hours,
        rate,
        amount,
      },
    })
  }
}
