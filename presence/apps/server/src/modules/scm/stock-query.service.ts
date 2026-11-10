import { Injectable } from '@nestjs/common'
import { Prisma, StockAdjustReason, StockAdjustStatus } from '@prisma/client'
import { ADJUST_REASON_NAMES, hasPermission, isBelowSafety, sumAdjustAmount } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { generateDocNo } from '../../common/doc-no.helper'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { ApprovalService } from '../approval/approval.service'
import { StockService } from './stock.service'

export interface CreateAdjustInput {
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
 * 调整单（盘盈盘亏/报损）同样走审批，通过后才真正写库存，
 * 免审时提交即生效 —— 生效动作统一由 StockService.applyAdjust 执行，
 * 保证走审批与不走审批两条路写出来的流水完全一致。
 */
@Injectable()
export class StockQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly approvalService: ApprovalService,
    private readonly stockService: StockService,
  ) {}

  // ===== 库存查询 =====

  /** 库存结存。金额列需要 scm:stock:cost 权限 */
  async balances(
    admin: AdminContext,
    query: { warehouseId?: string; keyword?: string; belowSafety?: boolean } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.StockBalanceWhereInput = { ...scope.toWhere('warehouseId') }
    if (query.warehouseId) {
      scope.assertWritable(query.warehouseId)
      where.warehouseId = query.warehouseId
    }
    if (query.keyword) {
      where.product = {
        OR: [{ name: { contains: query.keyword } }, { code: { contains: query.keyword } }],
      }
    }
    const rows = await this.prisma.stockBalance.findMany({
      where,
      orderBy: [{ warehouseId: 'asc' }, { productId: 'asc' }],
      include: { product: true },
    })
    const canSeeCost = hasPermission(admin.permissions, 'scm:stock:cost')
    const list = rows.map((row) => ({
      warehouseId: row.warehouseId,
      productId: row.productId,
      code: row.product.code,
      name: row.product.name,
      spec: row.product.spec,
      unit: row.product.unit,
      qty: row.qty,
      safetyStock: row.product.safetyStock,
      belowSafety: isBelowSafety(row.qty, row.product.safetyStock),
      /** 结存金额按供货价估算，无权限时抹成 0 */
      amount: canSeeCost ? Math.round(row.qty * Number(row.product.supplyPrice) * 100) / 100 : 0,
      costVisible: canSeeCost,
      updatedAt: row.updatedAt,
    }))
    return query.belowSafety ? list.filter((it) => it.belowSafety) : list
  }

  /** 出入库流水 */
  async ledgers(
    admin: AdminContext,
    query: { warehouseId?: string; productId?: string; limit?: number } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.StockLedgerWhereInput = { ...scope.toWhere('warehouseId') }
    if (query.warehouseId) {
      scope.assertWritable(query.warehouseId)
      where.warehouseId = query.warehouseId
    }
    if (query.productId) where.productId = query.productId
    const rows = await this.prisma.stockLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.limit) || 200, 500),
    })
    const products = await this.prisma.scmProduct.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.productId))] } },
      select: { id: true, name: true, unit: true },
    })
    const map = new Map(products.map((p) => [p.id, p]))
    return rows.map((row) => ({
      id: row.id,
      warehouseId: row.warehouseId,
      productId: row.productId,
      name: map.get(row.productId)?.name ?? row.productId,
      unit: map.get(row.productId)?.unit ?? '',
      type: row.type,
      qty: row.qty,
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
    const where: Prisma.StockAdjustWhereInput = { ...scope.toWhere('warehouseId') }
    if (query.warehouseId) {
      scope.assertWritable(query.warehouseId)
      where.warehouseId = query.warehouseId
    }
    if (query.status) where.status = query.status
    const rows = await this.prisma.stockAdjust.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: adjustInclude,
    })
    const canSeeCost = hasPermission(admin.permissions, 'scm:stock:cost')
    return rows.map((row) => this.toAdjustDto(row, canSeeCost))
  }

  async createAdjust(admin: AdminContext, input: CreateAdjustInput) {
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(input.warehouseId)
    const warehouse = await this.prisma.organization.findUnique({
      where: { id: input.warehouseId },
    })
    if (!warehouse) throw new BusinessException('仓库组织不存在', 4247)
    if (!warehouse.hasWarehouse) {
      throw new BusinessException(`${warehouse.shortName} 未开启独立仓库`, 4248)
    }

    const lines = (input.items ?? []).filter((it) => it.productId && it.afterQty !== undefined)
    if (!lines.length) throw new BusinessException('请至少添加一行调整明细', 4260)

    const products = await this.prisma.scmProduct.findMany({
      where: { id: { in: lines.map((it) => it.productId) } },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))
    const balances = await this.prisma.stockBalance.findMany({
      where: { warehouseId: input.warehouseId, productId: { in: lines.map((it) => it.productId) } },
    })
    const qtyMap = new Map(balances.map((b) => [b.productId, b.qty]))

    const items = lines.map((line) => {
      const product = productMap.get(line.productId)
      if (!product) throw new BusinessException('商品不存在或已删除', 4253)
      const beforeQty = qtyMap.get(line.productId) ?? 0
      const afterQty = Math.max(0, Math.floor(Number(line.afterQty) || 0))
      return {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        beforeQty,
        afterQty,
        diffQty: afterQty - beforeQty,
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
        warehouseId: input.warehouseId,
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
      summary: `库存调整 ${id}：${warehouse.shortName} ${ADJUST_REASON_NAMES[input.reason]} ${effective.length} 项，影响 ¥${totalAmount.toFixed(2)}`,
      amount: totalAmount,
      orgId: input.warehouseId,
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
    return this.toAdjustDto(row, hasPermission(admin.permissions, 'scm:stock:cost'))
  }

  /** 撤销：只能撤还在审批中的调整单 */
  async cancelAdjust(admin: AdminContext, id: string) {
    const current = await this.prisma.stockAdjust.findUnique({ where: { id } })
    if (!current) throw new BusinessException('库存调整单不存在', 4231)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(current.warehouseId)
    if (current.status !== 'PENDING_APPROVAL') {
      throw new BusinessException('仅审批中的调整单可以撤销', 4262)
    }
    await this.prisma.stockAdjust.update({ where: { id }, data: { status: 'CANCELLED' } })
    const row = await this.prisma.stockAdjust.findUniqueOrThrow({
      where: { id },
      include: adjustInclude,
    })
    return this.toAdjustDto(row, hasPermission(admin.permissions, 'scm:stock:cost'))
  }

  private toAdjustDto(
    row: Prisma.StockAdjustGetPayload<{ include: typeof adjustInclude }>,
    canSeeCost: boolean,
  ) {
    return {
      id: row.id,
      warehouseId: row.warehouseId,
      reason: row.reason,
      remark: row.remark,
      totalAmount: canSeeCost ? Number(row.totalAmount) : 0,
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
        beforeQty: it.beforeQty,
        afterQty: it.afterQty,
        diffQty: it.diffQty,
        price: canSeeCost ? Number(it.price) : 0,
      })),
    }
  }
}
