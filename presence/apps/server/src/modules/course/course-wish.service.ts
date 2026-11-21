import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { decorateCourseLifecycle } from '@fullyu/shared'

/**
 * 可许愿的课程阶段：
 * - 往期（已结束 / 已完成）：想再上一节，开新班时通知
 * - 即将开课但当前报不了（报名未开始 / 报名已截止）：开售或开新班时通知
 * 报名中/补报名中的课程直接报名即可，不开放许愿。
 */
const WISHABLE_PHASES = new Set(['ENDED', 'COMPLETED', 'ENROLL_UPCOMING', 'ENROLL_CLOSED'])

/**
 * 往期课程许愿：
 * - 用户表达「想再上一节」，心愿数据用于复购运营
 * - 管理员从该课程复制出新场次并发布时，按心愿逐个推送订阅消息（见 CourseService.notifyWishers）
 */
@Injectable()
export class CourseWishService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 只有往期或「即将开课但当前报不了」的课程可许愿；
   * 在售/草稿/已下架课程拒绝，防止对可报名课程刷心愿。
   */
  private async assertWishable(courseId: string) {
    if (!courseId) throw new BadRequestException('缺少课程 id')
    const course = await this.prisma.course.findUnique({ where: { id: courseId } })
    if (!course) throw new NotFoundException('课程不存在')
    const phase = String(decorateCourseLifecycle(course).phase || '').toUpperCase()
    if (!WISHABLE_PHASES.has(phase)) {
      throw new BadRequestException('只有往期课程或尚未开放报名的课程可以许愿')
    }
    return course
  }

  /** 许愿概况（未登录只看数量，登录后附带自己是否已许愿） */
  async summary(courseId: string, userId?: string) {
    const [count, mine] = await Promise.all([
      this.prisma.courseWish.count({ where: { courseId } }),
      userId
        ? this.prisma.courseWish.findUnique({
            where: { courseId_userId: { courseId, userId } },
            select: { createdAt: true },
          })
        : null,
    ])
    return { count, wished: !!mine, wishedAt: mine?.createdAt ?? null }
  }

  /** 许愿（幂等：重复点击不报错、不重置时间） */
  async add(courseId: string, userId: string) {
    await this.assertWishable(courseId)
    await this.prisma.courseWish.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: { courseId, userId },
      update: {},
    })
    return this.summary(courseId, userId)
  }

  /** 取消许愿（幂等） */
  async remove(courseId: string, userId: string) {
    await this.prisma.courseWish.deleteMany({ where: { courseId, userId } })
    return this.summary(courseId, userId)
  }

  /** 我的心愿（按最新的在前，小程序「我的 - 我的心愿」） */
  async mine(userId: string, page = 1, pageSize = 20) {
    const safePage = Math.max(1, Number(page) || 1)
    const safeSize = Math.min(50, Math.max(1, Number(pageSize) || 20))
    const [rows, total] = await Promise.all([
      this.prisma.courseWish.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
        include: {
          course: {
            include: {
              trainer: { select: { displayName: true, avatar: true } },
              venue: { select: { name: true, address: true } },
            },
          },
        },
      }),
      this.prisma.courseWish.count({ where: { userId } }),
    ])
    return {
      items: rows.map((row) => {
        const course = decorateCourseLifecycle(row.course as any)
        return {
          id: row.id,
          createdAt: row.createdAt,
          notifiedAt: row.notifiedAt,
          course: {
            id: course.id,
            title: course.title,
            coverImage: course.coverImage,
            categories: course.categories,
            startDate: course.startDate,
            startTime: course.startTime,
            endTime: course.endTime,
            startAt: course.startAt,
            phase: course.phase,
            bookable: course.bookable,
            trainer: (row.course as any).trainer ?? null,
            venue: (row.course as any).venue ?? null,
          },
        }
      }),
      total,
      page: safePage,
      pageSize: safeSize,
      totalPages: Math.ceil(total / safeSize),
    }
  }
}