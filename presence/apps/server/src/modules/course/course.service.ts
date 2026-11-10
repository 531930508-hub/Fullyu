import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { CourseStatus, CourseType, ScheduleType } from '@prisma/client'
import {
  courseEndAt,
  courseStartAt,
  decorateCourseLifecycle,
  isCourseDiscoverable,
  resolveCourseLifecycle,
} from '@fullyu/shared'
import { SettlementService } from '../settlement/settlement.service'

@Injectable()
export class CourseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
  ) {}

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
      where.categories = { array_contains: category }
    }

    const orderBy: any = sortPrice ? { originalPrice: sortPrice } : { startDate: 'asc' }

    // 已结束课程不进入发现流（列表页、首页）。
    // 结束时刻由 startDate/endDate + startTime/endTime 推导，无法在数据库层精确比较，
    // 因此在服务端过滤后再分页，保证 totalPages 与用户实际看到的一致。
    const rows = await this.prisma.course.findMany({
      where,
      orderBy,
      // 发现流只取卡片需要的列，避免把图集/富文本等大字段读出数据库。
      select: {
        id: true,
        status: true,
        title: true,
        coverImage: true,
        coverType: true,
        coverColor: true,
        type: true,
        categories: true,
        difficulty: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        enrollStartAt: true,
        enrollEndAt: true,
        originalPrice: true,
        currentEnrolled: true,
        maxCapacity: true,
        minCapacity: true,
        venueId: true,
        trainer: { select: { displayName: true } },
        venue: { select: { name: true, address: true } },
      },
    })
    const visible = rows.filter((course) => isCourseDiscoverable(course, now))
    const total = visible.length
    const items = visible
      .slice((page - 1) * pageSize, page * pageSize)
      .map((course) => this.toListItem(decorateCourseLifecycle(course, now)))

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  /**
   * 发现流只返回卡片需要的字段。
   * 图集、富文本、退款规则、阶梯价等详情字段留在 GET /courses/:id，避免首页为不展示的数据买单。
   */
  private toListItem(course: any) {
    return {
      id: course.id,
      title: course.title,
      coverImage: course.coverImage,
      coverType: course.coverType,
      coverColor: course.coverColor,
      type: course.type,
      categories: course.categories,
      difficulty: course.difficulty,
      startDate: course.startDate,
      endDate: course.endDate,
      startTime: course.startTime,
      endTime: course.endTime,
      originalPrice: course.originalPrice,
      currentEnrolled: course.currentEnrolled,
      maxCapacity: course.maxCapacity,
      minCapacity: course.minCapacity,
      venueId: course.venueId,
      venue: course.venue ? { name: course.venue.name, address: course.venue.address } : null,
      trainer: course.trainer ? { displayName: course.trainer.displayName } : null,
      phase: course.phase,
      phaseLabel: course.phaseLabel,
      bookable: course.bookable,
      discoverable: course.discoverable,
      startAt: course.startAt,
      endAt: course.endAt,
      enrollDeadline: course.enrollDeadline,
    }
  }

  /**
   * 获取课程详情：已结束课程仍可打开（只读），但状态与报名入口由 phase 决定
   */
  async findById(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        trainer: true,
        venue: true,
        priceTiers: true,
        memberDiscounts: true,
      },
    })
    return course ? decorateCourseLifecycle(course) : null
  }

  /** 排期方式：前端值 → 数据库枚举（缺省兜底，非法值报错） */
  private mapScheduleType(v: any): ScheduleType {
    if (v === undefined || v === null || v === '') return ScheduleType.ONE_TIME
    if (v === 'RECURRING' || v === 'WEEKLY') return ScheduleType.WEEKLY
    if (v === 'ONE_TIME' || v === 'SINGLE') return ScheduleType.ONE_TIME
    if (v === 'APPOINTMENT') return ScheduleType.APPOINTMENT
    throw new BadRequestException(`不支持的排期方式：${v}`)
  }

  /** 课程类型：前端值 → 数据库枚举（缺省兜底，非法值报错） */
  private mapCourseType(v: any): CourseType {
    if (v === undefined || v === null || v === '') return CourseType.SINGLE
    if (v === 'SERIES') return CourseType.SERIES
    if (v === 'SINGLE') return CourseType.SINGLE
    throw new BadRequestException(`不支持的课程类型：${v}`)
  }

  /** 校验容量与价格合理性（提供了才校验） */
  private assertCapacityAndPrice(p: { minCapacity?: number; maxCapacity?: number; originalPrice?: number }) {
    if (p.minCapacity !== undefined && !(p.minCapacity >= 1)) throw new BadRequestException('最小开课人数须≥1')
    if (p.maxCapacity !== undefined && !(p.maxCapacity >= 1)) throw new BadRequestException('最大容量须≥1')
    if (p.minCapacity !== undefined && p.maxCapacity !== undefined && p.minCapacity > p.maxCapacity) {
      throw new BadRequestException('最小开课人数不能大于最大容量')
    }
    if (p.originalPrice !== undefined && !(p.originalPrice >= 0)) throw new BadRequestException('课程价格不能为负')
  }

  /**
   * 创建课程（管理后台）
   * 兜底填充 Prisma 必填字段并规范化类型，避免草稿/发布因缺字段或类型不符报错
   */
  async create(data: any) {
    const start = data.startDate ? new Date(data.startDate) : new Date()
    const end = data.endDate ? new Date(data.endDate) : start
    const payload: any = {
      title: data.title ?? '未命名课程',
      coverImage: data.coverImage ?? '',
      type: this.mapCourseType(data.type),
      categories: Array.isArray(data.categories) ? data.categories : [],
      description: data.description ?? '',
      targetAudience: Array.isArray(data.targetAudience) ? data.targetAudience : [],
      learningGoals: data.learningGoals ?? null,
      startDate: start,
      endDate: end,
      startTime: data.startTime ?? '',
      endTime: data.endTime ?? '',
      trainerId: data.trainerId,
      minCapacity: Number(data.minCapacity ?? 1),
      maxCapacity: Number(data.maxCapacity ?? 1),
      originalPrice: Number(data.originalPrice ?? 0),
      venueId: data.venueId,
      status: data.status ?? CourseStatus.DRAFT,
      gallery: Array.isArray(data.gallery) ? data.gallery : [],
      scheduleType: this.mapScheduleType(data.scheduleType),
      weekdays: Array.isArray(data.weekdays) ? data.weekdays.map((d: any) => Number(d)) : [],
    }
    // 可选字段透传（存在才写入）
    if (data.internalNote !== undefined) payload.internalNote = data.internalNote
    if (data.refundRules !== undefined) payload.refundRules = data.refundRules
    if (data.trainerSeeds !== undefined) payload.trainerSeeds = Number(data.trainerSeeds)
    if (data.allowDeduction !== undefined) payload.allowDeduction = !!data.allowDeduction
    if (data.waitlistEnabled !== undefined) payload.waitlistEnabled = !!data.waitlistEnabled
    if (data.waitlistDeadlineHours !== undefined) payload.waitlistDeadlineHours = Number(data.waitlistDeadlineHours)
    if (data.memberWaitlistSeats !== undefined) payload.memberWaitlistSeats = Number(data.memberWaitlistSeats)
    this.applyExtraFields(payload, data)
    this.assertCapacityAndPrice(payload)
    return this.prisma.course.create({ data: payload })
  }

  /**
   * 后台表单补充字段白名单（草稿/发布均可持久化）：显式挑字段并规范化类型，禁止整体透传。
   * 字段名须与前端 payload key 逐一一致，否则静默丢弃。
   */
  private applyExtraFields(payload: any, data: any) {
    if (data.detailDesc !== undefined) payload.detailDesc = data.detailDesc
    if (data.difficulty !== undefined) payload.difficulty = data.difficulty
    if (data.assistantId !== undefined) payload.assistantId = data.assistantId
    if (data.coverType !== undefined) payload.coverType = data.coverType
    if (data.coverColor !== undefined) payload.coverColor = data.coverColor
    if (data.duration !== undefined) payload.duration = data.duration === null ? null : Number(data.duration)
    if (data.totalSessions !== undefined) payload.totalSessions = data.totalSessions === null ? null : Number(data.totalSessions)
    if (data.materials !== undefined) payload.materials = Array.isArray(data.materials) ? data.materials : null
    if (data.groupDeadline !== undefined) payload.groupDeadline = data.groupDeadline ? new Date(data.groupDeadline) : null
    if (data.voucherPolicy !== undefined) payload.voucherPolicy = data.voucherPolicy
    if (data.seedsReward !== undefined) payload.seedsReward = data.seedsReward === null ? null : Number(data.seedsReward)
    if (data.reviewSeeds !== undefined) payload.reviewSeeds = data.reviewSeeds === null ? null : Number(data.reviewSeeds)
    if (data.syllabus !== undefined) payload.syllabus = Array.isArray(data.syllabus) ? data.syllabus : null
    if (data.notice !== undefined) payload.notice = data.notice
  }

  /**
   * 更新课程（白名单挑字段并规范化，避免前端未知字段直通 Prisma）
   * 若课程已发布且改动了场地/日期/时间，需重新校验场地冲突并同步占用登记。
   */
  async update(id: string, data: any) {
    const existing = await this.prisma.course.findUnique({ where: { id } })
    if (!existing) throw new BadRequestException('课程不存在')
    const payload: any = {}
    if (data.title !== undefined) payload.title = data.title
    if (data.coverImage !== undefined) payload.coverImage = data.coverImage
    if (data.type !== undefined) payload.type = this.mapCourseType(data.type)
    if (data.categories !== undefined) payload.categories = Array.isArray(data.categories) ? data.categories : []
    if (data.description !== undefined) payload.description = data.description
    if (data.targetAudience !== undefined) payload.targetAudience = Array.isArray(data.targetAudience) ? data.targetAudience : []
    if (data.learningGoals !== undefined) payload.learningGoals = data.learningGoals
    if (data.startDate !== undefined) payload.startDate = data.startDate ? new Date(data.startDate) : undefined
    if (data.endDate !== undefined) payload.endDate = data.endDate ? new Date(data.endDate) : undefined
    if (data.startTime !== undefined) payload.startTime = data.startTime
    if (data.endTime !== undefined) payload.endTime = data.endTime
    if (data.trainerId !== undefined) payload.trainerId = data.trainerId
    if (data.venueId !== undefined) payload.venueId = data.venueId
    if (data.minCapacity !== undefined) payload.minCapacity = Number(data.minCapacity)
    if (data.maxCapacity !== undefined) payload.maxCapacity = Number(data.maxCapacity)
    if (data.originalPrice !== undefined) payload.originalPrice = Number(data.originalPrice)
    if (data.status !== undefined) payload.status = data.status
    if (data.trainerSeeds !== undefined) payload.trainerSeeds = Number(data.trainerSeeds)
    if (data.allowDeduction !== undefined) payload.allowDeduction = !!data.allowDeduction
    if (data.internalNote !== undefined) payload.internalNote = data.internalNote
    if (data.refundRules !== undefined) payload.refundRules = data.refundRules
    if (data.gallery !== undefined) payload.gallery = Array.isArray(data.gallery) ? data.gallery : []
    if (data.scheduleType !== undefined) payload.scheduleType = this.mapScheduleType(data.scheduleType)
    if (data.weekdays !== undefined) payload.weekdays = Array.isArray(data.weekdays) ? data.weekdays.map((d: any) => Number(d)) : []
    if (data.waitlistEnabled !== undefined) payload.waitlistEnabled = !!data.waitlistEnabled
    if (data.waitlistDeadlineHours !== undefined) payload.waitlistDeadlineHours = Number(data.waitlistDeadlineHours)
    if (data.memberWaitlistSeats !== undefined) payload.memberWaitlistSeats = Number(data.memberWaitlistSeats)
    if (data.enrollStartAt !== undefined) payload.enrollStartAt = data.enrollStartAt ? new Date(data.enrollStartAt) : null
    if (data.enrollEndAt !== undefined) payload.enrollEndAt = data.enrollEndAt ? new Date(data.enrollEndAt) : null
    if (data.memberEnrollStartAt !== undefined) payload.memberEnrollStartAt = data.memberEnrollStartAt ? new Date(data.memberEnrollStartAt) : null
    this.applyExtraFields(payload, data)
    this.assertCapacityAndPrice(payload)

    // 已发布课程：改动场地/日期/时间需重新校验冲突并同步占用登记
    const willBePublished = (payload.status ?? existing.status) === CourseStatus.PUBLISHED
    const touchVenueOrTime =
      payload.venueId !== undefined ||
      payload.startDate !== undefined ||
      payload.startTime !== undefined ||
      payload.endTime !== undefined
    if (willBePublished && touchVenueOrTime) {
      const merged = {
        id,
        title: payload.title ?? existing.title,
        venueId: payload.venueId ?? existing.venueId,
        startDate: payload.startDate ?? existing.startDate,
        startTime: payload.startTime ?? existing.startTime,
        endTime: payload.endTime ?? existing.endTime,
      }
      await this.assertVenueAvailable(id, merged)
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.course.update({ where: { id }, data: payload })
        await tx.venueReservation.deleteMany({ where: { courseId: id } })
        await tx.venueReservation.create({ data: this.courseReservationData(merged) })
        return updated
      })
    }

    return this.prisma.course.update({ where: { id }, data: payload })
  }

  /**
   * 后台课程列表（全部状态，可分页/过滤）
   */
  async adminList(query: {
    page?: number
    pageSize?: number
    status?: string
    phase?: string
    keyword?: string
    startDateFrom?: string
    startDateTo?: string
  }) {
    const { page = 1, pageSize = 10, status, phase, keyword, startDateFrom, startDateTo } = query
    const where: any = {}
    if (status) where.status = status
    if (keyword) where.title = { contains: keyword }
    if (startDateFrom || startDateTo) {
      where.startDate = {}
      if (startDateFrom) where.startDate.gte = new Date(startDateFrom)
      if (startDateTo) where.startDate.lte = new Date(startDateTo)
    }
    const rows = await this.prisma.course.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        trainer: { select: { displayName: true } },
        venue: { select: { name: true } },
      },
    })
    const decorated = rows.map((course) => decorateCourseLifecycle(course))
    const filtered = phase ? decorated.filter((course) => course.phase === phase) : decorated
    const total = filtered.length
    const items = filtered.slice((page - 1) * pageSize, page * pageSize)
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  /** 课程状态中文名（用于报错提示） */
  private readonly STATUS_LABEL: Record<CourseStatus, string> = {
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    CANCELLED: '已下架',
    COMPLETED: '已结束',
    EXPIRED: '已过期',
  }

  /** 允许的状态流转白名单：终态（下架/结束/过期）不可逆 */
  private readonly ALLOWED_TRANSITIONS: Record<CourseStatus, CourseStatus[]> = {
    DRAFT: [CourseStatus.PUBLISHED, CourseStatus.CANCELLED],
    PUBLISHED: [CourseStatus.CANCELLED, CourseStatus.COMPLETED, CourseStatus.EXPIRED],
    CANCELLED: [],
    COMPLETED: [],
    EXPIRED: [],
  }

  /**
   * 发布 / 下架 / 取消课程（状态流转）
   * 兼容前端历史值：ENDED/OFF_SHELF 视为下架（CANCELLED），ON_SHELF 视为发布（PUBLISHED）
   *
   * 业务规则：
   * - 状态流转合法性：下架后禁止再上架，已结束/过期不可回退（终态不可逆）
   * - 取消：课程开始时间已过拒绝取消（已完课不能取消）
   * - 发布：校验场地存在、可用、且同场地同时段无课程/预约冲突，成功后自动登记场地占用
   * - 下架：存在已支付报名/候补时拦截，提示先处理退款；下架/过期时释放场地占用
   */
  async setStatus(
    id: string,
    status: string,
    operator?: { operatorId?: string; operatorName?: string; source?: string; reason?: string },
  ) {
    const map: Record<string, CourseStatus> = {
      DRAFT: CourseStatus.DRAFT,
      PUBLISHED: CourseStatus.PUBLISHED,
      ON_SHELF: CourseStatus.PUBLISHED,
      CANCELLED: CourseStatus.CANCELLED,
      ENDED: CourseStatus.CANCELLED,
      OFF_SHELF: CourseStatus.CANCELLED,
      COMPLETED: CourseStatus.COMPLETED,
      EXPIRED: CourseStatus.EXPIRED,
    }
    const next = map[status]
    if (!next) {
      throw new BadRequestException(`不支持的课程状态：${status}`)
    }

    const course = await this.prisma.course.findUnique({ where: { id } })
    if (!course) throw new BadRequestException('课程不存在')
    const current = course.status

    // 幂等：目标与当前一致，直接返回
    if (current === next) return course

    // 状态流转合法性
    this.assertTransitionAllowed(current, next)

    // 发布：场地可用性 + 冲突校验
    if (next === CourseStatus.PUBLISHED) {
      await this.assertVenueAvailable(id, course)
    }

    // 取消：课程开始时刻已过拒绝（防止已完课课程被误取消；导致的退款/客诉风险很高）
    if (next === CourseStatus.CANCELLED) {
      const now = new Date()
      if (courseStartAt(course).getTime() <= now.getTime()) {
        throw new BadRequestException(
          '课程开始时间已过，不允许取消；如实际未成行请标为已结束或已过期',
        )
      }
      await this.assertNoActivePaidEnrollment(id)
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.course.update({ where: { id }, data: { status: next } })
      if (next === CourseStatus.PUBLISHED) {
        // 自动登记场地占用（幂等：先清旧再建）
        await tx.venueReservation.deleteMany({ where: { courseId: id } })
        await tx.venueReservation.create({ data: this.courseReservationData(course) })
        await tx.venueReservationLog.create({
          data: {
            reservationId: null,
            venueId: course.venueId,
            courseId: id,
            courseTitle: course.title,
            action: 'COURSE_RESERVE',
            source: operator?.source ?? 'COURSE_STATUS',
            operatorId: operator?.operatorId ?? null,
            operatorName: operator?.operatorName ?? null,
            eventName: course.title,
            date: course.startDate,
            startTime: course.startTime,
            endTime: course.endTime,
            reason: operator?.reason ?? '课程发布，自动登记场地占用',
          },
        })
      } else if (next === CourseStatus.CANCELLED || next === CourseStatus.EXPIRED) {
        // 释放场地占用
        await tx.venueReservation.deleteMany({ where: { courseId: id } })
        await tx.venueReservationLog.create({
          data: {
            reservationId: null,
            venueId: course.venueId,
            courseId: id,
            courseTitle: course.title,
            action: next === CourseStatus.EXPIRED ? 'COURSE_EXPIRE_RELEASE' : 'COURSE_RELEASE',
            source: operator?.source ?? 'COURSE_STATUS',
            operatorId: operator?.operatorId ?? null,
            operatorName: operator?.operatorName ?? null,
            eventName: course.title,
            date: course.startDate,
            startTime: course.startTime,
            endTime: course.endTime,
            reason:
              operator?.reason ??
              (next === CourseStatus.EXPIRED ? '课程过期，自动释放场地' : '课程取消，自动释放场地'),
          },
        })
      }
      // 课程结束后自动生成结算
      if (next === CourseStatus.COMPLETED) {
        await this.settlementService.autoSettle(id).catch(() => {})
      }
      return updated
    })
  }

  /**
   * 调整报名窗口（后台特殊处理）：
   * - 传未来的 enrollEndAt：重新开放报名；若课程已开始，则自动成为「补报名」
   * - 传 null：恢复默认截止（课程开始时刻）
   * - 不能晚于课程结束时刻，已结束课程不允许再开放
   */
  async setEnrollmentWindow(
    id: string,
    enrollEndAt: string | null,
    operator?: { operatorId?: string; operatorName?: string },
  ) {
    const course = await this.prisma.course.findUnique({ where: { id } })
    if (!course) throw new BadRequestException('课程不存在')
    if (course.status !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('仅已发布课程可调整报名窗口')
    }
    const now = new Date()
    const endAt = courseEndAt(course)
    if (now.getTime() >= endAt.getTime()) {
      throw new BadRequestException('课程已结束，不能再开放报名；如需继续招生请复制课程重新排期')
    }

    let nextDeadline: Date | null = null
    if (enrollEndAt) {
      nextDeadline = new Date(enrollEndAt)
      if (!Number.isFinite(nextDeadline.getTime())) {
        throw new BadRequestException('报名截止时间格式不正确')
      }
      if (nextDeadline.getTime() <= now.getTime()) {
        throw new BadRequestException('报名截止时间须晚于当前时间')
      }
      if (nextDeadline.getTime() > endAt.getTime()) {
        throw new BadRequestException('报名截止时间不能晚于课程结束时间')
      }
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: { enrollEndAt: nextDeadline },
    })
    const lifecycle = resolveCourseLifecycle(updated, now)
    return {
      ...updated,
      phase: lifecycle.phase,
      phaseLabel: lifecycle.phase === 'LATE_ENROLLING' ? '补报名中' : '报名中',
      bookable: lifecycle.bookable,
      startAt: lifecycle.startAt,
      endAt: lifecycle.endAt,
      enrollDeadline: lifecycle.enrollDeadline,
      operator: operator?.operatorName ?? null,
    }
  }

  /** 校验状态流转是否合法，非法则给出可读提示 */
  private assertTransitionAllowed(from: CourseStatus, to: CourseStatus) {
    if (from === CourseStatus.CANCELLED && to === CourseStatus.PUBLISHED) {
      throw new BadRequestException('课程已下架，不可重新上架，请复制课程重新创建')
    }
    if (!this.ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(
        `课程当前为「${this.STATUS_LABEL[from]}」，不允许变更为「${this.STATUS_LABEL[to]}」`,
      )
    }
  }

  /**
   * 发布/更新已发布课程时校验场地：场地存在、可用、同场地同时段无冲突
   * （课程排期与场地预约双向互斥；排除课程自身登记的占用）
   */
  private async assertVenueAvailable(
    courseId: string,
    course: { venueId: string; startDate: Date; startTime: string; endTime: string },
  ) {
    const venue = await this.prisma.venue.findUnique({ where: { id: course.venueId } })
    if (!venue) throw new BadRequestException('课程未设置有效场地，无法发布')
    if (!venue.isAvailable) {
      throw new BadRequestException(`场地「${venue.name}」当前不可用，无法发布课程`)
    }
    if (!course.startTime || !course.endTime) {
      throw new BadRequestException('课程缺少上课时间，无法发布')
    }

    const day = new Date(course.startDate)
    day.setHours(0, 0, 0, 0)
    const nextDay = new Date(day)
    nextDay.setDate(nextDay.getDate() + 1)

    // 同场地同日、其他已发布课程的时间冲突
    const others = await this.prisma.course.findMany({
      where: {
        venueId: course.venueId,
        status: CourseStatus.PUBLISHED,
        id: { not: courseId },
        startDate: { gte: day, lt: nextDay },
      },
      select: { title: true, startTime: true, endTime: true },
    })
    const courseConflict = others.find(
      (o) => course.startTime < o.endTime && course.endTime > o.startTime,
    )
    if (courseConflict) {
      throw new BadRequestException(
        `场地「${venue.name}」在该时段已被课程「${courseConflict.title}」占用`,
      )
    }

    // 同场地同日、场地预约的时间冲突（排除本课程自己登记的占用；手动预约 courseId 为空需保留）
    const reservations = await this.prisma.venueReservation.findMany({
      where: { venueId: course.venueId, date: { gte: day, lt: nextDay } },
      select: { eventName: true, startTime: true, endTime: true, courseId: true },
    })
    const resConflict = reservations.find(
      (r) =>
        r.courseId !== courseId &&
        course.startTime < r.endTime &&
        course.endTime > r.startTime,
    )
    if (resConflict) {
      throw new BadRequestException(
        `场地「${venue.name}」在该时段已被预约「${resConflict.eventName}」占用`,
      )
    }
  }

  /** 下架前置校验：存在已支付报名或已支付候补时拦截 */
  private async assertNoActivePaidEnrollment(courseId: string) {
    const paidOrders = await this.prisma.order.count({
      where: { courseId, orderType: 'COURSE', status: { in: ['PAID', 'COMPLETED'] } },
    })
    const waitingPaid = await this.prisma.waitlistEntry.count({
      where: { courseId, status: 'WAITING' },
    })
    if (paidOrders + waitingPaid > 0) {
      throw new BadRequestException(
        `该课程存在 ${paidOrders} 笔已支付报名、${waitingPaid} 条已支付候补，请先在订单/候补管理中处理退款后再下架`,
      )
    }
  }

  /**
   * 删除课程（硬删）
   * 业务规则：仅允许删除「草稿」状态且无任何报名/候补记录的课程。
   * 草稿理论上不会产生订单/候补/场地占用，但仍做双保险校验并在事务内清理关联配置（阶梯价/会员折扣/场地占用）。
   */
  async remove(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } })
    if (!course) throw new BadRequestException('课程不存在')
    if (course.status !== CourseStatus.DRAFT) {
      throw new BadRequestException('仅草稿状态的课程可删除，已发布/已下架课程请通过下架处理')
    }
    const orderCount = await this.prisma.order.count({ where: { courseId: id, orderType: 'COURSE' } })
    const waitlistCount = await this.prisma.waitlistEntry.count({ where: { courseId: id } })
    if (orderCount + waitlistCount > 0) {
      throw new BadRequestException(
        `该课程已有 ${orderCount} 笔报名、${waitlistCount} 条候补记录，无法删除`,
      )
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.coursePriceTier.deleteMany({ where: { courseId: id } })
      await tx.courseMemberDiscount.deleteMany({ where: { courseId: id } })
      await tx.venueReservation.deleteMany({ where: { courseId: id } })
      await tx.course.delete({ where: { id } })
    })
    return { success: true }
  }

  /** 由课程信息构造「场地占用」预约记录数据 */
  private courseReservationData(course: {
    id: string
    title: string
    venueId: string
    startDate: Date
    startTime: string
    endTime: string
  }) {
    const day = new Date(course.startDate)
    day.setHours(0, 0, 0, 0)
    return {
      venueId: course.venueId,
      courseId: course.id,
      date: day,
      startTime: course.startTime,
      endTime: course.endTime,
      eventName: `课程占用：${course.title}`,
      contactName: '系统自动登记',
      contactPhone: '',
      note: '课程发布自动占用场地',
    }
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
