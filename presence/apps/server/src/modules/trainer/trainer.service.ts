import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class TrainerService {
  constructor(private readonly prisma: PrismaService) {}

  /** 导师列表（后台/小程序均可用）
   *  keyword: 模糊匹配 displayName 或 specialties 中的技能关键字
   *  status: 按在职状态筛选
   */
  /**
   * 对外公开字段白名单（小程序/H5 无需登录即可访问）。
   * 手机号、时薪、积分、在职状态等内部字段一律不得出现在公开接口中。
   */
  private readonly publicFields = {
    id: true,
    displayName: true,
    avatar: true,
    level: true,
    specialties: true,
    headline: true,
    city: true,
    bio: true,
    certBadge: true,
    seedifyCert: true,
  } as const

  /** 导师列表（公开）：仅对外资料，只有在职导师会被列出 */
  async list(query: { keyword?: string; level?: number }) {
    const where: any = { status: 'ACTIVE' }
    if (query.level) where.level = Number(query.level)
    if (query.keyword) {
      // 同时搜索姓名和擅长课程（JSON string 内模糊匹配）
      where.OR = [
        { displayName: { contains: query.keyword } },
        { specialties: { string_contains: query.keyword } },
      ]
    }
    return this.prisma.trainerProfile.findMany({
      where,
      select: this.publicFields,
      orderBy: { level: 'desc' },
    })
  }

  /** 导师列表（后台）：含手机号、时薪、积分等内部字段 */
  async adminList(query: { keyword?: string; level?: number; status?: string }) {
    const where: any = {}
    if (query.level) where.level = Number(query.level)
    if (query.status) where.status = query.status
    if (query.keyword) {
      where.OR = [
        { displayName: { contains: query.keyword } },
        { specialties: { string_contains: query.keyword } },
      ]
    }
    return this.prisma.trainerProfile.findMany({
      where,
      orderBy: { level: 'desc' },
      include: { user: { select: { phone: true, nickname: true, avatar: true } } },
    })
  }

  /** 导师详情（公开）：对外资料 + 数据统计，不含任何内部字段 */
  async detail(id: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id },
      select: this.publicFields,
    })
    if (!trainer) throw new BusinessException('导师不存在', 4040)

    const now = new Date()
    const [courseIds, upcoming] = await Promise.all([
      this.prisma.course.findMany({ where: { trainerId: id }, select: { id: true } }),
      this.prisma.course.findMany({
        where: { trainerId: id, status: 'PUBLISHED', startDate: { gte: now } },
        orderBy: { startDate: 'asc' },
        take: 5,
        include: { venue: { select: { name: true } } },
      }),
    ])
    const ids = courseIds.map((c) => c.id)

    let totalStudents = 0
    if (ids.length) {
      const grouped = await this.prisma.order.groupBy({
        by: ['userId'],
        where: { courseId: { in: ids }, orderType: 'COURSE', status: { in: ['PAID', 'COMPLETED'] } },
      })
      totalStudents = grouped.length
    }

    const upcomingCourses = upcoming.map((c) => ({
      id: c.id,
      name: c.title,
      date: c.startDate,
      time: `${c.startTime}-${c.endTime}`,
      venue: c.venue?.name || '',
      seats: Math.max(0, c.maxCapacity - c.currentEnrolled),
    }))

    return {
      ...trainer,
      stats: {
        totalStudents,
        totalCourses: ids.length,
      },
      upcomingCourses,
    }
  }

  /** 导师详情（后台）：含手机号、时薪、积分流水等内部字段 */
  async adminDetail(id: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, phone: true, nickname: true, avatar: true, isTrainer: true } },
        seedsRecords: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    })
    if (!trainer) throw new BusinessException('导师不存在', 4040)

    const [courseCount, studentGroups, reviewAgg] = await Promise.all([
      this.prisma.course.count({ where: { trainerId: id } }),
      this.prisma.order.groupBy({
        by: ['userId'],
        where: {
          orderType: 'COURSE',
          course: { trainerId: id },
          status: { in: ['PAID', 'COMPLETED'] },
        },
      }),
      this.prisma.review.aggregate({ where: { course: { trainerId: id } }, _avg: { rating: true } }),
    ])
    return {
      ...trainer,
      stats: {
        totalStudents: studentGroups.length,
        totalCourses: courseCount,
        rating: reviewAgg._avg.rating ? Number(reviewAgg._avg.rating.toFixed(1)) : 0,
      },
    }
  }

  /** 导师工作台（当前登录导师） */
  async workspace(userId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({ where: { userId } })
    if (!trainer) throw new BusinessException('您不是导师', 4030)
    const trainerId = trainer.id

    // 时薪：优先取导师等级配置的时薪，其次用导师个人时薪
    const level = await this.prisma.trainerLevel.findUnique({ where: { level: trainer.level } })
    const hourlyRate = Number(level?.hourlyRate ?? trainer.hourlyRate ?? 0)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    // 本周（周一为起）
    const dow = (now.getDay() + 6) % 7
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow)
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)

    const parseHours = (s: string, e: string) => {
      const [sh, sm] = (s || '0:0').split(':').map(Number)
      const [eh, em] = (e || '0:0').split(':').map(Number)
      const mins = eh * 60 + em - (sh * 60 + sm)
      return mins > 0 ? mins / 60 : 0
    }
    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

    const [todayCourses, upcoming, completedCourses, weekCourses] = await Promise.all([
      this.prisma.course.findMany({
        where: { trainerId, startDate: { gte: todayStart, lt: todayEnd }, status: { in: ['PUBLISHED', 'COMPLETED'] } },
        orderBy: { startTime: 'asc' },
        include: { venue: { select: { name: true } } },
      }),
      this.prisma.course.findMany({
        where: { trainerId, startDate: { gte: todayEnd }, status: 'PUBLISHED' },
        orderBy: { startDate: 'asc' },
        take: 6,
        include: { venue: { select: { name: true } } },
      }),
      this.prisma.course.findMany({
        where: { trainerId, status: 'COMPLETED' },
        orderBy: { startDate: 'desc' },
        take: 50,
      }),
      this.prisma.course.findMany({
        where: { trainerId, startDate: { gte: weekStart, lt: weekEnd } },
        select: { id: true },
      }),
    ])

    // 今日日程
    const todaySchedule = todayCourses.map((c) => {
      const start = new Date(`${todayStart.toISOString().slice(0, 10)}T${c.startTime}:00`)
      const end = new Date(`${todayStart.toISOString().slice(0, 10)}T${c.endTime}:00`)
      return {
        id: c.id,
        name: c.title,
        startTime: c.startTime,
        endTime: c.endTime,
        venue: c.venue?.name || '',
        enrolled: c.currentEnrolled,
        maxCapacity: c.maxCapacity,
        current: now >= start && now <= end,
        past: now > end,
      }
    })

    // 近期课程
    const upcomingCourses = upcoming.map((c) => {
      const d = new Date(c.startDate)
      return {
        id: c.id,
        day: pad(d.getDate()),
        weekday: WEEKDAYS[d.getDay()],
        name: c.title,
        time: `${c.startTime}-${c.endTime}`,
        venue: c.venue?.name || '',
        enrolled: c.currentEnrolled,
        max: c.maxCapacity,
      }
    })

    // 收入明细（已完成课程流水）= 课时 × 时薪
    let monthHours = 0
    let monthIncome = 0
    const incomeRecords = completedCourses.map((c) => {
      const hours = parseHours(c.startTime, c.endTime)
      const amount = Math.round(hours * hourlyRate)
      const d = new Date(c.startDate)
      if (d >= monthStart) {
        monthHours += hours
        monthIncome += amount
      }
      return {
        id: c.id,
        course: c.title,
        date: `${d.getMonth() + 1}月${d.getDate()}日`,
        students: c.currentEnrolled,
        hours,
        amount,
      }
    })

    // 本周签到统计
    const weekIds = weekCourses.map((c) => c.id)
    let weekEnrolled = 0
    let weekChecked = 0
    if (weekIds.length) {
      const [enrolled, checked] = await Promise.all([
        this.prisma.order.count({ where: { courseId: { in: weekIds }, orderType: 'COURSE', status: { in: ['PAID', 'COMPLETED'] } } }),
        this.prisma.checkIn.count({ where: { courseId: { in: weekIds } } }),
      ])
      weekEnrolled = enrolled
      weekChecked = checked
    }

    // 评分
    const reviewAgg = await this.prisma.review.aggregate({
      where: { course: { trainerId } },
      _avg: { rating: true },
    })

    return {
      hourlyRate,
      stats: {
        monthHours: Number(monthHours.toFixed(1)),
        monthIncome,
        rating: reviewAgg._avg.rating ? Number(reviewAgg._avg.rating.toFixed(1)) : 0,
      },
      todaySchedule,
      upcomingCourses,
      incomeRecords,
      checkin: {
        weekAttendanceRate: weekEnrolled ? Math.round((weekChecked / weekEnrolled) * 100) : 0,
        weekAbsent: Math.max(0, weekEnrolled - weekChecked),
        weekStudents: weekEnrolled,
      },
    }
  }

  /** 创建导师档案（需已有用户），并标记 isTrainer
   *  displayName 全局唯一，时薪自动从等级配置获取
   */
  async create(data: any) {
    const { userId } = data
    if (!userId) throw new BusinessException('缺少关联用户', 4041)
    // 校验姓名唯一
    if (data.displayName) {
      const dup = await this.prisma.trainerProfile.findUnique({ where: { displayName: data.displayName } })
      if (dup) throw new BusinessException('导师姓名已存在，请使用其他名称', 4043)
    }
    const profile = await this.buildProfileData(data, true)
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isTrainer: true } })
      return tx.trainerProfile.create({ data: { userId, ...profile } })
    })
  }

  async update(id: string, data: any) {
    // 校验姓名唯一（排除自身）
    if (data.displayName) {
      const dup = await this.prisma.trainerProfile.findFirst({
        where: { displayName: data.displayName, NOT: { id } },
      })
      if (dup) throw new BusinessException('导师姓名已存在，请使用其他名称', 4043)
    }
    return this.prisma.trainerProfile.update({ where: { id }, data: await this.buildProfileData(data, false) })
  }

  /** 白名单构建导师档案数据
   *  时薪不可直接设置，由等级配置自动带入
   */
  private async buildProfileData(data: any, isCreate: boolean) {
    const out: any = {}
    if (data.displayName !== undefined) out.displayName = data.displayName
    if (data.avatar !== undefined) out.avatar = data.avatar
    if (data.level !== undefined) {
      out.level = Number(data.level)
      // 自动从等级配置获取时薪
      const levelConfig = await this.prisma.trainerLevel.findUnique({ where: { level: out.level } })
      if (levelConfig) out.hourlyRate = Number(levelConfig.hourlyRate)
    }
    if (data.certBadge !== undefined) out.certBadge = data.certBadge
    if (data.seedifyCert !== undefined) out.seedifyCert = Boolean(data.seedifyCert)
    if (data.status !== undefined) out.status = data.status
    if (data.specialties !== undefined) out.specialties = Array.isArray(data.specialties) ? data.specialties : []
    if (data.bio !== undefined) out.bio = data.bio
    if (data.seedsBalance !== undefined) out.seedsBalance = Number(data.seedsBalance)
    if (isCreate && out.specialties === undefined) out.specialties = []
    return out
  }

  /** 调整导师积分余额（后台手动） */
  async adjustSeeds(id: string, amount: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const trainer = await tx.trainerProfile.findUnique({ where: { id } })
      if (!trainer) throw new BusinessException('导师不存在', 4040)
      const balance = trainer.seedsBalance + amount
      if (balance < 0) throw new BusinessException('积分余额不足', 4042)
      await tx.seedsRecord.create({
        data: { trainerId: id, amount, balance, type: 'ADMIN_ADJUST', reason },
      })
      return tx.trainerProfile.update({
        where: { id },
        data: { seedsBalance: balance },
      })
    })
  }
}
