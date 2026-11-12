import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import {
  COURSE_PROPOSAL_REJECT_FIELDS,
  courseProposalStatusText,
  resolveCourseLifecycle,
  type CourseProposalStatus,
} from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { PasswordPolicyService } from '../../common/password-policy.service'
import { StorageService } from '../../common/storage/storage.service'
import type { TrainerContext } from './trainer-jwt.strategy'

/** 入驻申请提交体（数据库存整份 JSON，便于后台逐项复核与留档） */
export interface TrainerApplicationInput {
  realName: string
  phone: string
  city?: string
  headline?: string
  specialties?: string[]
  intro?: string
  experienceYears?: number
  certificates?: string[]
  portfolio?: Array<{ title?: string; image?: string; desc?: string }>
  availableDays?: string[]
  motivation?: string
}

/** 课程提案表单：5 步表单合并成一个对象，草稿允许缺项 */
export interface ProposalInput {
  id?: string
  title?: string
  theme?: string
  coverImage?: string
  categories?: string[]
  targetAudience?: string[]
  durationMinutes?: number
  totalSessions?: number
  description?: string
  goals?: string
  requirements?: string
  supportNeeds?: string[]
  materials?: string[]
  requestedPrice?: number
  requestedMaxCapacity?: number
  /** true = 提交审核；false = 存草稿 */
  submit?: boolean
}

const PHONE_RE = /^1[3-9]\d{9}$/
const json = (v: unknown) => (v === undefined || v === null ? undefined : (v as any))
const yuan = (v: unknown) => (v === null || v === undefined ? null : Number(v))

/**
 * 导师门户：导师自助入驻、自助维护资料、提交课程提案、查看排课与学员。
 *
 * 归属校验统一放在本 service：任何「我的」数据都以 TrainerContext.trainerId 过滤，
 * 列表与详情都不接受前端传入 trainerId，避免改个 id 就看别人的学员名单。
 */
