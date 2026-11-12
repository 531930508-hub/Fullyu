import { Injectable } from '@nestjs/common'
import {
  COURSE_PROPOSAL_REJECT_FIELDS,
  TRAINER_APPLICATION_FIELDS,
  courseProposalStatusText,
  trainerApplicationStatusText,
} from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { PasswordPolicyService } from '../../common/password-policy.service'
import type { AdminContext } from '../auth/admin-jwt.strategy'

const json = (v: unknown) => (v === null || v === undefined ? null : (v as any))
const yuan = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export interface ApproveApplicationInput {
  level?: number
  hourlyRate?: number
  initialPassword: string
  certBadge?: string
  seedifyCert?: boolean
}

export interface ApproveProposalInput {
  venueId: string
  date: string
  startTime: string
  endTime: string
  price: number
  maxCapacity: number
  minCapacity?: number
  /** true = 通过并直接上架；false = 只通过，留下草稿等运营补齐 */
  publish?: boolean
  contentConfirmed?: boolean
}

/**
 * 教务侧：导师入驻审核 + 课程提案审核。
 *
 * 审核通过是「一次事务内的多处写入」（建导师档案、开账号、回写单据），
 * 任何一步失败都要整体回滚，否则会出现「档案建了但账号没密码」的半成品。
 */
