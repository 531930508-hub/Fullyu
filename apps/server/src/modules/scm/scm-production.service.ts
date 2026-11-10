import { Injectable } from '@nestjs/common'
import { Prisma, ScmProductionStatus } from '@prisma/client'
import { hasPermission } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { generateDocNo } from '../../common/doc-no.helper'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { StockService } from './stock.service'
import { ScmLocationService } from './scm-location.service'
import { ScmBomService } from './scm-bom.service'
import { ScmPriceService } from './scm-price.service'
import { money2, qty3 } from './scm.util'

export interface CreateProductionInput {
  productId: string
  plannedQty: number
  /** 领料来源地点（自有仓或供应商处存货点） */
  sourceLocationId: string
  /** 成品入库地点，必须是自有仓 */
  outputLocationId: string
  /** 委外时填代工厂地点；为空表示自产 */
  factoryLocationId?: string | null
  batchNo?: string
  productionDate?: string | null
  expiryDate?: string | null
  /** 代工厂加工费（元） */
  processingFee?: number
  remark?: string
}

export interface CompleteProductionInput {
  /** 实际完工入库量，默认按计划量 */
  outputQty?: number
  batchNo?: string
  productionDate?: string | null
  expiryDate?: string | null
  remark?: string
}

const productionInclude = {
  items: { orderBy: { name: 'asc' } },
} satisfies Prisma.ScmProductionOrderInclude

/**
 * 生产 / 委外工单。
 *
 * 一期流转：待领料（APPROVED）→ 领料（ISSUED）→ 完工入库（COMPLETED）。
 * - 自产：领料时直接把材料从来源地点扣掉；
 * - 委外：领料时把材料调拨到代工厂地点，完工时在代工厂核销，成品入自有仓。
 * 成本按组件采购价快照 + 加工费归集，落成单位成本，供后续毛利分析。
 * 一期不做工单审批：创建即待领料，避免与审批引擎互相调用。
 */
