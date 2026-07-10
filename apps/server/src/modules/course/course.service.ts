import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { CourseStatus } from '@prisma/client'

@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取课程列表（小程序端）
   */
  async findPublished(query: {
    page?: number
    pageSize?: number
    timeFilter?: 'today' | 'week' | 'month'
    category?: string
    memberOnly?: boolean
    sortPrice?: 'asc' | 'desc'
  }) {
    const { page = 1, pageSize = 10, timeFilter, category, sortPrice } = query
    const now = new Date()

    const where: any = { status: CourseStatus.PUBLISHED }

    // 时间筛选
    if (timeFilter === 'today') {
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)
      where.startDate = { gte: todayStart, lt: tomorrow }
    } else if (timeFilter === 'week') {
      const weekEnd = new Date(now)
      weekEnd.setDate(weekEnd.getDate() + 7)
      where.startDate = { gte: now, lt: weekEnd }
    } else if (timeFilter === 'month') {
      const monthEnd = new Date(now)
      monthEnd.setMonth(monthEnd.getMonth() + 1)
      where.startDate = { gte: now, lt: monthEnd }
    }

    // 分类筛选
    if (category) {
      where.categories = { has: category }
    }

    const orderBy: any = sortPrice ? { originalPrice: sortPrice } : { startDate: 'asc' }

    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          trainer: { select: { displayName: true, avatar: true, level: true } },
          venue: { select: { name: true, address: true } },
        },
      }),
      this.prisma.course.count({ where }),
    ])

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  /**
   * 获取课程详情
   */
  async findById(id: string) {
    return this.prisma.course.findUnique({
      where: { id },
      include: {
        trainer: true,
        venue: true,
        priceTiers: true,
      },
    })
  }

  /**
   * 创建课程（管理后台）
   */
  async create(data: any) {
    return this.prisma.course.create({ data })
  }

  /**
   * 更新课程
   */
  async update(id: string, data: any) {
    return this.prisma.course.update({ where: { id }, data })
  }

  /**
   * 后台课程列表（全部状态，可分页/过滤）
   */
  async adminList(query: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
    const { page = 1, pageSize = 10, status, keyword } = query
    const where: any = {}
    if (status) where.status = status
    if (keyword) where.title = { contains: keyword, mode: 'insensitive' }
    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          trainer: { select: { displayName: true } },
          venue: { select: { name: true } },
        },
      }),
      this.prisma.course.count({ where }),
    ])
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  /**
   * 发布 / 下架 / 取消课程（状态流转）
   */
  async setStatus(id: string, status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED') {
    return this.prisma.course.update({ where: { id }, data: { status } })
  }

  /**
   * 覆盖式保存课程阶梯价
   */
  async savePriceTiers(
    courseId: string,
    tiers: { seatFrom: number; seatTo: number; price: number }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.coursePriceTier.deleteMany({ where: { courseId } })
      if (tiers.length) {
        await tx.coursePriceTier.createMany({
          data: tiers.map((t) => ({ courseId, seatFrom: t.seatFrom, seatTo: t.seatTo, price: t.price })),
        })
      }
      return tx.coursePriceTier.findMany({ where: { courseId }, orderBy: { seatFrom: 'asc' } })
    })
  }

  /**
   * 覆盖式保存课程会员折扣
   */
  async saveMemberDiscounts(
    courseId: string,
    discounts: { cardType: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'; discountPercent: number }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.courseMemberDiscount.deleteMany({ where: { courseId } })
      if (discounts.length) {
        await tx.courseMemberDiscount.createMany({
          data: discounts.map((d) => ({ courseId, cardType: d.cardType, discountPercent: d.discountPercent })),
        })
      }
      return tx.courseMemberDiscount.findMany({ where: { courseId } })
    })
  }
}
