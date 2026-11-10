import { Injectable } from '@nestjs/common'
import { Prisma, StockAdjustReason, StockAdjustStatus } from '@prisma/client'
import {
  ADJUST_REASON_NAMES,
  BATCH_EXPIRING_DAYS,
  hasPermission,
  isBelowSafety,
  sumAdjustAmount,
} from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { generateDocNo } from '../../common/doc-no.helper'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { ApprovalService } from '../approval/approval.service'
import { StockService } from './stock.service'
import { ScmLocationService } from './scm-location.service'
import { ScmPriceService } from './scm-price.service'
import { money2, qty3 } from './scm.util'

export interface CreateAdjustInput {
  /** 库存地点，自有仓即组织 id */
  warehouseId: string
  reason: StockAdjustReason
  remark?: string
  /** 只填盘点后的实际数，账面数由后端抓当前结存做快照 */
  items: { productId: string; afterQty: number }[]
}

const adjustInclude = { items: true } satisfies Prisma.StockAdjustInclude

/**
 * 库存查询与库存调整。
 *
 * 结存按「地点 + 商品」记账，物权组织单独存 ownerOrgId：
 * 货可以放在供应商/代工厂，但行级数据范围仍按物权组织过滤。
 * 调整单（盘盈盘亏/报损）走审批，通过后才真正写库存，
 * 免审时提交即生效 —— 生效动作统一由 StockService.applyAdjust 执行。
 */