@Injectable()
export class TrainerPortalAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  // ===================== 导师入驻 =====================

  async listApplications(query: { status?: string; keyword?: string }) {
    const where: any = {}
    if (query.status) where.status = query.status
    const rows = await this.prisma.trainerProposal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, phone: true, nickname: true, avatar: true, isTrainer: true } },
      },
    })
    const keyword = (query.keyword || '').trim()
    return rows
      .filter((r) => {
        if (!keyword) return true
        const form = (r.form || {}) as any
        return (
          String(form.realName || '').includes(keyword) ||
          String(form.phone || '').includes(keyword) ||
          String(r.user.phone || '').includes(keyword)
        )
      })
      .map((r) => this.applicationDto(r))
  }

  async applicationDetail(id: string) {
    const row = await this.prisma.trainerProposal.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, phone: true, nickname: true, avatar: true, isTrainer: true } },
      },
    })
    if (!row) throw new BusinessException('申请不存在', 4040)
    return {
      ...this.applicationDto(row),
      fields: TRAINER_APPLICATION_FIELDS.map((f) => ({
        key: f.key,
        label: f.label,
        value: (row.form as any)?.[f.key],
      })),
      trainer: row.trainerId
        ? await this.prisma.trainerProfile.findUnique({
            where: { id: row.trainerId },
            select: { id: true, displayName: true, level: true, status: true },
          })
        : null,
    }
  }

  /**
   * 通过入驻：建导师档案 + 开通门户账号。
   * 初始密码由教务当面/短信交付，账号强制首次登录改密。
   */
  async approveApplication(admin: AdminContext, id: string, input: ApproveApplicationInput) {
    const row = await this.prisma.trainerProposal.findUnique({
      where: { id },
      include: { user: { select: { id: true, phone: true, isTrainer: true, trainerProfile: { select: { id: true } } } } },
    })
    if (!row) throw new BusinessException('申请不存在', 4040)
    if (row.status !== 'PENDING') throw new BusinessException('该申请已处理', 4003)
    if (row.user.isTrainer && row.user.trainerProfile) {
      throw new BusinessException('该手机号已有导师档案', 4003)
    }
    if (!input.initialPassword) throw new BusinessException('请设置初始密码', 4002)
    this.passwordPolicy.assertValid(input.initialPassword)

    const form = (row.form || {}) as any
    const displayName = String(form.realName || '').trim()
    if (!displayName) throw new BusinessException('申请缺少姓名，无法创建档案', 4002)
    const duplicated = await this.prisma.trainerProfile.findUnique({
      where: { displayName },
      select: { id: true },
    })
    if (duplicated) throw new BusinessException(`已存在同名导师「${displayName}」，请先处理重名`, 4009)

    const level = Number(input.level || 1)
    const levelConfig = await this.prisma.trainerLevel.findUnique({ where: { level } })
    const hourlyRate = input.hourlyRate ?? (levelConfig ? Number(levelConfig.hourlyRate) : 0)

    const bcrypt = require('bcrypt')
    const passwordHash = await bcrypt.hash(input.initialPassword, 10)

    const trainerId = await this.prisma.$transaction(async (tx) => {
      const trainer = await tx.trainerProfile.create({
        data: {
          userId: row.userId,
          displayName,
          avatar: form.avatar || null,
          level,
          hourlyRate,
          certBadge: input.certBadge || null,
          seedifyCert: input.seedifyCert === true,
          specialties: (Array.isArray(form.specialties) ? form.specialties : []) as any,
          bio: form.intro || null,
          headline: form.headline ? String(form.headline).slice(0, 60) : null,
          city: form.city || null,
          portfolio: json(form.portfolio),
        },
        select: { id: true },
      })
      await tx.user.update({
        where: { id: row.userId },
        data: { isTrainer: true, passwordHash, mustChangePassword: true },
      })
      await tx.trainerProposal.update({
        where: { id },
        data: {
          status: 'APPROVED',
          trainerId: trainer.id,
          reviewerId: admin.adminId,
          reviewerName: admin.username,
          reviewedAt: new Date(),
        },
      })
      return trainer.id
    })

    return {
      trainerId,
      phone: row.user.phone,
      initialPassword: input.initialPassword,
      mustChangePassword: true,
    }
  }

  async rejectApplication(admin: AdminContext, id: string, reason: string) {
    const row = await this.prisma.trainerProposal.findUnique({ where: { id }, select: { status: true } })
    if (!row) throw new BusinessException('申请不存在', 4040)
    if (row.status !== 'PENDING') throw new BusinessException('该申请已处理', 4003)
    const text = String(reason || '').trim()
    if (text.length < 4) throw new BusinessException('请填写驳回原因（至少 4 个字）', 4002)
    await this.prisma.trainerProposal.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: text,
        reviewerId: admin.adminId,
        reviewerName: admin.username,
        reviewedAt: new Date(),
      },
    })
    return { ok: true }
  }

  /** 教务重置导师门户密码（导师忘记密码时的唯一找回路径） */
  async resetTrainerPassword(admin: AdminContext, trainerId: string, newPassword: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerId },
      select: { id: true, userId: true },
    })
    if (!trainer) throw new BusinessException('导师不存在', 4040)
    this.passwordPolicy.assertValid(newPassword)
    const bcrypt = require('bcrypt')
    await this.prisma.user.update({
      where: { id: trainer.userId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        mustChangePassword: true,
      },
    })
    this.lastResetBy.set(trainerId, admin.username)
    return { ok: true, mustChangePassword: true }
  }

  /** 仅内存留痕：谁重置过密码，用于列表提示；重启即清空，不落库 */
  readonly lastResetBy = new Map<string, string>()

  // ===================== 课程提案 =====================

  async listProposals(query: { status?: string; keyword?: string }) {
    const where: any = {}
    if (query.status) where.status = query.status
    const rows = await this.prisma.courseProposal.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
      include: {
        trainer: { select: { id: true, displayName: true, avatar: true, level: true } },
        user: { select: { id: true, phone: true } },
      },
    })
    const keyword = (query.keyword || '').trim()
    return rows
      .filter((r) => !keyword || r.title.includes(keyword) || r.trainer.displayName.includes(keyword))
      .map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        statusText: courseProposalStatusText(r.status),
        coverImage: r.coverImage,
        theme: r.theme,
        categories: r.categories,
        durationMinutes: r.durationMinutes,
        totalSessions: r.totalSessions,
        requestedPrice: yuan(r.requestedPrice),
        requestedMaxCapacity: r.requestedMaxCapacity,
        rejectReason: r.rejectReason,
        trainer: r.trainer,
        phone: r.user.phone,
        submittedAt: (r.status === 'DRAFT' ? r.updatedAt : r.createdAt).toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        publishedCourseId: r.publishedCourseId,
      }))
  }

  async proposalDetail(id: string) {
    const row = await this.prisma.courseProposal.findUnique({
      where: { id },
      include: {
        trainer: { select: { id: true, displayName: true, avatar: true, level: true, city: true, headline: true } },
        user: { select: { id: true, phone: true } },
      },
    })
    if (!row) throw new BusinessException('提案不存在', 4040)
    return {
      ...row,
      requestedPrice: yuan(row.requestedPrice),
      finalPrice: yuan(row.finalPrice),
      statusText: courseProposalStatusText(row.status),
      scheduledDate: row.scheduledDate?.toISOString() || null,
      reviewedAt: row.reviewedAt?.toISOString() || null,
      publishedAt: row.publishedAt?.toISOString() || null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      phone: row.user.phone,
      rejectFieldOptions: COURSE_PROPOSAL_REJECT_FIELDS,
    }
  }

  /** 开始审核：把「待受理」标记为「审核中」，导师端能看到进度 */
  async startReview(admin: AdminContext, id: string) {
    const row = await this.prisma.courseProposal.findUnique({ where: { id }, select: { status: true } })
    if (!row) throw new BusinessException('提案不存在', 4040)
    if (!['SUBMITTED', 'REVIEWING'].includes(row.status)) {
      throw new BusinessException('当前状态不能进入审核', 4003)
    }
    await this.prisma.courseProposal.update({
      where: { id },
      data: { status: 'REVIEWING', reviewerId: admin.adminId, reviewerName: admin.username },
    })
    return { ok: true }
  }

  async rejectProposal(admin: AdminContext, id: string, reason: string, fields: string[]) {
    const row = await this.prisma.courseProposal.findUnique({ where: { id }, select: { status: true } })
    if (!row) throw new BusinessException('提案不存在', 4040)
    if (!['SUBMITTED', 'REVIEWING'].includes(row.status)) {
      throw new BusinessException('当前状态不能驳回', 4003)
    }
    const text = String(reason || '').trim()
    if (text.length < 4) throw new BusinessException('请填写驳回说明（至少 4 个字）', 4002)
    const validKeys = new Set(COURSE_PROPOSAL_REJECT_FIELDS.map((f) => f.key))
    const picked = (Array.isArray(fields) ? fields : []).filter((f) => validKeys.has(f))
    await this.prisma.courseProposal.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: text,
        rejectFields: picked as any,
        reviewerId: admin.adminId,
        reviewerName: admin.username,
        reviewedAt: new Date(),
      },
    })
    return { ok: true }
  }

  /**
   * 通过提案：教务补齐场地、日期、定价、人数后生成课程。
   * publish=true 直接上架（学员可见），否则留草稿由运营补齐剩余字段。
   */
  async approveProposal(admin: AdminContext, id: string, input: ApproveProposalInput) {
    const row = await this.prisma.courseProposal.findUnique({ where: { id } })
    if (!row) throw new BusinessException('提案不存在', 4040)
    if (!['SUBMITTED', 'REVIEWING'].includes(row.status)) {
      throw new BusinessException('当前状态不能通过', 4003)
    }
    const venueId = String(input.venueId || '')
    const date = String(input.date || '').slice(0, 10)
    const startTime = String(input.startTime || '')
    const endTime = String(input.endTime || '')
    const price = Number(input.price)
    const maxCapacity = Number(input.maxCapacity)
    if (!venueId) throw new BusinessException('请选择上课场地', 4002)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BusinessException('请选择上课日期', 4002)
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      throw new BusinessException('请填写上下课时间', 4002)
    }
    if (startTime >= endTime) throw new BusinessException('下课时间需晚于上课时间', 4002)
    if (!Number.isFinite(price) || price < 0) throw new BusinessException('价格不合法', 4002)
    if (!Number.isInteger(maxCapacity) || maxCapacity < 1) throw new BusinessException('人数不合法', 4002)

    const venue = await this.prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } })
    if (!venue) throw new BusinessException('场地不存在', 4040)
    const minCapacity = Math.max(1, Math.min(input.minCapacity || Math.floor(maxCapacity / 2), maxCapacity))

    const startDate = new Date(`${date}T00:00:00+08:00`)
    if (Number.isNaN(startDate.getTime())) throw new BusinessException('上课日期不合法', 4002)

    if (input.publish && startDate.getTime() < Date.now() - 86400000) {
      throw new BusinessException('上课日期已过，只能保存为草稿', 4002)
    }

    const status = input.publish ? 'PUBLISHED' : 'DRAFT'
    const courseId = await this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          title: row.title,
          coverImage: row.coverImage,
          type: Number(row.totalSessions) > 1 ? 'SERIES' : 'SINGLE',
          categories: (row.categories ?? []) as any,
          description: row.description || '',
          targetAudience: (row.targetAudience ?? []) as any,
          learningGoals: row.goals || null,
          startDate,
          endDate: startDate,
          startTime,
          endTime,
          trainerId: row.trainerId,
          minCapacity,
          maxCapacity,
          originalPrice: price,
          venueId,
          status,
          gallery: [] as any,
          weekdays: [] as any,
          duration: row.durationMinutes,
          totalSessions: row.totalSessions,
          materials: json(row.materials),
          detailDesc: row.description || null,
          notice: row.requirements || null,
          enrollStartAt: new Date(),
          enrollEndAt: new Date(`${date}T${startTime}:00+08:00`),
          internalNote: `由课程提案 ${row.id} 生成`,
        },
        select: { id: true },
      })
      await tx.courseProposal.update({
        where: { id },
        data: {
          status: input.publish ? 'PUBLISHED' : 'APPROVED',
          reviewerId: admin.adminId,
          reviewerName: admin.username,
          reviewedAt: new Date(),
          scheduledVenueId: venueId,
          scheduledDate: startDate,
          scheduledStartTime: startTime,
          scheduledEndTime: endTime,
          finalPrice: price,
          finalMaxCapacity: maxCapacity,
          publishedCourseId: course.id,
          publishedAt: input.publish ? new Date() : null,
          contentConfirmed: input.contentConfirmed !== false,
        },
      })
      return course.id
    })

    return { courseId, status }
  }

  // ===================== DTO =====================

  private applicationDto(row: any) {
    const form = (row.form || {}) as any
    return {
      id: row.id,
      status: row.status,
      statusText: trainerApplicationStatusText(row.status),
      realName: form.realName || row.user?.nickname || '',
      phone: form.phone || row.user?.phone || '',
      city: form.city || '',
      headline: form.headline || '',
      specialties: form.specialties || [],
      experienceYears: form.experienceYears || 0,
      rejectReason: row.rejectReason,
      reviewerName: row.reviewerName,
      reviewedAt: row.reviewedAt?.toISOString() || null,
      submittedAt: row.createdAt.toISOString(),
      userId: row.userId,
      isTrainer: row.user?.isTrainer,
    }
  }
}