import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { orderAmountToFen } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'

/**
 * 在场业务财务台账。
 *
 * 设计边界：
 * - 财务流水与业务交易流水分离，本服务只把业务表当作「生成输入」。
 * - 报表永远只读 presence_finance_entries，不实时扫订单表。
 * - 未关账月份可整月重建（幂等）；已关账月份永不重写。
 * - 自然月关账后，退款与调整只通过当月负数流水冲减，历史报表数字不变。
 */

const START_MONTH_CONFIG_KEY = 'presence_finance_start_month'
const LEDGER_TZ = 'Asia/Shanghai'
const CST_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 已实际收款的订单状态 */
const PAID_STATUSES = ['PAID', 'COMPLETED', 'REFUNDING', 'REFUNDED'] as const

type LedgerAccount = 'CASH' | 'REVENUE' | 'TRAINER_COST'
type LedgerEventType = 'CASH_IN' | 'CASH_REFUND' | 'RECOGNIZE' | 'REVERSAL' | 'SETTLEMENT'
type LedgerCategory = 'COURSE' | 'MEMBER_CARD' | 'WAITLIST' | 'COMMUNITY_FEE' | 'TRAINER'

type EntryDraft = Prisma.PresenceFinanceEntryCreateManyInput

type MonthOrder = Prisma.OrderGetPayload<{
  include: {
    course: { include: { venue: { include: { org: true } } } }
    community: true
  }
}>

interface ScheduleResult {
  /** key = UTC 日期时间戳 */
  daily: Map<number, number>
  total: number
  days: number
}

// ========== 日期工具（统一按自然日处理，避免时区把日期推前一天） ==========

function addDays(day: Date, n: number): Date {
  return new Date(day.getTime() + n * DAY_MS)
}

/** 业务时间戳 → 北京时间自然日（UTC 零点表示该日期） */
function cstDayOf(date: Date): Date {
  const shifted = new Date(date.getTime() + CST_OFFSET_MS)
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()))
}

/** 业务时间戳 → 北京时间月份 yyyy-MM */
function cstMonthOf(date: Date): string {
  const shifted = new Date(date.getTime() + CST_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 当前北京时间月份（不依赖服务器时区） */
function currentCstMonth(): string {
  return cstMonthOf(new Date())
}

/** 某月在北京时间下的起止时刻（用于筛选带时间的业务字段） */
function cstMonthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - CST_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - CST_OFFSET_MS),
  }
}

/** 库里的日期值（通常为 UTC 零点）→ 自然日 */
function toDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10)
}

function monthFirstDay(month: string): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1))
}