@Injectable()
export class StockQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly approvalService: ApprovalService,
    private readonly stockService: StockService,
    private readonly locationService: ScmLocationService,
    private readonly priceService: ScmPriceService,
  ) {}

  // ===== 库存查询 =====

  /** 库存结存。金额列需要 scm:stock:cost 权限 */
  async balances(
    admin: AdminContext,
    query: { warehouseId?: string; keyword?: string; belowSafety?: boolean } = {},
  ) {
    await this.locationService.ensureOwnLocations()
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.StockBalanceWhereInput = { ...scope.toWhere('ownerOrgId') }
    if (query.warehouseId) {
      const location = await this.locationService.resolveLocation(query.warehouseId)
      scope.assertWritable(this.locationService.ownerOf(location))
      where.warehouseId = location.id
    }
    if (query.keyword) {
      where.product = {
        OR: [{ name: { contains: query.keyword } }, { code: { contains: query.keyword } }],
      }
    }
    const rows = await this.prisma.stockBalance.findMany({
      // 结存为 0 的行只代表历史上放过货，留在列表里会制造「缺料」假象
      where: { ...where, qty: { not: 0 } },
      orderBy: [{ warehouseId: 'asc' }, { productId: 'asc' }],
      include: { product: true },
    })
    const locations = await this.locationService.nameMap(rows.map((row) => row.warehouseId))
    const canSeeCost = hasPermission(admin.permissions, 'scm:stock:cost')
    // 结存金额按批次余额 × 批次实际成本汇总，未覆盖到批次的历史结存用最近价/档案价兜底
    const [batchValue, latestPrices] = await Promise.all([
      this.batchQtyValueMap(
        rows.map((row) => row.warehouseId),
        rows.map((row) => row.productId),
      ),
      this.priceService.latestPriceMap(
        this.prisma,
        rows.map((row) => row.productId),
      ),
    ])
    const list = rows.map((row) => {
      const qty = qty3(row.qty)
      const location = locations.get(row.warehouseId)
      const batch = batchValue.get(`${row.warehouseId}:${row.productId}`)
      const batchQty = batch?.qty ?? 0
      const fallbackPrice = latestPrices.get(row.productId) ?? Number(row.product.purchasePrice)
      const value = (batch?.value ?? 0) + Math.max(0, qty - batchQty) * fallbackPrice
      return {
        warehouseId: row.warehouseId,
        warehouseName: location?.name ?? row.warehouseId,
        locationType: location?.type ?? 'OWN',
        ownerOrgId: row.ownerOrgId || row.warehouseId,
        productId: row.productId,
        code: row.product.code,
        name: row.product.name,
        spec: row.product.spec,
        unit: row.product.unit,
        qty,
        safetyStock: row.product.safetyStock,
        belowSafety: isBelowSafety(qty, row.product.safetyStock),
        amount: canSeeCost ? money2(value) : 0,
        costVisible: canSeeCost,
        updatedAt: row.updatedAt,
      }
    })
    return query.belowSafety ? list.filter((it) => it.belowSafety) : list
  }

  /**
   * 批次余额汇总：按「地点:商品」归集批次数量与金额。
   */
  private async batchQtyValueMap(warehouseIds: string[], productIds: string[]) {
    const map = new Map<string, { qty: number; value: number }>()
    const uniqueWarehouses = [...new Set(warehouseIds)]
    const uniqueProducts = [...new Set(productIds)]
    if (!uniqueWarehouses.length || !uniqueProducts.length) return map
    const batches = await this.prisma.scmStockBatch.findMany({
      where: {
        warehouseId: { in: uniqueWarehouses },
        productId: { in: uniqueProducts },
        qty: { gt: 0 },
      },
      select: { warehouseId: true, productId: true, qty: true, unitCost: true },
    })
    for (const batch of batches) {
      const key = `${batch.warehouseId}:${batch.productId}`
      const hit = map.get(key) ?? { qty: 0, value: 0 }
      hit.qty += Number(batch.qty)
      hit.value += Number(batch.qty) * Number(batch.unitCost)
      map.set(key, hit)
    }
    return map
  }

  /**
   * 批次与效期看板。
   * 汇总口径在状态筛选之前算，方便顶部卡片始终展示全部临期/过期数量。
   */
  async batches(
    admin: AdminContext,
    query: {
      warehouseId?: string
      keyword?: string
      status?: 'OK' | 'EXPIRING' | 'EXPIRED'
      expiringDays?: number
    } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.ScmStockBatchWhereInput = {
      ...scope.toWhere('ownerOrgId'),
      qty: { gt: 0 },
    }
    if (query.warehouseId) {
      const location = await this.locationService.resolveLocation(query.warehouseId)
      scope.assertWritable(this.locationService.ownerOf(location))
      where.warehouseId = location.id
    }
    if (query.keyword) {
      where.OR = [
        { batchNo: { contains: query.keyword } },
        { product: { name: { contains: query.keyword } } },
        { product: { code: { contains: query.keyword } } },
      ]
    }
    const rows = await this.prisma.scmStockBatch.findMany({
      where,
      include: {
        product: { select: { code: true, name: true, spec: true, unit: true, shelfLifeDays: true } },
      },
      take: 800,
    })
    // 效期升序，无有效期排最后；同效期按入库时间倒序，新批次在前
    rows.sort((a, b) => {
      const ae = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY
      const be = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY
      if (ae !== be) return ae - be
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
    const locations = await this.locationService.nameMap(rows.map((row) => row.warehouseId))
    const canSeeCost = hasPermission(admin.permissions, 'scm:stock:cost')
    const warningDays = Math.max(0, Number(query.expiringDays) || BATCH_EXPIRING_DAYS)
    const list = rows.map((row) => {
      const daysToExpiry = daysUntil(row.expiryDate)
      const status =
        daysToExpiry === null ? 'OK' : daysToExpiry < 0 ? 'EXPIRED' : daysToExpiry <= warningDays ? 'EXPIRING' : 'OK'
      const qty = qty3(row.qty)
      return {
        id: row.id,
        warehouseId: row.warehouseId,
        warehouseName: locations.get(row.warehouseId)?.name ?? row.warehouseId,
        ownerOrgId: row.ownerOrgId || row.warehouseId,
        productId: row.productId,
        code: row.product.code,
        name: row.product.name,
        spec: row.product.spec,
        unit: row.product.unit,
        shelfLifeDays: row.product.shelfLifeDays,
        batchNo: row.batchNo,
        productionDate: row.productionDate,
        expiryDate: row.expiryDate,
        daysToExpiry,
        qty,
        unitCost: canSeeCost ? Math.round(Number(row.unitCost) * 1e6) / 1e6 : 0,
        amount: canSeeCost ? money2(qty * Number(row.unitCost)) : 0,
        status,
        sourceType: row.sourceType,
        sourceNo: row.sourceNo,
        createdAt: row.createdAt,
      }
    })
    const summary = {
      total: list.length,
      expiring: list.filter((it) => it.status === 'EXPIRING').length,
      expired: list.filter((it) => it.status === 'EXPIRED').length,
      qty: qty3(list.reduce((sum, it) => sum + it.qty, 0)),
      amount: canSeeCost ? money2(list.reduce((sum, it) => sum + it.amount, 0)) : 0,
      warningDays,
    }
    return {
      summary,
      rows: query.status ? list.filter((it) => it.status === query.status) : list,
    }
  }

  /** 出入库流水 */
  async ledgers(
    admin: AdminContext,
    query: { warehouseId?: string; productId?: string; limit?: number } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.StockLedgerWhereInput = { ...scope.toWhere('ownerOrgId') }
    if (query.warehouseId) {
      const location = await this.locationService.resolveLocation(query.warehouseId)
      scope.assertWritable(this.locationService.ownerOf(location))
      where.warehouseId = location.id
    }
    if (query.productId) where.productId = query.productId
    const rows = await this.prisma.stockLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.limit) || 200, 500),
    })
    const [products, locations] = await Promise.all([
      this.prisma.scmProduct.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.productId))] } },
        select: { id: true, name: true, unit: true },
      }),
      this.locationService.nameMap(rows.map((row) => row.warehouseId)),
    ])
    const map = new Map(products.map((p) => [p.id, p]))
    return rows.map((row) => ({
      id: row.id,
      warehouseId: row.warehouseId,
      warehouseName: locations.get(row.warehouseId)?.name ?? row.warehouseId,
      ownerOrgId: row.ownerOrgId || row.warehouseId,
      productId: row.productId,
      name: map.get(row.productId)?.name ?? row.productId,
      unit: map.get(row.productId)?.unit ?? '',
      type: row.type,
      qty: qty3(row.qty),
      batchNo: row.batchNo,
      ref: row.ref,
      createdAt: row.createdAt,
    }))
  }

  // ===== 库存调整 =====

  async listAdjusts(
    admin: AdminContext,
    query: { warehouseId?: string; status?: StockAdjustStatus } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.StockAdjustWhereInput = { ...scope.toWhere('ownerOrgId') }
    if (query.warehouseId) {
      const location = await this.locationService.resolveLocation(query.warehouseId)
      scope.assertWritable(this.locationService.ownerOf(location))
      where.warehouseId = location.id
    }
    if (query.status) where.status = query.status
    const rows = await this.prisma.stockAdjust.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: adjustInclude,
    })
    const locations = await this.locationService.nameMap(rows.map((row) => row.warehouseId))
    const canSeeCost = hasPermission(admin.permissions, 'scm:stock:cost')
    return rows.map((row) =>
      this.toAdjustDto(row, canSeeCost, locations.get(row.warehouseId)?.name),
    )
  }

  async createAdjust(admin: AdminContext, input: CreateAdjustInput) {
    const location = await this.locationService.resolveLocation(input.warehouseId)
    if (!location.enabled) throw new BusinessException('库存地点已停用', 4278)
    const ownerOrgId = this.locationService.ownerOf(location)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(ownerOrgId)

    const lines = (input.items ?? []).filter((it) => it.productId && it.afterQty !== undefined)
    if (!lines.length) throw new BusinessException('请至少添加一行调整明细', 4260)

    const products = await this.prisma.scmProduct.findMany({
      where: { id: { in: lines.map((it) => it.productId) } },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))
    const balances = await this.prisma.stockBalance.findMany({
      where: { warehouseId: location.id, productId: { in: lines.map((it) => it.productId) } },
    })
    const qtyMap = new Map(balances.map((b) => [b.productId, qty3(b.qty)]))

    const items = lines.map((line) => {
      const product = productMap.get(line.productId)
      if (!product) throw new BusinessException('商品不存在或已删除', 4253)
      const beforeQty = qtyMap.get(line.productId) ?? 0
      const afterQty = Math.max(0, qty3(line.afterQty))
      return {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        beforeQty,
        afterQty,
        diffQty: qty3(afterQty - beforeQty),
        price: Number(product.supplyPrice),
      }
    })
    const effective = items.filter((it) => it.diffQty !== 0)
    if (!effective.length) throw new BusinessException('实际数与账面数一致，无需调整', 4261)
    const totalAmount = sumAdjustAmount(effective)

    const id = await generateDocNo(this.redis, 'SA', async (no) => {
      return !!(await this.prisma.stockAdjust.findUnique({ where: { id: no } }))
    })
    const operator = await this.prisma.adminUser.findUnique({
      where: { id: admin.adminId },
      select: { username: true, name: true },
    })

    await this.prisma.stockAdjust.create({
      data: {
        id,
        warehouseId: location.id,
        ownerOrgId,
        reason: input.reason,
        remark: input.remark ?? '',
        totalAmount,
        status: 'PENDING_APPROVAL',
        createdBy: operator?.username ?? admin.username,
        createdByName: operator?.name ?? '',
        items: { create: effective },
      },
    })

    const approval = await this.approvalService.submit({
      bizType: 'STOCK_ADJUST',
      bizId: id,
      summary: `库存调整 ${id}：${location.name} ${ADJUST_REASON_NAMES[input.reason]} ${effective.length} 项，影响 ¥${totalAmount.toFixed(2)}`,
      amount: totalAmount,
      orgId: ownerOrgId,
      requesterId: admin.adminId,
    })

    if (approval) {
      await this.prisma.stockAdjust.update({
        where: { id },
        data: { approvalId: approval.id, flowName: approval.flowName },
      })
    } else {
      // 未命中流程即免审，立刻生效
      await this.prisma.$transaction((tx) => this.stockService.applyAdjust(tx, id))
    }

    const row = await this.prisma.stockAdjust.findUniqueOrThrow({
      where: { id },
      include: adjustInclude,
    })
    return this.toAdjustDto(
      row,
      hasPermission(admin.permissions, 'scm:stock:cost'),
      location.name,
    )
  }

  /** 撤销：只能撤还在审批中的调整单 */
  async cancelAdjust(admin: AdminContext, id: string) {
    const current = await this.prisma.stockAdjust.findUnique({ where: { id } })
    if (!current) throw new BusinessException('库存调整单不存在', 4231)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(current.ownerOrgId || current.warehouseId)
    if (current.status !== 'PENDING_APPROVAL') {
      throw new BusinessException('仅审批中的调整单可以撤销', 4262)
    }
    await this.prisma.stockAdjust.update({ where: { id }, data: { status: 'CANCELLED' } })
    const row = await this.prisma.stockAdjust.findUniqueOrThrow({
      where: { id },
      include: adjustInclude,
    })
    const location = await this.locationService.nameMap([row.warehouseId])
    return this.toAdjustDto(
      row,
      hasPermission(admin.permissions, 'scm:stock:cost'),
      location.get(row.warehouseId)?.name,
    )
  }

  private toAdjustDto(
    row: Prisma.StockAdjustGetPayload<{ include: typeof adjustInclude }>,
    canSeeCost: boolean,
    warehouseName?: string,
  ) {
    return {
      id: row.id,
      warehouseId: row.warehouseId,
      warehouseName: warehouseName ?? row.warehouseId,
      ownerOrgId: row.ownerOrgId || row.warehouseId,
      reason: row.reason,
      remark: row.remark,
      totalAmount: canSeeCost ? money2(row.totalAmount) : 0,
      status: row.status,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      approvalId: row.approvalId,
      flowName: row.flowName,
      createdAt: row.createdAt,
      costVisible: canSeeCost,
      items: row.items.map((it) => ({
        productId: it.productId,
        name: it.name,
        unit: it.unit,
        beforeQty: qty3(it.beforeQty),
        afterQty: qty3(it.afterQty),
        diffQty: qty3(it.diffQty),
        price: canSeeCost ? money2(it.price) : 0,
      })),
    }
  }
}

/** 距到期日的自然日差，今天到期为 0、已过期取负值；无有效期返回 null */
function daysUntil(date: Date | null): number | null {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}
