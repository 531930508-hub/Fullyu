import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class VenueService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.venue.findMany({ orderBy: { createdAt: 'desc' } })
  }

  async detail(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: { reservations: { orderBy: { date: 'desc' }, take: 100 } },
    })
    if (!venue) throw new BusinessException('场地不存在', 4050)
    return venue
  }

  async create(data: any) {
    return this.prisma.venue.create({ data })
  }

  async update(id: string, data: any) {
    return this.prisma.venue.update({ where: { id }, data })
  }

  async remove(id: string) {
    const inUse = await this.prisma.course.count({ where: { venueId: id } })
    if (inUse > 0) throw new BusinessException('该场地已被课程占用，无法删除', 4051)
    await this.prisma.venue.delete({ where: { id } })
    return { success: true }
  }

  // ===== 场地预约 =====

  async listReservations(venueId?: string, date?: string) {
    const where: any = {}
    if (venueId) where.venueId = venueId
    if (date) {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      where.date = { gte: start, lt: end }
    }
    return this.prisma.venueReservation.findMany({
      where,
      orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
      include: { venue: { select: { name: true } } },
    })
  }

  async createReservation(data: any) {
    // 冲突校验：同场地同日期时间段重叠
    const start = new Date(data.date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const sameDay = await this.prisma.venueReservation.findMany({
      where: { venueId: data.venueId, date: { gte: start, lt: end } },
    })
    const conflict = sameDay.some(
      (r) => data.startTime < r.endTime && data.endTime > r.startTime,
    )
    if (conflict) throw new BusinessException('该时间段场地已被预约', 4052)
    return this.prisma.venueReservation.create({ data })
  }

  async removeReservation(id: string) {
    await this.prisma.venueReservation.delete({ where: { id } })
    return { success: true }
  }
}