@Injectable()
export class ScmProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly stockService: StockService,
    private readonly locationService: ScmLocationService,
    private readonly bomService: ScmBomService,
    private readonly priceService: ScmPriceService,
  ) {}

  async list(
    admin: AdminContext,
    query: { status?: ScmProductionStatus; keyword?: string; limit?: number } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.ScmProductionOrderWhereInput = { ...scope.toWhere('orgId') }
    if (query.status) where.status = query.status
    if (query.keyword) {
      where.OR = [
        { id: { contains: query.keyword } },
        { productName: { contains: query.keyword } },
        { batchNo: { contains: query.keyword } },
      ]
    }
    const rows = await this.prisma.scmProductionOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.limit) || 200, 500),
      include: productionInclude,
    })
    return this.toDtos(rows, hasPermission(admin.permissions, 'scm:po:price'))
  }

  async detail(admin: AdminContext, id: string) {
    const row = await this.prisma.scmProductionOrder.findUnique({
      where: { id },
      include: productionInclude,
    })
    if (!row) throw new BusinessException('生产工单不存在', 4300)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(row.orgId)
    const [dto] = await this.toDtos([row], hasPermission(admin.permissions, 'scm:po:price'))
    return dto
  }

  async create(admin: AdminContext, input: CreateProductionInput) {
    const plannedQty = qty3(input.plannedQty)
    if (plannedQty <= 0) throw new BusinessException('计划产量必须大于 0', 4301)

    const product = await this.prisma.scmProduct.findUnique({ where: { id: input.productId } })
    if (!product) throw new BusinessException('成品不存在', 4253)

    const bom = await this.bomService.activeFor(product.id)
    if (!bom) throw new BusinessException('该成品还没有生效的 BOM，请先维护配方', 4302)
    if (!bom.items.length) throw new BusinessException('BOM 没有组件明细', 4303)

    const source = await this.locationService.resolveLocation(input.sourceLocationId)
    const orgId = this.locationService.ownerOf(source)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(orgId)

    const output = await this.locationService.resolveLocation(input.outputLocationId)
    if (output.type !== 'OWN') {
      throw new BusinessException('成品必须入自有仓，不能直接入供应商或代工厂地点', 4304)
    }
    if (this.locationService.ownerOf(output) !== orgId) {
      throw new BusinessException('成品入库仓与物权组织不一致，请先用调拨转移物权', 4305)
    }

    let factoryId: string | null = null
    if (input.factoryLocationId) {
      const factory = await this.locationService.resolveLocation(input.factoryLocationId)
      if (factory.type !== 'FACTORY') {
        throw new BusinessException('委外加工地点必须是代工厂类型', 4306)
      }
      if (this.locationService.ownerOf(factory) !== orgId) {
        throw new BusinessException('代工厂地点的物权组织须与材料物权一致', 4307)
      }
      factoryId = factory.id
    }

    const components = await this.prisma.scmProduct.findMany({
      where: { id: { in: bom.items.map((it) => it.componentId) } },
    })
    const componentMap = new Map(components.map((c) => [c.id, c]))
    // 快照用最近一次采购成交价，避免档案价长期未更新导致成本失真
    const latestPrices = await this.priceService.latestPriceMap(
      this.prisma,
      bom.items.map((it) => it.componentId),
    )

    const items = bom.items.map((it) => {
      const component = componentMap.get(it.componentId)
      if (!component) throw new BusinessException(`组件 ${it.name} 已不存在`, 4308)
      const qtyPerUnit = Number(it.qtyPerUnit)
      const lossRate = Number(it.lossRate)
      const requiredQty = qty3(plannedQty * qtyPerUnit * (1 + lossRate))
      const unitPrice = latestPrices.get(component.id) ?? Number(component.purchasePrice)
      return {
        componentId: it.componentId,
        name: it.name,
        spec: it.spec,
        unit: it.unit,
        qtyPerUnit,
        lossRate,
        requiredQty,
        issuedQty: 0,
        unitPrice,
        amount: money2(requiredQty * unitPrice),
      }
    })
    const materialCost = money2(items.reduce((s, it) => s + it.amount, 0))
    const processingFee = money2(input.processingFee)
    const totalCost = money2(materialCost + processingFee)
    const unitCost = Math.round((totalCost / plannedQty) * 1e6) / 1e6

    const id = await generateDocNo(this.redis, 'MO', async (no) => {
      return !!(await this.prisma.scmProductionOrder.findUnique({ where: { id: no } }))
    })
    const operator = await this.operatorOf(admin)

    const row = await this.prisma.scmProductionOrder.create({
      data: {
        id,
        orgId,
        productId: product.id,
        productName: product.name,
        productSpec: product.spec,
        productUnit: product.unit,
        bomVersion: bom.version,
        plannedQty,
        outputQty: 0,
        sourceLocationId: source.id,
        outputLocationId: output.id,
        factoryLocationId: factoryId,
        status: 'APPROVED',
        batchNo: input.batchNo ?? '',
        productionDate: toDate(input.productionDate),
        expiryDate: toDate(input.expiryDate),
        processingFee,
        materialCost,
        totalCost,
        unitCost,
        remark: input.remark ?? '',
        createdBy: operator.username,
        createdByName: operator.name,
        items: { create: items },
      },
      include: productionInclude,
    })
    const [dto] = await this.toDtos([row], hasPermission(admin.permissions, 'scm:po:price'))
    return dto
  }

  /**
   * 领料/发料：按快照应领量走账。
   * 自产直接消耗在来源地点；委外先调拨到代工厂地点，材料物权仍不变。
   */
  async issue(admin: AdminContext, id: string) {
    const row = await this.prisma.scmProductionOrder.findUnique({
      where: { id },
      include: productionInclude,
    })
    if (!row) throw new BusinessException('生产工单不存在', 4300)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(row.orgId)
    if (row.status !== 'APPROVED') {
      throw new BusinessException('只有待领料的工单可以领料', 4309)
    }
    if (!row.items.length) throw new BusinessException('工单没有领料明细', 4310)

    await this.prisma.$transaction(async (tx) => {
      let materialCost = 0
      for (const item of row.items) {
        const qty = qty3(item.requiredQty)
        if (qty <= 0) continue
        const out = await this.stockService.move(tx, {
          warehouseId: row.sourceLocationId,
          ownerOrgId: row.orgId,
          productId: item.componentId,
          qty: -qty,
          type: 'OUT',
          ref: row.id,
        })
        if (row.factoryLocationId && row.factoryLocationId !== row.sourceLocationId) {
          // 委外领料只是换存放地点，按实际扣减的批次原样带到代工厂
          for (const alloc of out.allocations) {
            await this.stockService.move(tx, {
              warehouseId: row.factoryLocationId,
              ownerOrgId: row.orgId,
              productId: item.componentId,
              qty: alloc.qty,
              type: 'IN',
              ref: row.id,
              batch: {
                batchNo: alloc.batchNo,
                productionDate: alloc.productionDate,
                expiryDate: alloc.expiryDate,
                unitCost: alloc.unitCost,
                sourceType: 'PRODUCTION',
                sourceNo: row.id,
              },
            })
          }
        }
        // 按 FIFO 实际批次成本回写领料单价，材料成本随批次浮动
        materialCost += out.cost
        await tx.scmProductionItem.update({
          where: { id: item.id },
          data: {
            issuedQty: qty,
            unitPrice: Math.round((out.cost / qty) * 1e6) / 1e6,
            amount: money2(out.cost),
          },
        })
      }
      const totalCost = money2(materialCost + Number(row.processingFee))
      await tx.scmProductionOrder.update({
        where: { id },
        data: {
          status: 'ISSUED',
          materialCost: money2(materialCost),
          totalCost,
          unitCost: Math.round((totalCost / Math.max(qty3(row.plannedQty), 0.001)) * 1e6) / 1e6,
        },
      })
    })

    const after = await this.prisma.scmProductionOrder.findUniqueOrThrow({
      where: { id },
      include: productionInclude,
    })
    const [dto] = await this.toDtos([after], hasPermission(admin.permissions, 'scm:po:price'))
    return dto
  }

  /** 完工入库：委外先在代工厂核销材料，再把成品入自有仓 */
  async complete(admin: AdminContext, id: string, input: CompleteProductionInput = {}) {
    const row = await this.prisma.scmProductionOrder.findUnique({
      where: { id },
      include: productionInclude,
    })
    if (!row) throw new BusinessException('生产工单不存在', 4300)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(row.orgId)
    if (row.status !== 'ISSUED') {
      throw new BusinessException('只有已领料的工单可以完工入库', 4311)
    }

    const outputQty = input.outputQty === undefined ? qty3(row.plannedQty) : qty3(input.outputQty)
    if (outputQty <= 0) throw new BusinessException('完工数量必须大于 0', 4312)

    const product = await this.prisma.scmProduct.findUnique({
      where: { id: row.productId },
      select: { shelfLifeDays: true },
    })
    // 生产日期缺省按完工日，保证有保质期的成品能自动算出到期日
    const productionDate = toDate(input.productionDate) ?? row.productionDate ?? toDate(new Date())
    const batchNo = input.batchNo?.trim() || row.batchNo || row.id
    // 到期日优先级：本次填写 > 工单建档 > 生产日期 + 商品保质期
    let expiryDate = toDate(input.expiryDate) ?? row.expiryDate
    if (!expiryDate && productionDate && product?.shelfLifeDays) {
      expiryDate = addDays(productionDate, product.shelfLifeDays)
    }
    const unitCost = Math.round((Number(row.totalCost) / outputQty) * 1e6) / 1e6

    await this.prisma.$transaction(async (tx) => {
      if (row.factoryLocationId) {
        for (const item of row.items) {
          const qty = qty3(item.issuedQty)
          if (qty <= 0) continue
          await this.stockService.move(tx, {
            warehouseId: row.factoryLocationId,
            ownerOrgId: row.orgId,
            productId: item.componentId,
            qty: -qty,
            type: 'OUT',
            ref: row.id,
          })
        }
      }
      await this.stockService.move(tx, {
        warehouseId: row.outputLocationId,
        ownerOrgId: row.orgId,
        productId: row.productId,
        qty: outputQty,
        type: 'IN',
        ref: row.id,
        batch: {
          batchNo,
          productionDate,
          expiryDate,
          unitCost,
          sourceType: 'PRODUCTION',
          sourceNo: row.id,
        },
      })
      await tx.scmProductionOrder.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          outputQty,
          unitCost,
          batchNo,
          productionDate,
          expiryDate,
          remark: input.remark ?? row.remark,
        },
      })
    })

    const after = await this.prisma.scmProductionOrder.findUniqueOrThrow({
      where: { id },
      include: productionInclude,
    })
    const [dto] = await this.toDtos([after], hasPermission(admin.permissions, 'scm:po:price'))
    return dto
  }

  /** 取消：只允许还没领料的工单，领过料的要走库存调整处理损耗 */
  async cancel(admin: AdminContext, id: string) {
    const row = await this.prisma.scmProductionOrder.findUnique({ where: { id } })
    if (!row) throw new BusinessException('生产工单不存在', 4300)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(row.orgId)
    if (row.status !== 'APPROVED') {
      throw new BusinessException('已领料或已完工的工单不能取消', 4313)
    }
    await this.prisma.scmProductionOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })
    const after = await this.prisma.scmProductionOrder.findUniqueOrThrow({
      where: { id },
      include: productionInclude,
    })
    const [dto] = await this.toDtos([after], hasPermission(admin.permissions, 'scm:po:price'))
    return dto
  }

  private async operatorOf(admin: AdminContext) {
    const operator = await this.prisma.adminUser.findUnique({
      where: { id: admin.adminId },
      select: { username: true, name: true },
    })
    return { username: operator?.username ?? admin.username, name: operator?.name ?? '' }
  }

  private async toDtos(
    rows: Prisma.ScmProductionOrderGetPayload<{ include: typeof productionInclude }>[],
    canSeeCost: boolean,
  ) {
    const locations = await this.locationService.nameMap(
      rows.flatMap((row) => [row.sourceLocationId, row.outputLocationId, row.factoryLocationId]),
    )
    return rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      productId: row.productId,
      productName: row.productName,
      productSpec: row.productSpec,
      productUnit: row.productUnit,
      bomVersion: row.bomVersion,
      plannedQty: qty3(row.plannedQty),
      outputQty: qty3(row.outputQty),
      sourceLocationId: row.sourceLocationId,
      sourceLocationName: locations.get(row.sourceLocationId)?.name ?? row.sourceLocationId,
      outputLocationId: row.outputLocationId,
      outputLocationName: locations.get(row.outputLocationId)?.name ?? row.outputLocationId,
      factoryLocationId: row.factoryLocationId,
      factoryLocationName: row.factoryLocationId
        ? locations.get(row.factoryLocationId)?.name ?? row.factoryLocationId
        : '',
      mode: row.factoryLocationId ? 'OUTSOURCE' : 'SELF',
      status: row.status,
      batchNo: row.batchNo,
      productionDate: row.productionDate,
      expiryDate: row.expiryDate,
      processingFee: canSeeCost ? money2(row.processingFee) : 0,
      materialCost: canSeeCost ? money2(row.materialCost) : 0,
      totalCost: canSeeCost ? money2(row.totalCost) : 0,
      unitCost: canSeeCost ? Math.round(Number(row.unitCost) * 1e6) / 1e6 : 0,
      costVisible: canSeeCost,
      remark: row.remark,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      createdAt: row.createdAt,
      items: row.items.map((it) => ({
        componentId: it.componentId,
        name: it.name,
        spec: it.spec,
        unit: it.unit,
        qtyPerUnit: Math.round(Number(it.qtyPerUnit) * 1e6) / 1e6,
        lossRate: Number(it.lossRate),
        requiredQty: qty3(it.requiredQty),
        issuedQty: qty3(it.issuedQty),
        unitPrice: canSeeCost ? Math.round(Number(it.unitPrice) * 1e6) / 1e6 : 0,
        amount: canSeeCost ? money2(it.amount) : 0,
      })),
    }))
  }
}

/** DATE 列统一落在 UTC 零点，避免本地时间被驱动截成前一天 */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const matched =
    typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  if (matched) {
    return new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])))
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

function addDays(base: Date, days: number): Date {
  const date = new Date(base)
  date.setUTCDate(date.getUTCDate() + days)
  return date
}