function monthLastDay(month: string): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0))
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function isMonthString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function maxDay(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

function minDay(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

/**
 * 按服务有效期逐日分摊。
 * 每日取 floor(总额 / 天数)，除不尽的尾差放到最后一天。
 */
function buildSchedule(totalFen: number, start: Date, end: Date): ScheduleResult {
  const total = Math.max(0, Math.round(totalFen))
  if (total <= 0) return { daily: new Map(), total: 0, days: 0 }

  const safeEnd = end.getTime() < start.getTime() ? start : end
  const days = Math.max(1, Math.round((safeEnd.getTime() - start.getTime()) / DAY_MS) + 1)
  const daily = Math.floor(total / days)
  const remainder = total - daily * days

  const map = new Map<number, number>()
  for (let i = 0; i < days; i++) {
    const amount = daily + (i === days - 1 ? remainder : 0)
    if (amount !== 0) map.set(addDays(start, i).getTime(), amount)
  }
  return { daily: map, total, days }
}

function sumScheduleBefore(schedule: ScheduleResult, day: Date): number {
  let sum = 0
  for (const [ts, amount] of schedule.daily) {
    if (ts < day.getTime()) sum += amount
  }
  return sum
}

function cashCategoryOf(orderType: string): LedgerCategory {
  if (orderType === 'MEMBER_CARD') return 'MEMBER_CARD'
  if (orderType === 'COMMUNITY') return 'COMMUNITY_FEE'
  if (orderType === 'WAITLIST') return 'WAITLIST'
  return 'COURSE'
}

function decimalFen(value: unknown): number {
  return Math.round(Number(value) || 0)
}

function settlementFen(value: unknown): number {
  return Math.round((Number(value) || 0) * 100)
}

@Injectable()
export class PresenceLedgerService {
  private readonly logger = new Logger(PresenceLedgerService.name)

  constructor(private readonly prisma: PrismaService) {}

  // ==================== 对外入口 ====================

  /**
   * 确保某月台账已生成。
   * - 已关账月份直接跳过；
   * - 早于当前月的未关账月份，重建后自动关账；
   * - 当前月保留 OPEN，可随退款/调整反复重建。
   */
  async ensureMonth(month: string): Promise<{ month: string; status: string; entries: number }> {
    this.assertMonth(month)

    const existing = await this.prisma.presenceFinancePeriod.findUnique({ where: { month } })
    if (existing?.status === 'CLOSED') {
      return { month, status: 'CLOSED', entries: 0 }
    }

    const entries = await this.buildMonthEntries(month)
    const shouldClose = month < currentCstMonth()
    let written = 0

    const run = async () => {
      await this.prisma.$transaction(
        async (tx) => {
          const period = await tx.presenceFinancePeriod.findUnique({ where: { month } })
          if (period?.status === 'CLOSED') return

          await tx.presenceFinanceEntry.deleteMany({ where: { month } })
          for (let i = 0; i < entries.length; i += 500) {
            await tx.presenceFinanceEntry.createMany({
              data: entries.slice(i, i + 500),
              skipDuplicates: true,
            })
          }

          const closeData = {
            status: 'CLOSED' as const,
            closedAt: new Date(),
            closedBy: 'SYSTEM:AUTO',
          }
          await tx.presenceFinancePeriod.upsert({
            where: { month },
            create: {
              month,
              ...(shouldClose ? closeData : { status: 'OPEN' as const }),
            },
            update: shouldClose ? closeData : {},
          })
          written = entries.length
        },
        { timeout: 60_000 },
      )
    }

    try {
      await run()
    } catch (err) {
      // 并发重建时可能撞上唯一键/死锁，重试一次；重建是确定性的，重试安全。
      this.logger.warn(`台账重建冲突，重试一次：${month} - ${(err as Error).message}`)
      await run()
    }

    return { month, status: shouldClose ? 'CLOSED' : 'OPEN', entries: written }
  }

  /** 确保从起始月到目标月的台账都存在（已关账月份快速跳过） */
  async ensureThrough(month: string): Promise<void> {
    this.assertMonth(month)
    const start = await this.resolveStartMonth()
    let cursor = start
    const periods = await this.prisma.presenceFinancePeriod.findMany({
      where: { month: { gte: start, lte: month } },
      select: { month: true, status: true },
    })
    const statusMap = new Map(periods.map((p) => [p.month, p.status]))

    let guard = 0
    while (cursor <= month && guard < 120) {
      if (statusMap.get(cursor) !== 'CLOSED') {
        await this.ensureMonth(cursor)
      }
      cursor = nextMonth(cursor)
      guard++
    }
  }

  /**
   * 自动关账：补齐并关闭所有早于当前月的月份，同时刷新当前月。
   * 每天 00:10 由定时任务调用，首次运行会补关历史月份。
   */
  async autoCloseDueMonths(): Promise<{ closed: string[]; refreshed: string }> {
    const start = await this.resolveStartMonth()
    const nowMonth = currentCstMonth()
    const closed: string[] = []

    let cursor = start
    let guard = 0
    while (cursor < nowMonth && guard < 120) {
      const period = await this.prisma.presenceFinancePeriod.findUnique({ where: { month: cursor } })
      if (period?.status !== 'CLOSED') {
        await this.ensureMonth(cursor)
        closed.push(cursor)
      }
      cursor = nextMonth(cursor)
      guard++
    }

    await this.ensureMonth(nowMonth)
    return { closed, refreshed: nowMonth }
  }

  /** 手工关账（需 finance:presence:close）。当前月也可提前锁定。 */
  async closeMonth(month: string, operator: string): Promise<{ month: string; status: string }> {
    this.assertMonth(month)
    if (month > currentCstMonth()) {
      throw new BadRequestException('不能关闭未来月份')
    }
    await this.ensureMonth(month)
    const period = await this.prisma.presenceFinancePeriod.findUnique({ where: { month } })
    if (period?.status === 'CLOSED') return { month, status: 'CLOSED' }

    await this.prisma.presenceFinancePeriod.upsert({
      where: { month },
      create: {
        month,
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: operator,
      },
      update: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: operator,
      },
    })
    return { month, status: 'CLOSED' }
  }

  /** 台账起始月份：配置优先，否则取最早已支付订单/结算所在月 */
  async resolveStartMonth(): Promise<string> {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { key: START_MONTH_CONFIG_KEY } })
    const raw = cfg?.value as unknown
    const configured =
      typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? (raw as any).month : null
    if (isMonthString(configured)) return configured

    const [firstOrder, firstSettlement] = await Promise.all([
      this.prisma.order.findFirst({
        where: { paymentTime: { not: null }, status: { in: [...PAID_STATUSES] } },
        orderBy: { paymentTime: 'asc' },
        select: { paymentTime: true },
      }),
      this.prisma.settlement.findFirst({
        orderBy: { settledAt: 'asc' },
        select: { settledAt: true },
      }),
    ])

    const candidates: string[] = []
    if (firstOrder?.paymentTime) candidates.push(cstMonthOf(firstOrder.paymentTime))
    if (firstSettlement?.settledAt) candidates.push(cstMonthOf(firstSettlement.settledAt))
    const start = candidates.length ? candidates.sort()[0] : currentCstMonth()

    await this.prisma.systemConfig.upsert({
      where: { key: START_MONTH_CONFIG_KEY },
      create: { key: START_MONTH_CONFIG_KEY, value: start as any },
      update: {},
    })
    return start
  }

  /** 会计月份列表（起始月 → 当前月，倒序） */
  async listPeriods() {
    const start = await this.resolveStartMonth()
    const now = currentCstMonth()
    const periods = await this.prisma.presenceFinancePeriod.findMany({
      where: { month: { gte: start, lte: now } },
      orderBy: { month: 'desc' },
    })
    const map = new Map(periods.map((p) => [p.month, p]))

    const months: {
      month: string
      status: 'OPEN' | 'CLOSED'
      closedAt: Date | null
      closedBy: string | null
    }[] = []
    let cursor = now
    let guard = 0
    while (cursor >= start && guard < 120) {
      const p = map.get(cursor)
      months.push({
        month: cursor,
        status: p?.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
        closedAt: p?.closedAt ?? null,
        closedBy: p?.closedBy ?? null,
      })
      cursor = prevMonth(cursor)
      guard++
    }
    return {
      startMonth: start,
      currentMonth: now,
      timezone: LEDGER_TZ,
      periods: months,
    }
  }

  // ==================== 台账生成 ====================

  private assertMonth(month: string): void {
    if (!isMonthString(month)) throw new BadRequestException('月份格式应为 yyyy-MM')
  }

  private async buildMonthEntries(month: string): Promise<EntryDraft[]> {
    const entries: EntryDraft[] = []
    const { start: monthStart, end: monthEnd } = cstMonthBounds(month)

    const [eventOrders, courseOrders, settlements] = await Promise.all([
      this.fetchMonthEventOrders(monthStart, monthEnd),
      this.fetchRecognitionCourseOrders(monthStart, monthEnd),
      this.prisma.settlement.findMany({
        where: { settledAt: { lt: monthEnd } },
        orderBy: { settledAt: 'asc' },
      }),
    ])

    // ---- 1. 收款 / 退款现金流水 + 社群手续费 ----
    for (const order of eventOrders) {
      const category = cashCategoryOf(order.orderType)
      const base = this.orderSnapshot(order)

      if (
        order.paymentTime &&
        order.paymentTime >= monthStart &&
        order.paymentTime < monthEnd &&
        (PAID_STATUSES as readonly string[]).includes(order.status)
      ) {
        const paidFen = orderAmountToFen(order.orderType, Number(order.actualPaid))
        if (paidFen > 0) {
          entries.push({
            ...base,
            dedupeKey: `cash:${order.id}`,
            month,
            entryDate: cstDayOf(order.paymentTime),
            account: 'CASH',
            eventType: 'CASH_IN',
            category,
            amountFen: paidFen,
            remark: '订单收款',
          })
        }

        // 社群年费：10% 平台手续费一次性确认收入，90% 为代收（不记收入）
        if (order.orderType === 'COMMUNITY') {
          const feeFen = this.feeFenOf(order)
          if (feeFen > 0) {
            entries.push({
              ...base,
              dedupeKey: `community-fee:${order.id}`,
              month,
              entryDate: cstDayOf(order.paymentTime),
              account: 'REVENUE',
              eventType: 'RECOGNIZE',
              category: 'COMMUNITY_FEE',
              amountFen: feeFen,
              remark: '社群年费平台手续费',
            })
          }
        }
      }

      if (order.refundTime && order.refundTime >= monthStart && order.refundTime < monthEnd) {
        const refundFen = this.refundFenOf(order)
        const refundDay = cstDayOf(order.refundTime)
        if (refundFen > 0) {
          entries.push({
            ...base,
            dedupeKey: `refund-cash:${order.id}:${dayKey(refundDay)}`,
            month,
            entryDate: refundDay,
            account: 'CASH',
            eventType: 'CASH_REFUND',
            category,
            amountFen: -refundFen,
            remark: '订单退款',
          })
        }

        // 社群退款：手续费同步冲减，单独一条负数流水
        if (order.orderType === 'COMMUNITY') {
          const feeFen = this.feeFenOf(order)
          if (feeFen > 0) {
            entries.push({
              ...base,
              dedupeKey: `community-fee-rev:${order.id}:${dayKey(refundDay)}`,
              month,
              entryDate: refundDay,
              account: 'REVENUE',
              eventType: 'REVERSAL',
              category: 'COMMUNITY_FEE',
              amountFen: -feeFen,
              remark: '社群退款手续费冲减',
            })
          }
        }
      }
    }

    // ---- 2. 课程逐日确认收入 ----
    for (const order of courseOrders) {
      entries.push(...this.recognitionEntries(order, month))
    }

    // ---- 3. 导师结算成本 ----
    entries.push(...(await this.settlementEntries(month, settlements, monthEnd)))

    return entries
  }

  /** 本月发生收款/退款的订单（任意类型），用于现金与手续费流水 */
  private async fetchMonthEventOrders(monthStart: Date, monthEnd: Date): Promise<MonthOrder[]> {
    return this.prisma.order.findMany({
      where: {
        OR: [
          { paymentTime: { gte: monthStart, lt: monthEnd } },
          { refundTime: { gte: monthStart, lt: monthEnd } },
        ],
      },
      include: {
        course: { include: { venue: { include: { org: true } } } },
        community: true,
      },
    })
  }

  /** 服务期覆盖本月、且已付款的课程订单（含候补转正后的课程单） */
  private async fetchRecognitionCourseOrders(
    monthStart: Date,
    monthEnd: Date,
  ): Promise<MonthOrder[]> {
    return this.prisma.order.findMany({
      where: {
        orderType: 'COURSE',
        paymentTime: { not: null },
        status: { in: [...PAID_STATUSES] },
        OR: [
          {
            course: {
              is: {
                startDate: { lt: monthEnd },
                endDate: { gte: monthStart },
              },
            },
          },
          // 课程结束后才付款（补录/后台代付）：付款日一次性确认
          { paymentTime: { gte: monthStart, lt: monthEnd } },
        ],
      },
      include: {
        course: { include: { venue: { include: { org: true } } } },
        community: true,
      },
    })
  }

  private orderSnapshot(
    order: MonthOrder,
  ): Omit<EntryDraft, 'dedupeKey' | 'month' | 'entryDate' | 'account' | 'eventType' | 'category' | 'amountFen'> {
    const org = order.course?.venue?.org ?? null
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      orderType: order.orderType,
      courseId: order.courseId,
      courseName: order.course?.title ?? null,
      memberCardId: null,
      cardName: null,
      communityId: order.communityId,
      communityName: order.community?.name ?? null,
      hostUserId: order.community?.ownerUserId ?? null,
      hostName: order.community?.ownerName ?? null,
      settlementId: null,
      trainerId: null,
      trainerName: null,
      orgId: order.course?.venue?.orgId ?? null,
      orgName: org?.name ?? null,
      serviceStart: order.course ? toDay(order.course.startDate) : null,
      serviceEnd: order.course ? toDay(order.course.endDate) : null,
      hours: null,
      rate: null,
    }
  }

  /** 社群手续费列本身就是分口径（yearlyFee / actualPaid 同为分），不能再乘 100 */
  private feeFenOf(order: MonthOrder): number {
    return Math.max(0, Math.round(Number(order.platformFee) || 0))
  }

  private refundFenOf(order: MonthOrder): number {
    if (order.refundAmount !== null && order.refundAmount !== undefined) {
      const fen = orderAmountToFen(order.orderType, Number(order.refundAmount))
      if (fen > 0) return fen
    }
    return orderAmountToFen(order.orderType, Number(order.actualPaid))
  }

  /**
   * 课程逐日确认：
   * - 毛额按服务期每日分摊；
   * - 发生退款时按净额重算，退款日补一条负数 REVERSAL，之后按净额继续确认；
   * - 已关账月份不动，冲减只落在退款当月。
   */
  private recognitionEntries(order: MonthOrder, month: string): EntryDraft[] {
    if (!order.paymentTime) return []
    if (!(PAID_STATUSES as readonly string[]).includes(order.status)) return []

    const category: LedgerCategory = order.orderType === 'MEMBER_CARD' ? 'MEMBER_CARD' : 'COURSE'
    const grossFen = orderAmountToFen(order.orderType, Number(order.actualPaid))
    if (grossFen <= 0) return []

    const serviceStart = order.course ? toDay(order.course.startDate) : cstDayOf(order.paymentTime)
    const serviceEnd = order.course ? toDay(order.course.endDate) : cstDayOf(order.paymentTime)

    const paymentDay = cstDayOf(order.paymentTime)
    const recognitionStart = maxDay(serviceStart, paymentDay)
    // 课程结束后才付款（补录/后台代付）：在付款日一次性确认
    const effectiveEnd =
      recognitionStart.getTime() > serviceEnd.getTime() ? recognitionStart : serviceEnd

    const refundedFen = order.refundTime ? this.refundFenOf(order) : 0
    const netFen = Math.max(0, grossFen - refundedFen)

    const grossSchedule = buildSchedule(grossFen, recognitionStart, effectiveEnd)
    const netSchedule = buildSchedule(netFen, recognitionStart, effectiveEnd)

    const refundDay = order.refundTime ? cstDayOf(order.refundTime) : null
    const first = monthFirstDay(month)
    const last = monthLastDay(month)
    const from = maxDay(recognitionStart, first)
    const to = minDay(effectiveEnd, last)

    const base = this.orderSnapshot(order)
    const serviceSnapshot = {
      ...base,
      serviceStart,
      serviceEnd,
    }
    const result: EntryDraft[] = []

    if (from.getTime() <= to.getTime()) {
      for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) {
        let amount = 0
        if (refundDay && d.getTime() >= refundDay.getTime()) {
          amount = netSchedule.daily.get(d.getTime()) ?? 0
        } else {
          amount = grossSchedule.daily.get(d.getTime()) ?? 0
        }
        if (amount <= 0) continue
        result.push({
          ...serviceSnapshot,
          dedupeKey: `rev:${order.id}:${category}:${dayKey(d)}`,
          month,
          entryDate: d,
          account: 'REVENUE',
          eventType: 'RECOGNIZE',
          category,
          amountFen: amount,
          remark: '按期确认收入',
        })
      }
    }

    // 退款当月：把退款日前多确认的毛额一次冲回
    if (refundDay && refundDay >= first && refundDay < monthEndDate(month)) {
      const grossBefore = sumScheduleBefore(grossSchedule, refundDay)
      const netBefore = sumScheduleBefore(netSchedule, refundDay)
      const reversal = netBefore - grossBefore
      if (reversal !== 0) {
        result.push({
          ...serviceSnapshot,
          dedupeKey: `rev-reversal:${order.id}:${category}:${dayKey(refundDay)}`,
          month,
          entryDate: refundDay,
          account: 'REVENUE',
          eventType: 'REVERSAL',
          category,
          amountFen: reversal,
          remark: '退款净额重算冲减',
        })
      }
    }

    return result
  }

  /** 导师结算成本 + 已关账月份后发生的调整补差 */
  private async settlementEntries(
    month: string,
    settlements: {
      id: string
      trainerId: string
      trainerName: string
      courseId: string
      courseName: string
      hours: Prisma.Decimal
      rate: Prisma.Decimal
      amount: Prisma.Decimal
      adjustedAmount: Prisma.Decimal | null
      settledAt: Date
    }[],
    monthEnd: Date,
  ): Promise<EntryDraft[]> {
    if (!settlements.length) return []

    const courseIds = [...new Set(settlements.map((s) => s.courseId))]
    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: {
        id: true,
        venue: { select: { orgId: true, org: { select: { name: true } } } },
      },
    })
    const orgMap = new Map(
      courses.map((c) => [
        c.id,
        { orgId: c.venue?.orgId ?? null, orgName: c.venue?.org?.name ?? null },
      ]),
    )

    const priorGroups = await this.prisma.presenceFinanceEntry.groupBy({
      by: ['settlementId'],
      where: {
        account: 'TRAINER_COST',
        settlementId: { in: settlements.map((s) => s.id) },
        month: { lt: month },
      },
      _sum: { amountFen: true },
    })
    const priorMap = new Map(priorGroups.map((g) => [g.settlementId ?? '', g._sum.amountFen ?? 0]))

    const today = cstDayOf(new Date())
    const fallbackDay = month === currentCstMonth() ? today : monthLastDay(month)
    const result: EntryDraft[] = []

    for (const s of settlements) {
      const settledMonth = cstMonthOf(s.settledAt)
      if (settledMonth > month) continue

      const currentFen = settlementFen(s.adjustedAmount ?? s.amount)
      const org = orgMap.get(s.courseId) ?? { orgId: null, orgName: null }
      const snapshot = {
        orderId: null,
        orderNo: null,
        orderType: null,
        courseId: s.courseId,
        courseName: s.courseName,
        memberCardId: null,
        cardName: null,
        communityId: null,
        communityName: null,
        hostUserId: null,
        hostName: null,
        settlementId: s.id,
        trainerId: s.trainerId,
        trainerName: s.trainerName,
        orgId: org.orgId,
        orgName: org.orgName,
        serviceStart: null,
        serviceEnd: null,
        hours: s.hours,
        rate: s.rate,
      }

      if (settledMonth === month) {
        if (currentFen !== 0) {
          result.push({
            ...snapshot,
            dedupeKey: `settle:${s.id}`,
            month,
            entryDate: cstDayOf(s.settledAt),
            account: 'TRAINER_COST',
            eventType: 'SETTLEMENT',
            category: 'TRAINER',
            amountFen: currentFen,
            remark: '导师课时结算',
          })
        }
        continue
      }

      // 结算月已关账后又调整：差额补在当前未关账月份
      const priorFen = priorMap.get(s.id) ?? 0
      const delta = currentFen - priorFen
      if (delta !== 0) {
        result.push({
          ...snapshot,
          dedupeKey: `settle-adj:${s.id}:${month}`,
          month,
          entryDate: fallbackDay,
          account: 'TRAINER_COST',
          eventType: 'SETTLEMENT',
          category: 'TRAINER',
          amountFen: delta,
          remark: '结算金额调整补差',
        })
      }
    }

    return result
  }
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function monthEndDate(month: string): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 1)
}
