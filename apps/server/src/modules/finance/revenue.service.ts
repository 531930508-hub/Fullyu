import { Injectable } from '@nestjs/common'
import { Prisma, RevenueSourceKey, RevenueWay } from '@prisma/client'
import { isValidMonth, monthRange, orderAmountToYuan } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'

export interface RevenueRecordInput {
  month: string
  orgId: string
  source: RevenueSourceKey
  amount: number
  orderCount?: number
  remark?: string
}

/**
 * 收入归集。
 *
 * 各业务系统口径不同，统一抽到 RevenueRecord 按 月份 × 门店 × 数据源 存一条汇总。
 * 只有 SELF（本系统小程序）能真算 —— 走 订单 → 课程 → 场馆 → 门店 归集；
 * 在场与轻疗还没打通接口，抽取时明确报错而不是静默写 0，免得看板上少一块钱没人知道。
 */
@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  /** 数据源配置列表，配置页展示对接状态 */
  async listSources() {
    const rows = await this.prisma.revenueSourceConfig.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    })
    return rows.map((row) => ({
      key: row.key,
      name: row.name,
      intro: row.intro,
      status: row.status,
      mode: row.mode,
      cron: row.cron,
      lastSyncAt: row.lastSyncAt,
      note: row.note,
      sortOrder: row.sortOrder,
    }))
  }

  /**
   * 手动触发抽取。
   * 目前只有 SELF 源能实算，其余源返回明确失败原因，前端照原样提示给运营。
   */
  async sync(key: RevenueSourceKey, month?: string) {
    const target = month || this.defaultMonth()
    if (!isValidMonth(target)) throw new BusinessException('月份格式应为 yyyy-MM', 4270)
    const source = await this.prisma.revenueSourceConfig.findUnique({ where: { key } })
    if (!source) throw new BusinessException('收入数据源不存在', 4271)
    if (key === 'MANUAL') {
      throw new BusinessException('手工补录源没有抽取动作，请直接录入收入流水', 4272)
    }
    if (source.status !== 'CONNECTED') {
      throw new BusinessException(`${source.name} 尚未打通，暂时只能手工录入`, 4273)
    }
    if (key !== 'SELF') {
      throw new BusinessException(`${source.name} 的抽取任务待接口开放后启用`, 4273)
    }

    const result = await this.syncSelf(target)
    await this.prisma.revenueSourceConfig.update({
      where: { key },
      data: { lastSyncAt: new Date() },
    })
    return { month: target, source: key, ...result }
  }

  /**
   * 从小程序订单实算本系统收入。
   * 归集链路：订单 → 课程 → 场馆 → 场馆所属门店；
   * 会员卡这类没有课程的订单没有场馆可依托，只统计条数在 skipped 里回传，不硬塞给某个门店。
   */
  private async syncSelf(month: string) {
    const { start, end } = monthRange(month)
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: ['PAID', 'COMPLETED'] },
        paymentTime: { gte: start, lt: end },
      },
      select: {
        actualPaid: true,
        orderType: true,
        courseId: true,
        course: { select: { venue: { select: { orgId: true } } } },
      },
    })

    const grouped = new Map<string, { amount: number; orderCount: number }>()
    let skipped = 0
    for (const order of orders) {
      const orgId = order.course?.venue?.orgId
      if (!orgId) {
        skipped += 1
        continue
      }
      const acc = grouped.get(orgId) ?? { amount: 0, orderCount: 0 }
      acc.amount += orderAmountToYuan(order.orderType, Number(order.actualPaid))
      acc.orderCount += 1
      grouped.set(orgId, acc)
    }

    // syncKey 做幂等：同源同月同门店只留一条自动汇总，重复抽取覆盖不叠加
    for (const [orgId, acc] of grouped) {
      const syncKey = `SELF:${month}:${orgId}`
      const data = {
        month,
        orgId,
        source: 'SELF' as RevenueSourceKey,
        amount: Math.round(acc.amount * 100) / 100,
        orderCount: acc.orderCount,
        way: 'AUTO' as RevenueWay,
        remark: '按 订单→课程→场馆→门店 自动归集',
        syncKey,
        syncAt: new Date(),
      }
      await this.prisma.revenueRecord.upsert({ where: { syncKey }, create: data, update: data })
    }

    return {
      orgCount: grouped.size,
      orderCount: orders.length - skipped,
      /** 无场馆归属、未计入任何门店的订单数（多为会员卡订单） */
      skipped,
      amount:
        Math.round([...grouped.values()].reduce((sum, it) => sum + it.amount, 0) * 100) / 100,
    }
  }

  /** 收入流水列表 */
  async listRecords(
    admin: AdminContext,
    query: { month?: string; orgId?: string; source?: RevenueSourceKey } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.RevenueRecordWhereInput = { ...scope.toWhere('orgId') }
    if (query.month) where.month = query.month
    if (query.orgId) {
      scope.assertWritable(query.orgId)
      where.orgId = query.orgId
    }
    if (query.source) where.source = query.source
    const rows = await this.prisma.revenueRecord.findMany({
      where,
      orderBy: [{ month: 'desc' }, { orgId: 'asc' }, { source: 'asc' }],
      take: 500,
    })
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.orgId))] } },
      select: { id: true, shortName: true },
    })
    const orgMap = new Map(orgs.map((o) => [o.id, o.shortName]))
    return rows.map((row) => ({
      id: row.id,
      month: row.month,
      orgId: row.orgId,
      orgName: orgMap.get(row.orgId) ?? row.orgId,
      source: row.source,
      amount: Number(row.amount),
      orderCount: row.orderCount,
      way: row.way,
      remark: row.remark,
      syncAt: row.syncAt,
    }))
  }

  /**
   * 手工录入/导入收入。
   * 手填的不占 syncKey，允许同月同源多条分次补录，避免覆盖掉别人刚录的数。
   */
  async createRecords(admin: AdminContext, inputs: RevenueRecordInput[], way: RevenueWay) {
    const rows = (inputs ?? []).filter((it) => it && it.orgId && it.month)
    if (!rows.length) throw new BusinessException('没有可录入的收入数据', 4274)
    const scope = await buildOrgScope(this.prisma, admin)
    for (const row of rows) {
      if (!isValidMonth(row.month)) throw new BusinessException(`月份 ${row.month} 格式应为 yyyy-MM`, 4270)
      scope.assertWritable(row.orgId)
    }
    const orgIds = [...new Set(rows.map((r) => r.orgId))]
    const orgs = await this.prisma.organization.findMany({ where: { id: { in: orgIds } } })
    if (orgs.length !== orgIds.length) throw new BusinessException('存在无效的门店组织', 4275)

    const result = await this.prisma.revenueRecord.createMany({
      data: rows.map((row) => ({
        month: row.month,
        orgId: row.orgId,
        source: row.source ?? 'MANUAL',
        amount: Math.round((Number(row.amount) || 0) * 100) / 100,
        orderCount: Math.max(0, Math.floor(Number(row.orderCount) || 0)),
        way,
        remark: row.remark ?? '',
        syncAt: new Date(),
      })),
    })
    return { created: result.count }
  }

  async removeRecord(admin: AdminContext, id: string) {
    const row = await this.prisma.revenueRecord.findUnique({ where: { id } })
    if (!row) throw new BusinessException('收入流水不存在', 4276)
    if (row.way === 'AUTO') {
      throw new BusinessException('接口自动归集的流水不能手工删除，请重新抽取', 4277)
    }
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(row.orgId)
    await this.prisma.revenueRecord.delete({ where: { id } })
    return { id }
  }

  private defaultMonth() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
}
