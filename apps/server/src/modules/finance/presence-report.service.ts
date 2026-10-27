import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { buildOrgScope, type OrgScope } from '../../common/utils/data-scope.util'
import { PrismaService } from '../../common/prisma.service'
import { PresenceLedgerService } from './presence-ledger.service'

/**
 * 在场业务财务报表。
 *
 * 所有数字只从 presence_finance_entries 聚合，不读订单/结算业务表；
 * 业务表只由 PresenceLedgerService 生成台账时消费。
 */

const CST_OFFSET_MS = 8 * 60 * 60 * 1000

function currentCstMonth(): string {
  const shifted = new Date(Date.now() + CST_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, offset: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + offset, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function normalizeMonth(raw?: string): string {
  const now = currentCstMonth()
  if (!raw) return now
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    throw new BadRequestException('月份格式应为 yyyy-MM')
  }
  if (raw > now) throw new BadRequestException('不能查询未来月份')
  return raw
}

interface GroupRow {
  account: string
  eventType: string
  category: string
  month?: string
  orderId?: string | null
  communityId?: string | null
  _sum: { amountFen: number | null }
}

function sumRows(rows: GroupRow[], predicate: (row: GroupRow) => boolean): number {
  return rows.reduce((acc, row) => (predicate(row) ? acc + (row._sum.amountFen ?? 0) : acc), 0)
}

@Injectable()
export class PresenceReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: PresenceLedgerService,
  ) {}

  // ==================== 总览 ====================

  async dashboard(admin: any, rawMonth?: string, orgId?: string) {
    const month = normalizeMonth(rawMonth)
    await this.ledger.ensureThrough(month)

    const scope = await buildOrgScope(this.prisma, admin)
    const orgWhere = this.orgWhere(scope, orgId)
    const trendMonths = Array.from({ length: 6 }, (_, i) => shiftMonth(month, -i)).reverse()
    const trendStart = trendMonths[0]

    const [monthRows, cumRows, trendRows, orderRows, trainerRows, period] = await Promise.all([
      this.prisma.presenceFinanceEntry.groupBy({
        by: ['account', 'eventType', 'category'],
        where: { month, ...orgWhere },
        _sum: { amountFen: true },
      }),
      this.prisma.presenceFinanceEntry.groupBy({
        by: ['account', 'eventType', 'category'],
        where: { month: { lte: month }, ...orgWhere },
        _sum: { amountFen: true },
      }),
      this.prisma.presenceFinanceEntry.groupBy({
        by: ['month', 'account'],
        where: { month: { gte: trendStart, lte: month }, ...orgWhere },
        _sum: { amountFen: true },
      }),
      this.prisma.presenceFinanceEntry.findMany({
        where: { month, account: 'CASH', eventType: 'CASH_IN', orderId: { not: null }, ...orgWhere },
        distinct: ['orderId'],
        select: { orderId: true, category: true },
      }),
      this.prisma.presenceFinanceEntry.findMany({
        where: { month, account: 'TRAINER_COST', settlementId: { not: null }, ...orgWhere },
        distinct: ['settlementId'],
        select: { settlementId: true },
      }),
      this.prisma.presenceFinancePeriod.findUnique({ where: { month } }),
    ])

    const m = monthRows as unknown as GroupRow[]
    const c = cumRows as unknown as GroupRow[]

    const cashByCategory = (rows: GroupRow[], category: string) =>
      sumRows(rows, (r) => r.account === 'CASH' && r.category === category)
    const revenueByCategory = (rows: GroupRow[], category: string) =>
      sumRows(rows, (r) => r.account === 'REVENUE' && r.category === category)

    const cashTotal = sumRows(m, (r) => r.account === 'CASH')
    const revenueTotal = sumRows(m, (r) => r.account === 'REVENUE')
    const trainerCost = sumRows(m, (r) => r.account === 'TRAINER_COST')
    const reversal = sumRows(m, (r) => r.account === 'REVENUE' && r.eventType === 'REVERSAL')

    const communityCash = cashByCategory(m, 'COMMUNITY_FEE')
    const communityFee = revenueByCategory(m, 'COMMUNITY_FEE')
    const communityFeeReversal = sumRows(
      m,
      (r) => r.account === 'REVENUE' && r.category === 'COMMUNITY_FEE' && r.eventType === 'REVERSAL',
    )
    const communityCashCum = cashByCategory(c, 'COMMUNITY_FEE')
    const communityFeeCum = revenueByCategory(c, 'COMMUNITY_FEE')

    const deferredCourse = cashByCategory(c, 'COURSE') - revenueByCategory(c, 'COURSE')
    const deferredMemberCard =
      cashByCategory(c, 'MEMBER_CARD') - revenueByCategory(c, 'MEMBER_CARD')
    const deferredWaitlist = cashByCategory(c, 'WAITLIST')

    const countOf = (category: string) =>
      new Set(orderRows.filter((r) => r.category === category).map((r) => r.orderId)).size

    const trendMap = new Map<string, { cashFen: number; revenueFen: number; trainerFen: number }>()
    for (const row of trendRows as unknown as GroupRow[]) {
      const key = row.month ?? ''
      const item = trendMap.get(key) ?? { cashFen: 0, revenueFen: 0, trainerFen: 0 }
      const amount = row._sum.amountFen ?? 0
      if (row.account === 'CASH') item.cashFen += amount
      if (row.account === 'REVENUE') item.revenueFen += amount
      if (row.account === 'TRAINER_COST') item.trainerFen += amount
      trendMap.set(key, item)
    }

    return {
      month,
      orgId: orgId ?? null,
      period: {
        status: period?.status ?? (month < currentCstMonth() ? 'CLOSED' : 'OPEN'),
        closedAt: period?.closedAt ?? null,
        closedBy: period?.closedBy ?? null,
      },
      cash: {
        totalFen: cashTotal,
        courseFen: cashByCategory(m, 'COURSE'),
        memberCardFen: cashByCategory(m, 'MEMBER_CARD'),
        waitlistFen: cashByCategory(m, 'WAITLIST'),
        communityFen: communityCash,
      },
      revenue: {
        totalFen: revenueTotal,
        courseFen: revenueByCategory(m, 'COURSE'),
        memberCardFen: revenueByCategory(m, 'MEMBER_CARD'),
        communityFeeFen: communityFee,
        reversalFen: reversal,
      },
      deferred: {
        totalFen: deferredCourse + deferredMemberCard + deferredWaitlist,
        courseFen: deferredCourse,
        memberCardFen: deferredMemberCard,
        waitlistFen: deferredWaitlist,
      },
      community: {
        cashFen: communityCash,
        feeFen: communityFee,
        feeReversalFen: communityFeeReversal,
        payableFen: communityCashCum - communityFeeCum,
      },
      trainer: {
        costFen: trainerCost,
        settlementCount: trainerRows.length,
      },
      grossProfitFen: revenueTotal - trainerCost,
      orders: {
        course: countOf('COURSE'),
        memberCard: countOf('MEMBER_CARD'),
        waitlist: countOf('WAITLIST'),
        community: countOf('COMMUNITY_FEE'),
      },
      trend: trendMonths.map((key) => ({
        month: key,
        ...(trendMap.get(key) ?? { cashFen: 0, revenueFen: 0, trainerFen: 0 }),
      })),
    }
  }

  // ==================== 报课 / 会员卡确认明细 ====================

  async courseRevenue(
    admin: any,
    query: { month?: string; orgId?: string; keyword?: string; page?: number; pageSize?: number },
  ) {
    const month = normalizeMonth(query.month)
    await this.ledger.ensureThrough(month)
    const scope = await buildOrgScope(this.prisma, admin)
    const orgWhere = this.orgWhere(scope, query.orgId)
    const baseWhere: Prisma.PresenceFinanceEntryWhereInput = {
      month,
      category: { in: ['COURSE', 'MEMBER_CARD'] },
      orderId: { not: null },
      ...orgWhere,
    }

    const monthGroups = await this.prisma.presenceFinanceEntry.groupBy({
      by: ['orderId', 'account', 'eventType'],
      where: baseWhere,
      _sum: { amountFen: true },
    })
    const ids = [
      ...new Set(monthGroups.map((g) => g.orderId).filter((id): id is string => !!id)),
    ]
    if (!ids.length) {
      return {
        list: [],
        total: 0,
        summary: {
          monthCashFen: 0,
          monthRevenueFen: 0,
          monthReversalFen: 0,
          deferredFen: 0,
        },
      }
    }

    const [cumGroups, snapshots] = await Promise.all([
      this.prisma.presenceFinanceEntry.groupBy({
        by: ['orderId', 'account'],
        where: { orderId: { in: ids }, month: { lte: month }, ...orgWhere },
        _sum: { amountFen: true },
      }),
      this.prisma.presenceFinanceEntry.findMany({
        where: {
          month,
          orderId: { in: ids },
          category: { in: ['COURSE', 'MEMBER_CARD'] },
          ...orgWhere,
        },
        select: {
          orderId: true,
          orderNo: true,
          orderType: true,
          courseName: true,
          cardName: true,
          serviceStart: true,
          serviceEnd: true,
          orgId: true,
          orgName: true,
          account: true,
          eventType: true,
          amountFen: true,
        },
      }),
    ])

    const monthMap = new Map<string, { cash: number; revenue: number; reversal: number }>()
    for (const g of monthGroups) {
      if (!g.orderId) continue
      const cur = monthMap.get(g.orderId) ?? { cash: 0, revenue: 0, reversal: 0 }
      const amount = g._sum.amountFen ?? 0
      if (g.account === 'CASH') cur.cash += amount
      if (g.account === 'REVENUE') cur.revenue += amount
      if (g.account === 'REVENUE' && g.eventType === 'REVERSAL') cur.reversal += amount
      monthMap.set(g.orderId, cur)
    }

    const cumMap = new Map<string, { cash: number; revenue: number }>()
    for (const g of cumGroups) {
      if (!g.orderId) continue
      const cur = cumMap.get(g.orderId) ?? { cash: 0, revenue: 0 }
      const amount = g._sum.amountFen ?? 0
      if (g.account === 'CASH') cur.cash += amount
      if (g.account === 'REVENUE') cur.revenue += amount
      cumMap.set(g.orderId, cur)
    }

    const snapMap = new Map<string, (typeof snapshots)[number]>()
    for (const snap of snapshots) {
      if (!snap.orderId) continue
      const prev = snapMap.get(snap.orderId)
      // 优先使用带服务期的确认流水作为展示快照
      if (!prev || (!prev.serviceStart && snap.serviceStart)) snapMap.set(snap.orderId, snap)
    }

    const rows = ids.map((id) => {
      const snap = snapMap.get(id)
      const monthAgg = monthMap.get(id) ?? { cash: 0, revenue: 0, reversal: 0 }
      const cumAgg = cumMap.get(id) ?? { cash: 0, revenue: 0 }
      return {
        orderId: id,
        orderNo: snap?.orderNo ?? '',
        orderType: snap?.orderType ?? '',
        category: snap?.orderType === 'MEMBER_CARD' ? 'MEMBER_CARD' : 'COURSE',
        name: snap?.courseName || snap?.cardName || '—',
        orgId: snap?.orgId ?? null,
        orgName: snap?.orgName ?? null,
        serviceStart: snap?.serviceStart ?? null,
        serviceEnd: snap?.serviceEnd ?? null,
        monthCashFen: monthAgg.cash,
        monthRevenueFen: monthAgg.revenue,
        monthReversalFen: monthAgg.reversal,
        cumulativeCashFen: cumAgg.cash,
        cumulativeRevenueFen: cumAgg.revenue,
        deferredFen: cumAgg.cash - cumAgg.revenue,
      }
    })

    const keyword = (query.keyword ?? '').trim().toLowerCase()
    const filtered = keyword
      ? rows.filter(
          (r) =>
            r.orderNo.toLowerCase().includes(keyword) ||
            r.name.toLowerCase().includes(keyword) ||
            (r.orgName ?? '').toLowerCase().includes(keyword),
        )
      : rows
    filtered.sort((a, b) => b.monthRevenueFen - a.monthRevenueFen || b.monthCashFen - a.monthCashFen)

    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
    const list = filtered.slice((page - 1) * pageSize, page * pageSize)

    const summary = {
      monthCashFen: filtered.reduce((acc, r) => acc + r.monthCashFen, 0),
      monthRevenueFen: filtered.reduce((acc, r) => acc + r.monthRevenueFen, 0),
      monthReversalFen: filtered.reduce((acc, r) => acc + r.monthReversalFen, 0),
      deferredFen: filtered.reduce((acc, r) => acc + r.deferredFen, 0),
    }

    return { list, total: filtered.length, summary }
  }

  // ==================== 社群代收 ====================

  async communityRevenue(
    admin: any,
    query: { month?: string; keyword?: string; page?: number; pageSize?: number },
  ) {
    const month = normalizeMonth(query.month)
    await this.ledger.ensureThrough(month)
    const scope = await buildOrgScope(this.prisma, admin)
    const orgWhere = this.orgWhere(scope)
    const baseWhere: Prisma.PresenceFinanceEntryWhereInput = {
      month,
      category: 'COMMUNITY_FEE',
      communityId: { not: null },
      ...orgWhere,
    }

    const monthGroups = await this.prisma.presenceFinanceEntry.groupBy({
      by: ['communityId', 'account', 'eventType'],
      where: baseWhere,
      _sum: { amountFen: true },
    })
    const ids = [
      ...new Set(monthGroups.map((g) => g.communityId).filter((id): id is string => !!id)),
    ]
    if (!ids.length) {
      return {
        list: [],
        total: 0,
        summary: { monthCashFen: 0, monthFeeFen: 0, monthReversalFen: 0, payableFen: 0 },
      }
    }

    const [cumGroups, snapshots] = await Promise.all([
      this.prisma.presenceFinanceEntry.groupBy({
        by: ['communityId', 'account'],
        where: { communityId: { in: ids }, month: { lte: month }, ...orgWhere },
        _sum: { amountFen: true },
      }),
      this.prisma.presenceFinanceEntry.findMany({
        where: { month, communityId: { in: ids }, category: 'COMMUNITY_FEE', ...orgWhere },
        select: {
          communityId: true,
          communityName: true,
          hostUserId: true,
          hostName: true,
          eventType: true,
          amountFen: true,
        },
      }),
    ])

    const monthMap = new Map<string, { cash: number; fee: number; reversal: number }>()
    for (const g of monthGroups) {
      if (!g.communityId) continue
      const cur = monthMap.get(g.communityId) ?? { cash: 0, fee: 0, reversal: 0 }
      const amount = g._sum.amountFen ?? 0
      if (g.account === 'CASH') cur.cash += amount
      if (g.account === 'REVENUE') cur.fee += amount
      if (g.account === 'REVENUE' && g.eventType === 'REVERSAL') cur.reversal += amount
      monthMap.set(g.communityId, cur)
    }

    const cumMap = new Map<string, { cash: number; fee: number }>()
    for (const g of cumGroups) {
      if (!g.communityId) continue
      const cur = cumMap.get(g.communityId) ?? { cash: 0, fee: 0 }
      const amount = g._sum.amountFen ?? 0
      if (g.account === 'CASH') cur.cash += amount
      if (g.account === 'REVENUE') cur.fee += amount
      cumMap.set(g.communityId, cur)
    }

    const snapMap = new Map<string, (typeof snapshots)[number]>()
    for (const snap of snapshots) {
      if (snap.communityId && !snapMap.has(snap.communityId)) snapMap.set(snap.communityId, snap)
    }

    const rows = ids.map((id) => {
      const snap = snapMap.get(id)
      const m = monthMap.get(id) ?? { cash: 0, fee: 0, reversal: 0 }
      const cum = cumMap.get(id) ?? { cash: 0, fee: 0 }
      return {
        communityId: id,
        communityName: snap?.communityName ?? '—',
        hostUserId: snap?.hostUserId ?? null,
        hostName: snap?.hostName ?? '—',
        monthCashFen: m.cash,
        monthFeeFen: m.fee,
        monthReversalFen: m.reversal,
        cumulativeCashFen: cum.cash,
        cumulativeFeeFen: cum.fee,
        payableFen: cum.cash - cum.fee,
      }
    })

    const keyword = (query.keyword ?? '').trim().toLowerCase()
    const filtered = keyword
      ? rows.filter(
          (r) =>
            r.communityName.toLowerCase().includes(keyword) ||
            r.hostName.toLowerCase().includes(keyword),
        )
      : rows
    filtered.sort((a, b) => b.monthCashFen - a.monthCashFen)

    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
    const list = filtered.slice((page - 1) * pageSize, page * pageSize)

    return {
      list,
      total: filtered.length,
      summary: {
        monthCashFen: filtered.reduce((acc, r) => acc + r.monthCashFen, 0),
        monthFeeFen: filtered.reduce((acc, r) => acc + r.monthFeeFen, 0),
        monthReversalFen: filtered.reduce((acc, r) => acc + r.monthReversalFen, 0),
        payableFen: filtered.reduce((acc, r) => acc + r.payableFen, 0),
      },
    }
  }

  // ==================== 导师结算 ====================

  async trainerSettlements(
    admin: any,
    query: { month?: string; orgId?: string; keyword?: string; page?: number; pageSize?: number },
  ) {
    const month = normalizeMonth(query.month)
    await this.ledger.ensureThrough(month)
    const scope = await buildOrgScope(this.prisma, admin)
    const orgWhere = this.orgWhere(scope, query.orgId)

    const entries = await this.prisma.presenceFinanceEntry.findMany({
      where: { month, account: 'TRAINER_COST', ...orgWhere },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    })

    const map = new Map<
      string,
      {
        settlementId: string
        trainerId: string | null
        trainerName: string
        courseName: string
        orgName: string | null
        hours: number | null
        rate: number | null
        amountFen: number
        entryDate: Date
        adjusted: boolean
      }
    >()

    for (const e of entries) {
      const key = e.settlementId ?? e.id
      const cur = map.get(key)
      if (cur) {
        cur.amountFen += e.amountFen
        if (e.remark?.includes('调整')) cur.adjusted = true
        continue
      }
      map.set(key, {
        settlementId: key,
        trainerId: e.trainerId,
        trainerName: e.trainerName ?? '—',
        courseName: e.courseName ?? '—',
        orgName: e.orgName,
        hours: e.hours === null ? null : Number(e.hours),
        rate: e.rate === null ? null : Number(e.rate),
        amountFen: e.amountFen,
        entryDate: e.entryDate,
        adjusted: !!e.remark?.includes('调整'),
      })
    }

    const all = [...map.values()]
    const keyword = (query.keyword ?? '').trim().toLowerCase()
    const filtered = keyword
      ? all.filter(
          (r) =>
            r.trainerName.toLowerCase().includes(keyword) ||
            r.courseName.toLowerCase().includes(keyword) ||
            (r.orgName ?? '').toLowerCase().includes(keyword),
        )
      : all
    filtered.sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime())

    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
    const list = filtered.slice((page - 1) * pageSize, page * pageSize)

    return {
      list,
      total: filtered.length,
      summary: {
        costFen: filtered.reduce((acc, r) => acc + r.amountFen, 0),
        trainerCount: new Set(filtered.map((r) => r.trainerId ?? r.trainerName)).size,
        settlementCount: filtered.length,
      },
    }
  }

  // ==================== 关账期间 ====================

  async periods() {
    return this.ledger.listPeriods()
  }

  // ==================== 工具 ====================

  private orgWhere(scope: OrgScope, orgId?: string): Prisma.PresenceFinanceEntryWhereInput {
    if (orgId) {
      if (!scope.includes(orgId)) return { orgId: '__out_of_scope__' }
      return { orgId }
    }
    if (scope.unrestricted) return {}
    return { orgId: { in: scope.orgIds ?? [] } }
  }
}
