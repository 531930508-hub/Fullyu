import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 仪表盘概览统计 */
  async overview() {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      userCount,
      courseCount,
      activeMemberCount,
      paidOrders,
      monthPaidOrders,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.course.count(),
      this.prisma.memberCard.count({
        where: { status: 'ACTIVE', endDate: { gt: now } },
      }),
      this.prisma.order.findMany({
        where: { status: { in: ['PAID', 'COMPLETED'] } },
        select: { actualPaid: true },
      }),
      this.prisma.order.findMany({
        where: {
          status: { in: ['PAID', 'COMPLETED'] },
          paymentTime: { gte: monthStart },
        },
        select: { actualPaid: true },
      }),
    ])

    const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.actualPaid), 0)
    const monthRevenue = monthPaidOrders.reduce((s, o) => s + Number(o.actualPaid), 0)

    return {
      userCount,
      courseCount,
      activeMemberCount,
      orderCount: paidOrders.length,
      totalRevenue,
      monthRevenue,
      monthOrderCount: monthPaidOrders.length,
    }
  }

  /** 近 N 天营收趋势 */
  async revenueTrend(days = 30) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: ['PAID', 'COMPLETED'] },
        paymentTime: { gte: since },
      },
      select: { actualPaid: true, paymentTime: true },
    })
    const map = new Map<string, number>()
    for (const o of orders) {
      if (!o.paymentTime) continue
      const key = o.paymentTime.toISOString().slice(0, 10)
      map.set(key, (map.get(key) ?? 0) + Number(o.actualPaid))
    }
    return Array.from(map.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }
}
