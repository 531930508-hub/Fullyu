import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  EXPENSE_COUNTED_STATUS,
  PO_COST_COUNTED_STATUS,
  SOURCE_STATUS_META,
  buildStoreProfit,
  currentMonth,
  hasPermission,
  isValidMonth,
  monthRange,
  rateToPercent,
  type RevenueSourceKey,
  type RevenueSourceStatus,
  type StoreProfit,
} from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'

/** 算损益只靠这几个字段，单拿出来方便 overview 与 trend 共用 */
interface ProfitOrg {
  id: string
  shortName: string
  mgmtFeeRate: Prisma.Decimal
  trainFeeRate: Prisma.Decimal
  baseRent: Prisma.Decimal
  rentRate: Prisma.Decimal
  propertyFee: Prisma.Decimal
}

interface SourceConfigRow {
  key: string
  name: string
  status: RevenueSourceStatus
}

/**
 * 财务看板。
 *
 * 数字全部按月实时聚合，不落汇总表 —— 支出补录、审批通过、采购入库都会改变口径，
 * 存快照迟早对不上账。数据量是「门店数 × 月」级别，实时算完全够。
 *
 * 口径：
 * - 收入：RevenueRecord 按数据源汇总（各系统抽过来的统一口径）
 * - 人力/美团/其他：ExpenseEntry 只取已生效
 * - 房租：按门店的月保底租金与「当月收入 × 提成比例」取高现算
 * - 物业：直接取门店设定的月固定额
 * - 管理费/培训费：按 Organization 上的比例对收入现算，比例调整立刻反映
 * - 耗材：该门店向总部下的采购单金额（已通过审批的才算）
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(admin: AdminContext, month?: string) {
    const target = month || currentMonth()
    if (!isValidMonth(target)) throw new BusinessException('月份格式应为 yyyy-MM', 4270)

    const scope = await buildOrgScope(this.prisma, admin)
    // 只有独立核算主体才出损益表，部门/场馆不单独算账
    const [orgs, sources] = await Promise.all([
      this.prisma.organization.findMany({
        where: { accounting: true, status: 'ACTIVE', ...scope.toWhere('id') },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.revenueSourceConfig.findMany({ orderBy: { sortOrder: 'asc' } }),
    ])
    const sourceMeta = sources.map((src) => ({
      key: src.key,
      name: src.name,
      status: src.status,
      statusText: SOURCE_STATUS_META[src.status].text,
    }))
    if (!orgs.length) {
      return { month: target, sourceMeta, stores: [], total: this.emptyTotal(), profitVisible: false }
    }

    const byMonth = await this.profitsOf(orgs, [target], sources)
    const stores = byMonth.get(target) ?? []

    // 成本与利润属敏感数据，无权限时只留收入，前端对应把明细列隐藏
    const profitVisible = hasPermission(admin.permissions, 'finance:dashboard:profit')
    return {
      month: target,
      profitVisible,
      sourceMeta,
      stores: profitVisible ? stores : stores.map((it) => this.maskProfit(it)),
      total: profitVisible ? this.sumTotal(stores) : this.maskTotal(this.sumTotal(stores)),
    }
  }

  /**
   * 逐月逐店算损益。overview 与 trend 共用这一份口径，免得两处算法漂移。
   */
  private async profitsOf(
    orgs: ProfitOrg[],
    months: string[],
    sources: SourceConfigRow[],
  ): Promise<Map<string, StoreProfit[]>> {
    const orgIds = orgs.map((o) => o.id)
    const [revenues, expenses, purchases] = await Promise.all([
      this.prisma.revenueRecord.groupBy({
        by: ['month', 'orgId', 'source'],
        where: { month: { in: months }, orgId: { in: orgIds } },
        _sum: { amount: true },
      }),
      this.prisma.expenseEntry.groupBy({
        by: ['month', 'orgId', 'category'],
        where: { month: { in: months }, orgId: { in: orgIds }, status: { in: EXPENSE_COUNTED_STATUS } },
        _sum: { amount: true },
      }),
      this.consumableOf(months, orgIds),
    ])

    const revenueMap = new Map<string, number>()
    const expenseMap = new Map<string, number>()
    /**
     * 哪些「月份+门店」真的有经营流水。
     * 房租物业是现算的固定成本，不判这一条的话，数据还没同步进来的月份会被算成
     * 净亏一笔保底租金 —— 趋势表上就是几个凭空的负数，比没有数据更误导人。
     */
    const active = new Set<string>()
    for (const row of revenues) {
      revenueMap.set(`${row.month}:${row.orgId}:${row.source}`, Number(row._sum.amount ?? 0))
      active.add(`${row.month}:${row.orgId}`)
    }
    for (const row of expenses) {
      expenseMap.set(`${row.month}:${row.orgId}:${row.category}`, Number(row._sum.amount ?? 0))
      active.add(`${row.month}:${row.orgId}`)
    }
    for (const key of purchases.keys()) active.add(key)

    const result = new Map<string, StoreProfit[]>()
    for (const month of months) {
      const rows = orgs
        .filter((org) => active.has(`${month}:${org.id}`))
        .map((org) => {
          const sourceRows = sources.map((src) => ({
            source: src.key as RevenueSourceKey,
            name: src.name,
            status: src.status,
            amount: revenueMap.get(`${month}:${org.id}:${src.key}`) ?? 0,
          }))
          const revenue = sourceRows.reduce((sum, it) => sum + it.amount, 0)
          return buildStoreProfit({
            orgId: org.id,
            storeName: org.shortName,
            revenue,
            sources: sourceRows,
            baseRent: Number(org.baseRent),
            rentRatePercent: rateToPercent(Number(org.rentRate)),
            propertyFee: Number(org.propertyFee),
            labor: expenseMap.get(`${month}:${org.id}:LABOR`) ?? 0,
            meituan: expenseMap.get(`${month}:${org.id}:MEITUAN`) ?? 0,
            other: expenseMap.get(`${month}:${org.id}:OTHER`) ?? 0,
            consumable: purchases.get(`${month}:${org.id}`) ?? 0,
            mgmtRatePercent: rateToPercent(Number(org.mgmtFeeRate)),
            trainingRatePercent: rateToPercent(Number(org.trainFeeRate)),
          })
        })
      result.set(month, rows)
    }
    return result
  }

  /**
   * 耗材成本：门店向总部下的采购单金额，按 月份:组织 分桶。
   * 不走 ScmModule 而直接查表，是为了让财务与进销存互不依赖 —— 口径只有「已过审的单」这一条。
   */
  private async consumableOf(months: string[], orgIds: string[]) {
    const ranges = months.map((m) => monthRange(m))
    const start = new Date(Math.min(...ranges.map((r) => r.start.getTime())))
    const end = new Date(Math.max(...ranges.map((r) => r.end.getTime())))
    const rows = await this.prisma.purchaseOrder.findMany({
      where: {
        buyerId: { in: orgIds },
        supplierType: 'HQ',
        status: { in: PO_COST_COUNTED_STATUS },
        createdAt: { gte: start, lt: end },
      },
      select: { buyerId: true, createdAt: true, totalAmount: true },
    })
    const map = new Map<string, number>()
    for (const row of rows) {
      const key = `${currentMonth(row.createdAt)}:${row.buyerId}`
      map.set(key, (map.get(key) ?? 0) + Number(row.totalAmount))
    }
    return map
  }

  /** 总部汇总行：各门店直接相加，比例类费用同样是各店现算后的和 */
  private sumTotal(stores: StoreProfit[]) {
    const pick = (fn: (it: StoreProfit) => number) =>
      Math.round(stores.reduce((sum, it) => sum + fn(it), 0) * 100) / 100
    const revenue = pick((it) => it.revenue)
    const totalExpense = pick((it) => it.totalExpense)
    const profit = Math.round((revenue - totalExpense) * 100) / 100
    return {
      revenue,
      rent: pick((it) => it.rent),
      property: pick((it) => it.property),
      labor: pick((it) => it.labor),
      meituan: pick((it) => it.meituan),
      other: pick((it) => it.other),
      mgmtFee: pick((it) => it.mgmtFee),
      trainingFee: pick((it) => it.trainingFee),
      consumable: pick((it) => it.consumable),
      totalExpense,
      profit,
      profitRate: revenue ? Math.round((profit / revenue) * 10000) / 100 : 0,
      storeCount: stores.length,
    }
  }

  private emptyTotal() {
    return this.sumTotal([])
  }

  private maskProfit(row: StoreProfit): StoreProfit {
    return {
      ...row,
      rent: 0,
      ratioRent: 0,
      baseRent: 0,
      rentRate: 0,
      property: 0,
      labor: 0,
      meituan: 0,
      other: 0,
      mgmtFee: 0,
      trainingFee: 0,
      consumable: 0,
      totalExpense: 0,
      profit: 0,
      profitRate: 0,
    }
  }

  private maskTotal(total: ReturnType<DashboardService['sumTotal']>) {
    return {
      ...total,
      rent: 0,
      property: 0,
      labor: 0,
      meituan: 0,
      other: 0,
      mgmtFee: 0,
      trainingFee: 0,
      consumable: 0,
      totalExpense: 0,
      profit: 0,
      profitRate: 0,
    }
  }

  /**
   * 近几月经营趋势：收入 / 成本 / 利润 / 净利率。
   * 口径与月度损益表完全一致（含现算租金物业、比例费与耗材），
   * 而不是只算录入类支出 —— 两张表对不上数比没有趋势更让人难受。
   */
  async trend(admin: AdminContext, months: string[], orgId?: string) {
    const scope = await buildOrgScope(this.prisma, admin)
    if (orgId) scope.assertWritable(orgId)
    const blank = months.map((month) => ({ month, revenue: 0, totalExpense: 0, profit: 0, profitRate: 0 }))
    if (!months.length) return blank

    const [orgs, sources] = await Promise.all([
      this.prisma.organization.findMany({
        where: {
          accounting: true,
          status: 'ACTIVE',
          ...(orgId ? { id: orgId } : scope.toWhere('id')),
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.revenueSourceConfig.findMany({ orderBy: { sortOrder: 'asc' } }),
    ])
    if (!orgs.length) return blank

    const byMonth = await this.profitsOf(orgs, months, sources)
    const profitVisible = hasPermission(admin.permissions, 'finance:dashboard:profit')
    return months.map((month) => {
      const sum = this.sumTotal(byMonth.get(month) ?? [])
      const row = profitVisible ? sum : this.maskTotal(sum)
      return {
        month,
        revenue: row.revenue,
        totalExpense: row.totalExpense,
        profit: row.profit,
        profitRate: row.profitRate,
      }
    })
  }
}