@Injectable()
export class TrainerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly storage: StorageService,
  ) {}

  // ===================== 公开：入驻申请 =====================

  async submitApplication(input: TrainerApplicationInput) {
    const realName = String(input.realName || '').trim()
    const phone = String(input.phone || '').trim()
    if (realName.length < 2) throw new BusinessException('请填写真实姓名', 4002)
    if (!PHONE_RE.test(phone)) throw new BusinessException('手机号格式不正确', 4002)

    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, isTrainer: true, trainerProfile: { select: { id: true } } },
    })
    if (existingUser?.isTrainer && existingUser.trainerProfile) {
      throw new BusinessException('该手机号已是入驻导师，请直接登录导师门户', 4009)
    }
    if (existingUser) {
      const pending = await this.prisma.trainerProposal.findFirst({
        where: { userId: existingUser.id, status: 'PENDING' },
        select: { id: true, createdAt: true },
      })
      if (pending) {
        throw new BusinessException('该手机号已提交过申请，请耐心等待教务审核', 4009)
      }
    }

    const form = {
      realName,
      phone,
      city: input.city || '',
      headline: input.headline || '',
      specialties: input.specialties || [],
      intro: input.intro || '',
      experienceYears: Number(input.experienceYears || 0),
      certificates: input.certificates || [],
      portfolio: input.portfolio || [],
      availableDays: input.availableDays || [],
      motivation: input.motivation || '',
    }

    const application = await this.prisma.$transaction(async (tx) => {
      const user =
        existingUser ||
        (await tx.user.create({
          data: { phone, nickname: realName },
          select: { id: true },
        }))
      return tx.trainerProposal.create({
        data: { userId: user.id, form },
        select: { id: true, status: true, createdAt: true },
      })
    })

    return {
      applicationId: application.id,
      status: application.status,
      statusText: '待教务审核',
      submittedAt: application.createdAt.toISOString(),
    }
  }

  // ===================== 登录与账号 =====================

  async login(phone: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone: String(phone || '').trim() },
      select: {
        id: true,
        phone: true,
        passwordHash: true,
        mustChangePassword: true,
        isTrainer: true,
        trainerProfile: { select: { id: true, displayName: true, status: true } },
      },
    })
    // 统一文案：不暴露「手机号存在但密码错」与「不是导师」的差异
    const fail = () => new BusinessException('手机号或密码不正确', 4001)
    if (!user || !user.passwordHash || !user.isTrainer || !user.trainerProfile) throw fail()

    const bcrypt = require('bcrypt')
    if (!(await bcrypt.compare(password || '', user.passwordHash))) throw fail()
    if (user.trainerProfile.status !== 'ACTIVE') {
      throw new BusinessException('账号已停用，请联系教务', 4003)
    }

    const token = this.jwt.sign(
      {
        sub: user.id,
        type: 'trainer',
        trainerId: user.trainerProfile.id,
        phone: user.phone,
      },
      {
        secret: this.config.get('TRAINER_JWT_SECRET') || this.config.get('JWT_SECRET'),
        expiresIn: '12h',
      },
    )

    return {
      token,
      mustChangePassword: user.mustChangePassword,
      trainer: { id: user.trainerProfile.id, displayName: user.trainerProfile.displayName },
    }
  }

  /** 门户首页：身份 + 本月概览 + 待办提示 */
  async me(ctx: TrainerContext) {
    const t = await this.prisma.trainerProfile.findUnique({
      where: { id: ctx.trainerId },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        level: true,
        headline: true,
        city: true,
        bio: true,
        specialties: true,
        portfolio: true,
        certBadge: true,
        seedifyCert: true,
        hourlyRate: true,
        status: true,
        user: { select: { phone: true, mustChangePassword: true } },
      },
    })
    if (!t) throw new BusinessException('导师不存在', 4040)

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [monthCourses, upcoming, pendingProposals, publishedProposals, studentGroups, reviewAgg] =
      await Promise.all([
        this.prisma.course.findMany({
          where: {
            trainerId: ctx.trainerId,
            startDate: { gte: monthStart, lt: monthEnd },
            status: { in: ['PUBLISHED', 'COMPLETED'] },
          },
          select: { id: true, startDate: true, startTime: true, status: true },
        }),
        this.prisma.course.count({
          where: {
            trainerId: ctx.trainerId,
            status: 'PUBLISHED',
            startDate: { gte: now },
          },
        }),
        this.prisma.courseProposal.count({
          where: { trainerId: ctx.trainerId, status: { in: ['SUBMITTED', 'REVIEWING'] } },
        }),
        this.prisma.courseProposal.count({
          where: { trainerId: ctx.trainerId, status: { in: ['APPROVED', 'PUBLISHED'] } },
        }),
        this.prisma.order.groupBy({
          by: ['userId'],
          where: {
            orderType: 'COURSE',
            course: { trainerId: ctx.trainerId },
            status: { in: ['PAID', 'COMPLETED'] },
          },
        }),
        this.prisma.review.aggregate({
          where: { course: { trainerId: ctx.trainerId } },
          _avg: { rating: true },
          _count: true,
        }),
      ])

    return {
      id: t.id,
      displayName: t.displayName,
      // 库里只存 OSS key，出站统一换成本次请求的新签名地址
      avatar: this.signImage(t.avatar, 'image/resize,w_200'),
      level: t.level,
      headline: t.headline,
      city: t.city,
      bio: t.bio,
      specialties: t.specialties,
      portfolio: this.signPortfolio(t.portfolio),
      certBadge: t.certBadge,
      seedifyCert: t.seedifyCert,
      hourlyRate: yuan(t.hourlyRate),
      phone: t.user.phone,
      mustChangePassword: t.user.mustChangePassword,
      stats: {
        monthCourses: monthCourses.length,
        upcomingCourses: upcoming,
        pendingProposals,
        publishedProposals,
        totalStudents: studentGroups.length,
        rating: reviewAgg._avg.rating ? Number(reviewAgg._avg.rating.toFixed(1)) : 0,
        reviewCount: reviewAgg._count,
      },
    }
  }

  /** 门户可自助编辑的字段；姓名、等级、时薪、积分一律不允许导师改 */
  async updateMe(ctx: TrainerContext, body: Record<string, any>) {
    const data: any = {}
    if (body.headline !== undefined) data.headline = String(body.headline).slice(0, 60)
    if (body.city !== undefined) data.city = String(body.city).slice(0, 40)
    if (body.bio !== undefined) data.bio = String(body.bio).slice(0, 2000)
    if (body.avatar !== undefined) data.avatar = this.storage.normalizeStoredRef(String(body.avatar))
    if (Array.isArray(body.specialties)) {
      data.specialties = body.specialties.filter((s: unknown) => typeof s === 'string').slice(0, 12)
    }
    if (Array.isArray(body.portfolio)) {
      data.portfolio = body.portfolio
        .filter((p: any) => p && (p.title || p.image))
        .slice(0, 12)
        .map((p: any) => ({
          title: String(p.title || '').slice(0, 60),
          // 前端回传的是签名地址，落库前换回 key，签名过期也不会失效
          image: String(this.storage.normalizeStoredRef(String(p.image || ''))),
          desc: String(p.desc || '').slice(0, 200),
        }))
    }
    if (!Object.keys(data).length) throw new BusinessException('没有可更新的内容', 4002)
    await this.prisma.trainerProfile.update({ where: { id: ctx.trainerId }, data })
    return { ok: true }
  }

  async changePassword(ctx: TrainerContext, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { passwordHash: true },
    })
    if (!user?.passwordHash) throw new BusinessException('账号状态异常，请联系教务', 4003)
    const bcrypt = require('bcrypt')
    if (!(await bcrypt.compare(oldPassword || '', user.passwordHash))) {
      throw new BusinessException('原密码不正确', 4002)
    }
    if (oldPassword === newPassword) throw new BusinessException('新密码不能与原密码相同', 4002)
    this.passwordPolicy.assertValid(newPassword)
    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
    })
    return { ok: true }
  }

  // ===================== 我的课程 =====================

  async myCourses(ctx: TrainerContext, query: { phase?: string }) {
    const now = new Date()
    const courses = await this.prisma.course.findMany({
      where: { trainerId: ctx.trainerId },
      orderBy: [{ startDate: 'desc' }, { startTime: 'desc' }],
      select: {
        id: true,
        title: true,
        coverImage: true,
        status: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        currentEnrolled: true,
        minCapacity: true,
        maxCapacity: true,
        originalPrice: true,
        enrollStartAt: true,
        enrollEndAt: true,
        venue: { select: { id: true, name: true, city: true, address: true } },
      },
    })

    const rows = courses.map((c) => {
      const lifecycle = resolveCourseLifecycle(c, now)
      return {
        id: c.id,
        title: c.title,
        coverImage: this.signImage(c.coverImage, 'image/resize,w_600'),
        status: c.status,
        phase: lifecycle.phase,
        startAt: lifecycle.startAt.toISOString(),
        endAt: lifecycle.endAt.toISOString(),
        startTime: c.startTime,
        endTime: c.endTime,
        enrolled: c.currentEnrolled,
        minCapacity: c.minCapacity,
        maxCapacity: c.maxCapacity,
        price: yuan(c.originalPrice),
        venue: c.venue,
        /** 开课前 3 小时到开课后，导师才能看名单 */
        rosterUnlocked:
          now.getTime() >= lifecycle.startAt.getTime() - 3 * 3600 * 1000 &&
          now.getTime() <= lifecycle.endAt.getTime() + 12 * 3600 * 1000,
      }
    })

    if (query.phase === 'upcoming') {
      return rows.filter((r) => ['ENROLLING', 'ENROLL_UPCOMING', 'LATE_ENROLLING', 'ENROLL_CLOSED'].includes(r.phase))
    }
    if (query.phase === 'finished') {
      return rows.filter((r) => ['ENDED', 'COMPLETED', 'EXPIRED', 'CANCELLED'].includes(r.phase))
    }
    return rows
  }

  /** 学员名单：只对本人课程开放，且仅开课前 3 小时起可查看 */
  async courseRoster(ctx: TrainerContext, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, trainerId: ctx.trainerId },
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        enrollStartAt: true,
        enrollEndAt: true,
        venue: { select: { name: true, address: true } },
      },
    })
    if (!course) throw new BusinessException('课程不存在或不属于你', 4040)

    const lifecycle = resolveCourseLifecycle(course)
    const now = Date.now()
    if (now < lifecycle.startAt.getTime() - 3 * 3600 * 1000) {
      throw new BusinessException('开课前 3 小时才可查看学员名单', 4003)
    }

    const orders = await this.prisma.order.findMany({
      where: { courseId, orderType: 'COURSE', status: { in: ['PAID', 'COMPLETED'] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        orderNo: true,
        createdAt: true,
        user: { select: { id: true, nickname: true, phone: true, avatar: true } },
      },
    })

    // CheckIn 只记录「已签到」，没有独立的 status 字段；名单里只区分签没签到
    const checkIns = await this.prisma.checkIn.findMany({
      where: { courseId },
      select: { userId: true },
    })
    const checkedIn = new Set(checkIns.map((c) => c.userId))

    return {
      course: {
        id: course.id,
        title: course.title,
        phase: lifecycle.phase,
        startAt: lifecycle.startAt.toISOString(),
        venue: course.venue,
      },
      students: orders.map((o, index) => ({
        orderId: o.id,
        orderNo: o.orderNo,
        seat: index + 1,
        userId: o.user.id,
        name: o.user.nickname || '学员',
        phone: o.user.phone,
        avatar: this.signImage(o.user.avatar, 'image/resize,w_120'),
        checkInStatus: checkedIn.has(o.user.id) ? 'CHECKED' : null,
        orderedAt: o.createdAt.toISOString(),
      })),
    }
  }

  // ===================== 课程提案 =====================

  async listProposals(ctx: TrainerContext) {
    const rows = await this.prisma.courseProposal.findMany({
      where: { trainerId: ctx.trainerId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        coverImage: true,
        durationMinutes: true,
        totalSessions: true,
        requestedPrice: true,
        requestedMaxCapacity: true,
        rejectReason: true,
        rejectFields: true,
        reviewerName: true,
        reviewedAt: true,
        publishedCourseId: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return rows.map((r) => ({
      ...r,
      coverImage: this.signImage(r.coverImage, 'image/resize,w_400'),
      requestedPrice: yuan(r.requestedPrice),
      statusText: courseProposalStatusText(r.status),
      reviewedAt: r.reviewedAt?.toISOString() || null,
      publishedAt: r.publishedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  }

  async getProposal(ctx: TrainerContext, id: string) {
    const row = await this.prisma.courseProposal.findFirst({
      where: { id, trainerId: ctx.trainerId },
    })
    if (!row) throw new BusinessException('提案不存在', 4040)
    return {
      ...row,
      coverImage: this.signImage(row.coverImage, 'image/resize,w_600'),
      // support_needs 落库是顿号拼接的 Text，门户回成数组方便按标签渲染
      supportNeeds: row.supportNeeds ? String(row.supportNeeds).split('、').filter(Boolean) : [],
      materials: (row.materials as string[] | null) || [],
      categories: (row.categories as string[] | null) || [],
      targetAudience: (row.targetAudience as string[] | null) || [],
      requestedPrice: yuan(row.requestedPrice),
      finalPrice: yuan(row.finalPrice),
      scheduledDate: row.scheduledDate?.toISOString() || null,
      reviewedAt: row.reviewedAt?.toISOString() || null,
      publishedAt: row.publishedAt?.toISOString() || null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      statusText: courseProposalStatusText(row.status),
      rejectFieldLabels: ((row.rejectFields as string[] | null) || []).map(
        (k) => COURSE_PROPOSAL_REJECT_FIELDS.find((f) => f.key === k)?.label || k,
      ),
    }
  }

  /**
   * 保存提案（草稿或直接提交）。
   * 只有草稿与被驳回的提案可以改；已提交后导师停手，等教务反馈，
   * 否则会出现「教务正在审的版本」和「导师刚改的版本」不一致。
   */
  async saveProposal(ctx: TrainerContext, input: ProposalInput, submitFlag = false) {
    const submit = submitFlag || input.submit === true
    const existing = input.id
      ? await this.prisma.courseProposal.findFirst({
          where: { id: input.id, trainerId: ctx.trainerId },
          select: {
            id: true,
            status: true,
            title: true,
            coverImage: true,
            categories: true,
            targetAudience: true,
            durationMinutes: true,
            totalSessions: true,
            description: true,
            goals: true,
            requestedMaxCapacity: true,
            form: true,
          },
        })
      : null
    if (input.id && !existing) throw new BusinessException('提案不存在', 4040)
    if (existing && !['DRAFT', 'REJECTED'].includes(existing.status)) {
      throw new BusinessException('该提案已提交，需等教务处理后再修改', 4003)
    }

    const data = this.normalizeProposal(input)
    // 增量保存：只带改动的字段也要能过提交校验，因此先与库里已有值合并
    const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
    if (submit) this.assertProposalComplete(existing ? { ...existing, ...patch } : patch)

    // 5 步表单快照同样增量合并，避免改封面就把前面几步内容冲掉
    const form = existing
      ? { ...((existing.form as Record<string, any>) || {}), ...patch }
      : this.proposalFormSnapshot(data)

    if (existing) {
      const updated = await this.prisma.courseProposal.update({
        where: { id: existing.id },
        data: {
          ...patch,
          status: submit ? 'SUBMITTED' : 'DRAFT',
          // 重新提交时把上一次的驳回角标交给导师自己看，reviewer 清空等教务重新认领；
          // 仅存草稿则保留驳回说明，避免导师改一半就看不到教务要求
          reviewerId: null,
          reviewerName: null,
          reviewedAt: null,
          ...(submit ? { rejectFields: [], rejectReason: null } : {}),
          form: form as any,
        },
        select: { id: true, status: true },
      })
      return { id: updated.id, status: updated.status, statusText: courseProposalStatusText(updated.status) }
    }

    // 草稿允许缺项，但必填列不能为 NULL：用空值占位，提交时再逐项校验
    const created = await this.prisma.courseProposal.create({
      data: {
        trainerId: ctx.trainerId,
        userId: ctx.userId,
        ...data,
        title: data.title || '',
        coverImage: data.coverImage || '',
        categories: (data.categories ?? []) as any,
        targetAudience: (data.targetAudience ?? []) as any,
        durationMinutes: Number(data.durationMinutes || 60),
        totalSessions: Number(data.totalSessions || 1),
        status: submit ? 'SUBMITTED' : 'DRAFT',
        form: form as any,
      },
      select: { id: true, status: true },
    })
    return { id: created.id, status: created.status, statusText: courseProposalStatusText(created.status) }
  }

  async submitProposal(ctx: TrainerContext, id: string) {
    const row = await this.prisma.courseProposal.findFirst({
      where: { id, trainerId: ctx.trainerId },
    })
    if (!row) throw new BusinessException('提案不存在', 4040)
    if (!['DRAFT', 'REJECTED'].includes(row.status)) {
      throw new BusinessException('该提案已提交，无需重复提交', 4003)
    }
    this.assertProposalComplete({
      title: row.title,
      coverImage: row.coverImage,
      categories: row.categories as string[],
      targetAudience: row.targetAudience as string[],
      durationMinutes: row.durationMinutes,
      totalSessions: row.totalSessions,
      description: row.description,
      goals: row.goals,
      requestedMaxCapacity: row.requestedMaxCapacity,
    })
    const updated = await this.prisma.courseProposal.update({
      where: { id },
      data: { status: 'SUBMITTED', reviewerId: null, reviewerName: null, reviewedAt: null, rejectFields: [], rejectReason: null },
      select: { id: true, status: true },
    })
    return { id: updated.id, status: updated.status }
  }

  /** 门户表单下拉项：分类/主题/人群来自共享常量，场地只给名称供导师提「意向」 */
  async options() {
    const venues = await this.prisma.venue.findMany({
      where: { isAvailable: true },
      select: { id: true, name: true, city: true },
      orderBy: { name: 'asc' },
    })
    return { venues, policy: this.passwordPolicy.describe() }
  }

  // ===================== 内部工具 =====================

  /** 单张图：库里存 key，出站换成当次签名地址；空值原样返回 */
  private signImage(ref: string | null | undefined, process?: string) {
    return ref ? this.storage.resolveImageRef(ref, 3600, process) : ref
  }

  /** 作品集：逐张签名，标题与说明保持原样 */
  private signPortfolio(list: unknown) {
    if (!Array.isArray(list)) return list
    return list.map((p: any) =>
      p && typeof p === 'object' ? { ...p, image: this.signImage(p.image, 'image/resize,w_600') } : p,
    )
  }

  private normalizeProposal(input: ProposalInput) {
    const price = input.requestedPrice === undefined || input.requestedPrice === null
      ? undefined
      : Number(input.requestedPrice)
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      throw new BusinessException('建议价格不合法', 4002)
    }
    const capacity = input.requestedMaxCapacity ?? undefined
    if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1 || capacity > 200)) {
      throw new BusinessException('建议人数需在 1–200 之间', 4002)
    }
    return {
      title: input.title !== undefined ? String(input.title).slice(0, 60) : undefined,
      theme: input.theme !== undefined ? String(input.theme).slice(0, 30) : undefined,
      coverImage: input.coverImage !== undefined ? String(this.storage.normalizeStoredRef(input.coverImage)) : undefined,
      categories: json(input.categories),
      targetAudience: json(input.targetAudience),
      durationMinutes: input.durationMinutes,
      totalSessions: input.totalSessions,
      description: input.description !== undefined ? String(input.description) : undefined,
      goals: input.goals !== undefined ? String(input.goals) : undefined,
      requirements: input.requirements !== undefined ? String(input.requirements) : undefined,
      // support_needs 是 Text 列（后台审核直接当一段话展示），数组用顿号拼接落库
      supportNeeds: Array.isArray(input.supportNeeds)
        ? input.supportNeeds.filter((s) => typeof s === 'string' && s.trim()).join('、')
        : undefined,
      materials: json(input.materials),
      requestedPrice: price,
      requestedMaxCapacity: capacity,
    }
  }

  /** 提交前的完整度校验：草稿可以缺，提交不能缺 */
  private assertProposalComplete(data: Record<string, any>) {
    const missing: string[] = []
    if (!data.title || String(data.title).trim().length < 2) missing.push('课程名称')
    if (!data.coverImage) missing.push('封面图')
    if (!Array.isArray(data.categories) || !data.categories.length) missing.push('课程分类')
    if (!Array.isArray(data.targetAudience) || !data.targetAudience.length) missing.push('适合人群')
    if (!data.durationMinutes || Number(data.durationMinutes) < 15) missing.push('单节时长')
    if (!data.totalSessions || Number(data.totalSessions) < 1) missing.push('课程节数')
    if (!data.description || String(data.description).trim().length < 20) missing.push('课程介绍（至少 20 字）')
    if (!data.goals || String(data.goals).trim().length < 10) missing.push('学员收获（至少 10 字）')
    if (!data.requestedMaxCapacity) missing.push('建议人数')
    if (missing.length) throw new BusinessException(`请先补全：${missing.join('、')}`, 4002)
  }

  /** 表单快照：后台审核抽屉按提交时内容展开，不受后续字段改名影响 */
  private proposalFormSnapshot(data: Record<string, any>) {
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  }

  /** 后台需要列表里带状态文案时复用 */
  proposalStatusText(status: string) {
    return courseProposalStatusText(status as CourseProposalStatus)
  }
}