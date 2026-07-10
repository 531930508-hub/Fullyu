import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'

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
}
