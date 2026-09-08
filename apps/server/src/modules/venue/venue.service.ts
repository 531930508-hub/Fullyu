import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { CourseService } from '../course/course.service'

export interface OperatorContext {
  operatorId?: string
  operatorName?: string
}

// 收款码 SystemConfig key
const VENUE_QR_KEY = 'venue_payment_qr'

@Injectable()
export class VenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseService: CourseService,
  ) {}

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
    return this.prisma.venue.create({
      data: {
        name: data.name,
        address: data.address ?? '',
        capacity: Number(data.capacity) || 0,
        description: data.description ?? null,
        images: data.images ?? [],
        businessHours:
          data.businessHours ??
          JSON.stringify({ mon_fri: '09:00-21:00', sat_sun: '09:00-18:00' }),
        isAvailable: data.isAvailable ?? true,
      },
    })
  }

  async update(id: string, data: any) {
    const patch: any = {}
    if (data.name !== undefined) patch.name = data.name
    if (data.address !== undefined) patch.address = data.address ?? ''
    if (data.capacity !== undefined) patch.capacity = Number(data.capacity) || 0
    if (data.description !== undefined) patch.description = data.description ?? null
    if (data.images !== undefined) patch.images = data.images ?? []
    if (data.businessHours !== undefined) patch.businessHours = data.businessHours
    if (data.isAvailable !== undefined) patch.isAvailable = data.isAvailable
    return this.prisma.venue.update({ where: { id }, data: patch })
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
      include: {
        venue: { select: { name: true } },
        course: { select: { id: true, title: true, status: true } },
      },
    })
  }

  async createReservation(data: any, operator?: OperatorContext) {
    const dateObj = new Date(data.date)
    if (isNaN(dateObj.getTime())) throw new BusinessException('预约日期格式不正确', 4053)
    // 冲突校验：同场地同日期时间段重叠
    const start = new Date(dateObj)
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

    // 使用类型 & 合同状态默认值
    const useType: 'INTERNAL' | 'RENTAL' = data.useType === 'INTERNAL' ? 'INTERNAL' : 'RENTAL'
    // 仅租赁需要合同状态；默认 INTENT（意向沟通中）
    const contractStatus =
      useType === 'RENTAL' ? (data.contractStatus === 'SIGNED' ? 'SIGNED' : 'INTENT') : null
    // 我方销售：仅 RENTAL 保留；默认取当前操作员
    const salesId = useType === 'RENTAL' ? (data.salesId ?? operator?.operatorId ?? null) : null
    const salesName =
      useType === 'RENTAL' ? (data.salesName ?? operator?.operatorName ?? null) : null

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.venueReservation.create({
        data: {
          venueId: data.venueId,
          date: dateObj,
          startTime: data.startTime,
          endTime: data.endTime,
          eventName: data.eventName ?? data.note ?? data.notes ?? '场地预约',
          contactName: data.contactName ?? data.bookedBy ?? '内部预约',
          contactPhone: data.contactPhone ?? '',
          internalContact: data.internalContact ?? null,
          note: data.note ?? data.notes ?? null,
          useType,
          contractStatus,
          salesId,
          salesName,
          totalAmount:
            useType === 'RENTAL' && data.totalAmount != null
              ? Math.round(Number(data.totalAmount))
              : null,
        },
      })
      const venue = await tx.venue.findUnique({ where: { id: data.venueId }, select: { name: true } })
      await tx.venueReservationLog.create({
        data: {
          reservationId: reservation.id,
          venueId: reservation.venueId,
          venueName: venue?.name ?? null,
          courseId: null,
          courseTitle: null,
          action: 'CREATE',
          source: 'ADMIN',
          operatorId: operator?.operatorId ?? null,
          operatorName: operator?.operatorName ?? null,
          eventName: reservation.eventName,
          date: reservation.date,
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          reason: `手动新增场地预约（${useType === 'INTERNAL' ? '内部使用' : '租赁'}${contractStatus ? '·' + (contractStatus === 'SIGNED' ? '已签约' : '意向沟通中') : ''}）`,
        },
      })
      return reservation
    })
  }

  /**
   * 更新场地预约元信息（使用类型、合同状态、销售、总额、备注等）
   * 不允许修改场地/日期/时段（防止冲突逻辑绕过），如需改时段请取消后重建
   */
  async updateReservation(id: string, data: any, operator?: OperatorContext) {
    const cur = await this.prisma.venueReservation.findUnique({ where: { id } })
    if (!cur) throw new BusinessException('场地预约不存在', 4054)
    if (cur.courseId) throw new BusinessException('课程占用的预约不可编辑基础信息', 4056)

    const patch: any = {}
    if (data.eventName !== undefined) patch.eventName = data.eventName
    if (data.contactName !== undefined) patch.contactName = data.contactName
    if (data.contactPhone !== undefined) patch.contactPhone = data.contactPhone
    if (data.internalContact !== undefined) patch.internalContact = data.internalContact ?? null
    if (data.note !== undefined) patch.note = data.note ?? null
    if (data.useType !== undefined) {
      patch.useType = data.useType === 'INTERNAL' ? 'INTERNAL' : 'RENTAL'
      // 切成内部使用则清空合同/销售/金额
      if (patch.useType === 'INTERNAL') {
        patch.contractStatus = null
        patch.salesId = null
        patch.salesName = null
        patch.totalAmount = null
        patch.contractUrl = null
        patch.contractName = null
        patch.signedAt = null
      }
    }
    if (data.contractStatus !== undefined && (patch.useType ?? cur.useType) === 'RENTAL') {
      patch.contractStatus = data.contractStatus === 'SIGNED' ? 'SIGNED' : 'INTENT'
      if (patch.contractStatus === 'SIGNED' && !cur.signedAt) patch.signedAt = new Date()
    }
    if (data.salesId !== undefined) patch.salesId = data.salesId ?? null
    if (data.salesName !== undefined) patch.salesName = data.salesName ?? null
    if (data.totalAmount !== undefined)
      patch.totalAmount = data.totalAmount == null ? null : Math.round(Number(data.totalAmount))

    const updated = await this.prisma.venueReservation.update({ where: { id }, data: patch })
    await this.prisma.venueReservationLog.create({
      data: {
        reservationId: id,
        venueId: cur.venueId,
        venueName: null,
        courseId: null,
        courseTitle: null,
        action: 'UPDATE',
        source: 'ADMIN',
        operatorId: operator?.operatorId ?? null,
        operatorName: operator?.operatorName ?? null,
        eventName: updated.eventName,
        date: updated.date,
        startTime: updated.startTime,
        endTime: updated.endTime,
        reason: '编辑场地预约元信息',
      },
    })
    return updated
  }

  /**
   * 上传合同文件，可选同步标记为已签约
   */
  async uploadContract(
    id: string,
    body: { contractUrl: string; contractName?: string; markSigned?: boolean },
    operator?: OperatorContext,
  ) {
    const cur = await this.prisma.venueReservation.findUnique({ where: { id } })
    if (!cur) throw new BusinessException('场地预约不存在', 4054)
    if (cur.useType !== 'RENTAL') throw new BusinessException('仅租赁类型可上传合同', 4057)
    if (!body?.contractUrl) throw new BusinessException('合同文件 URL 不能为空', 4058)

    const patch: any = {
      contractUrl: body.contractUrl,
      contractName: body.contractName ?? null,
    }
    if (body.markSigned) {
      patch.contractStatus = 'SIGNED'
      patch.signedAt = new Date()
    }
    const updated = await this.prisma.venueReservation.update({ where: { id }, data: patch })
    await this.prisma.venueReservationLog.create({
      data: {
        reservationId: id,
        venueId: cur.venueId,
        action: body.markSigned ? 'CONTRACT_SIGNED' : 'CONTRACT_UPLOAD',
        source: 'ADMIN',
        operatorId: operator?.operatorId ?? null,
        operatorName: operator?.operatorName ?? null,
        eventName: cur.eventName,
        date: cur.date,
        startTime: cur.startTime,
        endTime: cur.endTime,
        reason: body.markSigned ? '上传合同并标记为已签约' : '上传合同',
      },
    })
    return updated
  }

  /**
   * 取消场地预约（区分租赁 vs 课程占用）：
   * - 纯租赁：直接删除 + 记日志
   * - 课程占用：走 course.setStatus('CANCELLED')，由课程流程做退款/终态拦截并自动释放场地
   */
  async removeReservation(id: string, operator?: OperatorContext) {
    const reservation = await this.prisma.venueReservation.findUnique({
      where: { id },
      include: {
        venue: { select: { name: true } },
        course: { select: { id: true, title: true, status: true } },
      },
    })
    if (!reservation) throw new BusinessException('场地预约不存在', 4054)

    // 课程占用：反向触发课程取消（含退款拦截、终态拦截、场地自动释放）
    if (reservation.courseId && reservation.course) {
      const courseStatus = reservation.course.status
      // 已结束 / 已下架 / 已过期 → 拒绝（复用 course.setStatus 内部 assertTransitionAllowed）
      if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(courseStatus)) {
        throw new BusinessException(
          `关联课程「${reservation.course.title}」当前为${courseStatus === 'COMPLETED' ? '已结束' : courseStatus === 'CANCELLED' ? '已下架' : '已过期'}状态，不可通过取消场地占用来变更`,
          4055,
        )
      }
      // 调用课程取消（内含：已支付报名拦截、终态拦截、自动释放场地占用）
      // 由 CourseService 内部写入课程侧日志；这里再补一条 VENUE 侧日志用于场地页可见
      await this.courseService.setStatus(reservation.courseId, 'CANCELLED', {
        operatorId: operator?.operatorId,
        operatorName: operator?.operatorName,
        source: 'VENUE_PAGE',
        reason: '管理员在场地页取消课程占用',
      })
      await this.prisma.venueReservationLog.create({
        data: {
          reservationId: null, // 已被 course.setStatus 删除
          venueId: reservation.venueId,
          venueName: reservation.venue?.name ?? null,
          courseId: reservation.courseId,
          courseTitle: reservation.course.title,
          action: 'COURSE_RELEASE',
          source: 'VENUE_PAGE',
          operatorId: operator?.operatorId ?? null,
          operatorName: operator?.operatorName ?? null,
          eventName: reservation.eventName,
          date: reservation.date,
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          reason: '通过取消场地占用，联动取消课程',
        },
      })
      return { success: true, cascadedCourse: true }
    }

    // 纯租赁：直接删 + 写日志
    return this.prisma.$transaction(async (tx) => {
      // 先删除关联收款流水（保留在日志里已经足够，业务侧不追溯已取消预约的流水）
      await tx.venuePayment.deleteMany({ where: { reservationId: id } })
      await tx.venueReservation.delete({ where: { id } })
      await tx.venueReservationLog.create({
        data: {
          reservationId: id,
          venueId: reservation.venueId,
          venueName: reservation.venue?.name ?? null,
          courseId: null,
          courseTitle: null,
          action: 'CANCEL_RENTAL',
          source: 'ADMIN',
          operatorId: operator?.operatorId ?? null,
          operatorName: operator?.operatorName ?? null,
          eventName: reservation.eventName,
          date: reservation.date,
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          reason: '管理员取消场地租赁',
        },
      })
      return { success: true, cascadedCourse: false }
    })
  }

  /**
   * 场地预约操作日志查询（按场地筛选，最新在前）
   */
  async listReservationLogs(query: {
    venueId?: string
    limit?: number
    from?: string
    to?: string
  } = {}) {
    const { venueId, limit = 200, from, to } = query
    const where: any = {}
    if (venueId) where.venueId = venueId
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to) where.createdAt.lte = new Date(to)
    }
    return this.prisma.venueReservationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 200, 500),
    })
  }

  // ===== 合同管理 =====

  /**
   * 合同管理列表：默认返回租赁类型；可按 contractStatus 过滤
   * 返回聚合信息（等待时长在前端算，避免服务器与前端时钟不一致）
   */
  async listContractReservations(query: {
    contractStatus?: string
    venueId?: string
    keyword?: string
  } = {}) {
    const where: any = { useType: 'RENTAL' }
    if (query.contractStatus) where.contractStatus = query.contractStatus
    if (query.venueId) where.venueId = query.venueId
    if (query.keyword) {
      where.OR = [
        { eventName: { contains: query.keyword } },
        { contactName: { contains: query.keyword } },
        { salesName: { contains: query.keyword } },
      ]
    }
    return this.prisma.venueReservation.findMany({
      where,
      orderBy: [{ contractStatus: 'asc' }, { createdAt: 'desc' }],
      include: {
        venue: { select: { name: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    })
  }

  // ===== 收款流水 =====

  async listPayments(reservationId: string) {
    return this.prisma.venuePayment.findMany({
      where: { reservationId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 创建收款记录，同步累计 paidAmount（仅 CONFIRMED 状态计入已收）
   * - OFFLINE_TRANSFER：管理员录入即视为已确认（CONFIRMED）
   * - QR_CODE：初始 PENDING，用户扫码支付后由管理员点【确认到账】更新为 CONFIRMED
   */
  async createPayment(
    reservationId: string,
    body: {
      amount: number
      method: 'OFFLINE_TRANSFER' | 'QR_CODE'
      transferAt?: string
      counterparty?: string
      qrChannel?: 'ALIPAY' | 'WECHAT'
      remark?: string
      status?: 'PENDING' | 'CONFIRMED'
    },
    operator?: OperatorContext,
  ) {
    const cur = await this.prisma.venueReservation.findUnique({ where: { id: reservationId } })
    if (!cur) throw new BusinessException('场地预约不存在', 4054)
    if (cur.useType !== 'RENTAL') throw new BusinessException('仅租赁类型可记录收款', 4057)
    if (!body?.amount || Number(body.amount) <= 0)
      throw new BusinessException('金额必须大于 0', 4059)

    const amount = Math.round(Number(body.amount))
    const method = body.method === 'QR_CODE' ? 'QR_CODE' : 'OFFLINE_TRANSFER'
    // 线下转账默认已确认；二维码默认待确认
    const status = body.status ?? (method === 'OFFLINE_TRANSFER' ? 'CONFIRMED' : 'PENDING')

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.venuePayment.create({
        data: {
          reservationId,
          amount,
          method,
          transferAt: body.transferAt ? new Date(body.transferAt) : null,
          counterparty: body.counterparty ?? null,
          qrChannel: method === 'QR_CODE' ? (body.qrChannel === 'ALIPAY' ? 'ALIPAY' : 'WECHAT') : null,
          paidAt: status === 'CONFIRMED' ? new Date() : null,
          status,
          operatorId: operator?.operatorId ?? null,
          operatorName: operator?.operatorName ?? null,
          remark: body.remark ?? null,
        },
      })
      if (status === 'CONFIRMED') {
        await tx.venueReservation.update({
          where: { id: reservationId },
          data: { paidAmount: { increment: amount } },
        })
      }
      return payment
    })
  }

  /**
   * 更新收款流水状态（PENDING → CONFIRMED / CANCELLED）
   */
  async confirmPayment(
    paymentId: string,
    status: 'CONFIRMED' | 'CANCELLED',
    operator?: OperatorContext,
  ) {
    const cur = await this.prisma.venuePayment.findUnique({ where: { id: paymentId } })
    if (!cur) throw new BusinessException('收款流水不存在', 4060)
    if (cur.status !== 'PENDING')
      throw new BusinessException(`该流水已${cur.status === 'CONFIRMED' ? '确认' : '取消'}，不可再变更`, 4061)

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.venuePayment.update({
        where: { id: paymentId },
        data: {
          status,
          paidAt: status === 'CONFIRMED' ? new Date() : null,
          operatorId: operator?.operatorId ?? cur.operatorId ?? null,
          operatorName: operator?.operatorName ?? cur.operatorName ?? null,
        },
      })
      if (status === 'CONFIRMED') {
        await tx.venueReservation.update({
          where: { id: cur.reservationId },
          data: { paidAmount: { increment: cur.amount } },
        })
      }
      return updated
    })
  }

  // ===== 收款码配置 =====

  /**
   * 收款码配置：{ alipay: url|null, wechat: url|null }
   */
  async getQrConfig() {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { key: VENUE_QR_KEY } })
    const value = (cfg?.value as any) || {}
    return {
      alipay: value.alipay ?? null,
      wechat: value.wechat ?? null,
    }
  }

  async setQrConfig(body: { alipay?: string | null; wechat?: string | null }) {
    const cur = await this.getQrConfig()
    const next = {
      alipay: body.alipay !== undefined ? (body.alipay || null) : cur.alipay,
      wechat: body.wechat !== undefined ? (body.wechat || null) : cur.wechat,
    }
    await this.prisma.systemConfig.upsert({
      where: { key: VENUE_QR_KEY },
      update: { value: next as any },
      create: { key: VENUE_QR_KEY, value: next as any },
    })
    return next
  }
}
