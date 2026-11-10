import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /** 后台评价列表（可按课程过滤） */
  async adminList(courseId?: string) {
    const where: any = {}
    if (courseId) where.courseId = courseId
    return this.prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { nickname: true, avatar: true } },
        course: { select: { title: true } },
      },
    })
  }

  /** 课程评价（小程序端） */
  async courseReviews(courseId: string) {
    return this.prisma.review.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { nickname: true, avatar: true } } },
    })
  }

  async remove(id: string) {
    await this.prisma.review.delete({ where: { id } })
    return { success: true }
  }

  /** 用户提交课程评价（需已报名该课程，按 userId+courseId 唯一 upsert） */
  async submitReview(userId: string, dto: { courseId: string; rating: number; content?: string }) {
    if (!dto?.courseId) throw new BusinessException('缺少课程ID', 4001)
    const rating = Math.round(Number(dto.rating))
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BusinessException('评分需在1-5之间', 4002)
    }
    const order = await this.prisma.order.findFirst({
      where: { userId, courseId: dto.courseId, orderType: 'COURSE', status: { in: ['PAID', 'COMPLETED'] } },
    })
    if (!order) throw new BusinessException('未报名该课程，无法评价', 4090)
    const content = dto.content?.trim() || null
    return this.prisma.review.upsert({
      where: { userId_courseId: { userId, courseId: dto.courseId } },
      create: { userId, courseId: dto.courseId, rating, content },
      update: { rating, content },
    })
  }

  /** 我的评价列表（小程序端） */
  async myReviews(userId: string) {
    return this.prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { course: { select: { id: true, title: true, coverImage: true } } },
    })
  }

  /** 导师评价与评分统计（该导师所有课程的评价） */
  async trainerReviews(trainerId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { course: { trainerId } },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { nickname: true, avatar: true } },
        course: { select: { title: true } },
      },
    })
    const count = reviews.length
    const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0
    return { count, avgRating: Number(avg.toFixed(1)), reviews }
  }
}
