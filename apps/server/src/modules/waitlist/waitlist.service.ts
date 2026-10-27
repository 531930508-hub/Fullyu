import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { PricingService } from '../pricing/pricing.service'
import { NotificationService } from '../../common/notification/notification.service'
import { PaymentService } from '../payment/payment.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { SEAT_LOCK_DURATION_MINUTES, resolveCourseLifecycle } from '@fullyu/shared'
import { WaitlistSeatType } from '@prisma/client'
import { generateOrderNo } from '../../common/order-no.helper'

/**
 * 候补双队列服务（预付模式）：
 * - 会员候补席（memberWaitlistSeats，默认 3）优先，普通席不限量
 * - 退课/扩容触发递补：会员整体优先，按 position 递补转正
 * - 全流程使用与报名相同的课程锁，避免与正常报名争抢座位
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger('WaitlistService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly pricing: PricingService,
    private readonly notification: NotificationService,
    @Inject(forwardRef(() => PaymentService))
    private readonly payment: PaymentService,
  ) {}

  /**
   * 候补询价：返回将进入的队列类型、位置、锁定价格
   */
  async quote(courseId: string, userId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { priceTiers: true },
    })
    if (!course) throw new BusinessException('课程不存在', 4004)
    if (!course.waitlistEnabled) throw new BusinessException('该课程未开启候补', 4020)
    const lifecycle = resolveCourseLifecycle(course)
    if (!lifecycle.bookable) {
      throw new BusinessException(
        lifecycle.phase === 'ENROLL_CLOSED' ? '报名已截止，候补同步关闭' : '当前不在可候补时间范围内',
        4026,
      )
    }

    const seatType = await this.decideSeatType(courseId, userId, course.memberWaitlistSeats)
    const position = await this.nextPosition(this.prisma, courseId, seatType)
    const { basePrice, priceAfterDiscount, discountAmount, cardType } =
      await this.computeLockedPrice(course, userId)

    const memberSeatsLeft = await this.memberSeatsLeft(courseId, course.memberWaitlistSeats)

    return {
      courseId,
      seatType,
      position,
      basePrice,
      discountAmount,
      lockedPrice: priceAfterDiscount,
      memberCardType: cardType,
      memberSeatsLeft,
    }
  }

  /**
   * 加入候补：锁定队列位置 + 锁价 + 生成待支付候补订单
   */
  async join(courseId: string, userId: string) {
    return this.redis.withLock(`enroll:${courseId}`, async () => {
      return this.prisma.$transaction(async (tx) => {
        const course = await tx.course.findUnique({
          where: { id: courseId },
          include: { priceTiers: true },
        })
        if (!course) throw new BusinessException('课程不存在', 4004)
        if (!course.waitlistEnabled) throw new BusinessException('该课程未开启候补', 4020)

        // 二次校验：以事务内最新数据为准，兜底课程被改期/改场后仍可候补的并发场景
        const now = new Date()
        const lifecycle = resolveCourseLifecycle(course, now)
        if (lifecycle.phase === 'ENDED') {
          throw new BusinessException('课程已结束，无法候补', 4019)
        }
        if (!lifecycle.bookable) {
          throw new BusinessException(
            lifecycle.phase === 'ENROLL_CLOSED'
              ? '报名已截止，候补同步关闭'
              : '当前不在可候补时间范围内',
            4009,
          )
        }
        const venue = await tx.venue.findUnique({ where: { id: course.venueId } })
        if (!venue || !venue.isAvailable) {
          throw new BusinessException('课程场地暂不可用，暂无法候补', 4025)
        }

        // 未满不允许候补
        if (course.currentEnrolled < course.maxCapacity) {
          throw new BusinessException('课程仍有名额，请直接报名', 4021)
        }

        // 防重复候补
        const dup = await tx.waitlistEntry.findFirst({
          where: {
            courseId,
            userId,
            status: { in: ['PENDING_PAYMENT', 'WAITING', 'CONVERTED'] },
          },
        })
        if (dup) throw new BusinessException('您已在候补队列中', 4022)

        const seatType = await this.decideSeatType(courseId, userId, course.memberWaitlistSeats, tx)
        const position = await this.nextPosition(tx, courseId, seatType)
        const { basePrice, priceAfterDiscount, discountAmount, cardType } =
          await this.computeLockedPrice(course, userId)

        // 预付订单
        const orderNo = await generateOrderNo(this.redis, 'WAITLIST', this.prisma)
        const order = await tx.order.create({
          data: {
            orderNo,
            userId,
            courseId,
            orderType: 'WAITLIST',
            originalPrice: basePrice,
            discountAmount,
            actualPaid: priceAfterDiscount,
            status: 'PENDING_PAYMENT',
            cardType: cardType ?? undefined,
          },
        })

        // 候补条目
        await tx.waitlistEntry.create({
          data: {
            courseId,
            userId,
            seatType,
            position,
            orderId: order.id,
            lockedPrice: priceAfterDiscount,
            status: 'PENDING_PAYMENT',
          },
        })

        return {
          orderId: order.id,
          seatType,
          position,
          lockedPrice: priceAfterDiscount,
          expireInSeconds: SEAT_LOCK_DURATION_MINUTES * 60,
        }
      })
    })
  }

  /**
   * 递补：课程释放名额（退课/扩容）后调用。
   * 会员队列整体优先，按 position 升序转正为正式报名。
   */
  async promote(courseId: string): Promise<number> {
    const promotedUsers: { userId: string; orderId: string | null }[] = []
    const result = await this.redis.withLock(`enroll:${courseId}`, async () => {
      return this.prisma.$transaction(async (tx) => {
        const course = await tx.course.findUnique({ where: { id: courseId } })
        if (!course) return 0
        // 已取消/下架/已开课的课程不得再递补：退款回调可能晚于课程取消任务到达，
        // 否则会把候补用户转正到一场不存在的课程上。
        if (course.status !== 'PUBLISHED' || !resolveCourseLifecycle(course).bookable) return 0

        let free = course.maxCapacity - course.currentEnrolled
        if (free <= 0) return 0

        const waiting = await tx.waitlistEntry.findMany({
          where: { courseId, status: 'WAITING' },
        })
        // 会员席优先，其次普通席；各自按 position 升序
        waiting.sort((a, b) => {
          if (a.seatType !== b.seatType) {
            return a.seatType === WaitlistSeatType.MEMBER ? -1 : 1
          }
          return a.position - b.position
        })

        let promoted = 0
        for (const entry of waiting) {
          if (free <= 0) break
          await tx.waitlistEntry.update({
            where: { id: entry.id },
            data: { status: 'CONVERTED', convertedAt: new Date() },
          })
          // 预付订单已支付，转正即转为正式课程报名：
          // 类型切到 COURSE、状态置为 PAID（待上课），后续签到、评价、退款、
          // 名额释放、统计均按正式报名识别，且仍留在「待上课」而非「已完成」。
          if (entry.orderId) {
            await tx.order.update({
              where: { id: entry.orderId },
              data: { status: 'PAID', orderType: 'COURSE' },
            })
          }
          promotedUsers.push({ userId: entry.userId, orderId: entry.orderId })
          free--
          promoted++
        }

        if (promoted > 0) {
          await tx.course.update({
            where: { id: courseId },
            data: { currentEnrolled: { increment: promoted } },
          })
        }
        return promoted
      })
    })

    // 事务外下发递补成功通知（不阻断主流程）
    if (promotedUsers.length > 0) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { title: true, startDate: true },
      })
      const deadline = course?.startDate
        ? new Date(course.startDate).toISOString().slice(0, 10)
        : '请尽快确认'
      for (const u of promotedUsers) {
        await this.notification.waitlistPromoted(u.userId, {
          courseName: course?.title ?? '课程',
          orderId: u.orderId ?? '',
          deadline,
        })
      }
    }
    return result
  }

  // ============ 后台候补管理 ============

  /**
   * 后台：某课程的候补名单（含学员信息与订单），会员席优先、position 升序
   */
  async adminListByCourse(courseId: string) {
    const entries = await this.prisma.waitlistEntry.findMany({
      where: { courseId },
      include: { user: { select: { nickname: true, phone: true } } },
    })
    entries.sort((a, b) => {
      if (a.seatType !== b.seatType) {
        return a.seatType === WaitlistSeatType.MEMBER ? -1 : 1
      }
      return a.position - b.position
    })
    return entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      name: e.user?.nickname || e.user?.phone || '用户',
      phone: e.user?.phone || '',
      seatType: e.seatType,
      position: e.position,
      status: e.status,
      lockedPrice: Number(e.lockedPrice),
      orderId: e.orderId,
      createdAt: e.createdAt,
      convertedAt: e.convertedAt,
    }))
  }

  /**
   * 后台手动递补单个候补条目：不受课程最大人数限制（可超额开课），
   * 转正成功后下发递补通知。仅可递补「WAITING（已支付排队中）」的条目。
   * 返回 overCapacity 标记本次递补是否已超出最大开课人数。
   */
  async promoteEntry(entryId: string): Promise<{ promoted: boolean; overCapacity: boolean }> {
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { id: entryId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            startDate: true,
            maxCapacity: true,
            currentEnrolled: true,
          },
        },
      },
    })
    if (!entry) throw new BusinessException('候补记录不存在', 4004)
    if (entry.status !== 'WAITING') {
      throw new BusinessException('仅可递补「排队中（已支付）」的候补', 4023)
    }

    const courseId = entry.courseId
    const overCapacity = entry.course.currentEnrolled >= entry.course.maxCapacity

    await this.redis.withLock(`enroll:${courseId}`, async () => {
      return this.prisma.$transaction(async (tx) => {
        await tx.waitlistEntry.update({
          where: { id: entryId },
          data: { status: 'CONVERTED', convertedAt: new Date() },
        })
        // 预付订单已支付，转正即转为正式课程报名（不受最大人数限制，可超额）
        if (entry.orderId) {
          await tx.order.update({
            where: { id: entry.orderId },
            data: { status: 'PAID', orderType: 'COURSE' },
          })
        }
        await tx.course.update({
          where: { id: courseId },
          data: { currentEnrolled: { increment: 1 } },
        })
      })
    })

    // 事务外下发递补成功通知（不阻断主流程）
    const deadline = entry.course.startDate
      ? new Date(entry.course.startDate).toISOString().slice(0, 10)
      : '请尽快确认'
    await this.notification.waitlistPromoted(entry.userId, {
      courseName: entry.course.title,
      orderId: entry.orderId ?? '',
      deadline,
    })

    return { promoted: true, overCapacity }
  }

  /**
   * 后台候补退出退款：
   * - WAITING（已支付）→ 全额退款（原路退回微信），标记 REFUNDED
   * - PENDING_PAYMENT（待支付）→ 取消订单，标记 CANCELLED
   */
  async cancelEntry(entryId: string, reason?: string): Promise<{ refundAmount: number }> {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id: entryId } })
    if (!entry) throw new BusinessException('候补记录不存在', 4004)
    if (!['PENDING_PAYMENT', 'WAITING'].includes(entry.status)) {
      throw new BusinessException('该候补状态不可退出退款', 4024)
    }

    if (entry.status === 'WAITING' && entry.orderId) {
      await this.payment.refundFull(entry.orderId, reason || '管理员操作候补退出，全额退款')
      // 退款回调会最终置 REFUNDED；此处先标记，避免界面滞后
      await this.prisma.waitlistEntry.update({
        where: { id: entryId },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      })
      return { refundAmount: Number(entry.lockedPrice) }
    }

    // 待支付：取消订单 + 释放候补
    if (entry.orderId) {
      await this.prisma.order.update({
        where: { id: entry.orderId },
        data: {
          status: 'CANCELLED',
          cancelReason: reason || '管理员取消候补',
          cancelTime: new Date(),
        },
      })
    }
    await this.prisma.waitlistEntry.update({
      where: { id: entryId },
      data: { status: 'CANCELLED' },
    })
    return { refundAmount: 0 }
  }

  /**
   * 我的候补条目
   */
  async findByUser(userId: string) {
    return this.prisma.waitlistEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        course: { select: { title: true, coverImage: true, startDate: true, startTime: true } },
      },
    })
  }

  // ============ 内部辅助 ============

  /** 判定进入会员席还是普通席 */
  private async decideSeatType(
    courseId: string,
    userId: string,
    memberSeats: number,
    client: any = this.prisma,
  ): Promise<WaitlistSeatType> {
    const now = new Date()
    const card = await client.memberCard.findFirst({
      where: { userId, status: 'ACTIVE', endDate: { gt: now } },
    })
    if (!card) return WaitlistSeatType.NORMAL

    const memberCount = await client.waitlistEntry.count({
      where: {
        courseId,
        seatType: WaitlistSeatType.MEMBER,
        status: { in: ['PENDING_PAYMENT', 'WAITING'] },
      },
    })
    return memberCount < memberSeats ? WaitlistSeatType.MEMBER : WaitlistSeatType.NORMAL
  }

  /** 队列下一个位置（同队列非终态计数 + 1） */
  private async nextPosition(
    client: any,
    courseId: string,
    seatType: WaitlistSeatType,
  ): Promise<number> {
    const count = await client.waitlistEntry.count({
      where: { courseId, seatType, status: { in: ['PENDING_PAYMENT', 'WAITING'] } },
    })
    return count + 1
  }

  /** 剩余会员候补席位 */
  private async memberSeatsLeft(courseId: string, memberSeats: number): Promise<number> {
    const memberCount = await this.prisma.waitlistEntry.count({
      where: {
        courseId,
        seatType: WaitlistSeatType.MEMBER,
        status: { in: ['PENDING_PAYMENT', 'WAITING'] },
      },
    })
    return Math.max(0, memberSeats - memberCount)
  }

  /** 计算锁定价格（阶梯价 + 会员折扣） */
  private async computeLockedPrice(course: any, userId: string) {
    // 候补锁价按满员后下一顺位取阶梯价，无匹配区间回退原价
    const basePrice = this.pricing.getTierPrice(
      course.priceTiers ?? [],
      course.maxCapacity + 1,
      course.originalPrice,
    )
    const member = await this.pricing.getMemberDiscount(
      userId,
      course.id,
      basePrice,
      this.pricing.courseStartAt(course),
    )
    const priceAfterDiscount = Math.max(0, basePrice - member.discountAmount)
    return {
      basePrice,
      priceAfterDiscount,
      discountAmount: member.discountAmount,
      cardType: member.cardType,
    }
  }
}
