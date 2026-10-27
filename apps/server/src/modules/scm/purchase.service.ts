import { Injectable } from '@nestjs/common'
import { Prisma, PurchaseOrderStatus, PurchaseSupplierType } from '@prisma/client'
import { derivePoStatus, hasPermission, sumPurchaseAmount, PO_RECEIVABLE_STATUS } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { generateDocNo } from '../../common/doc-no.helper'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { ApprovalService } from '../approval/approval.service'
import { StockService } from './stock.service'

export interface PurchaseItemInput {
  productId: string
  qty: number
  /** 不传则按商品档案取价：向总部订货用供货价，对外采购用采购价 */
  price?: number
}

export interface CreatePurchaseOrderInput {
  buyerId: string
  supplierType: PurchaseSupplierType
  supplierId?: string | null
  remark?: string
  items: PurchaseItemInput[]
}

export interface CreateReceiptInput {
  poId: string
  /** 收货仓库，默认取采购方组织 */
  warehouseId?: string
  items: { productId: string; acceptQty: number; rejectQty?: number; reason?: string }[]
}

const orderInclude = { items: { orderBy: { name: 'asc' } } } satisfies Prisma.PurchaseOrderInclude

/**
 * 采购与验收入库。
 *
 * 采购单提交后先走审批（未命中流程则直接转待收货），
 * 验收入库可分批，收满才把单据置为已完成。
 */
@Injectable()
export class PurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly approvalService: ApprovalService,
    private readonly stockService: StockService,
  ) {}

  // ===== 采购订单 =====

  async list(
    admin: AdminContext,
    query: { status?: PurchaseOrderStatus; buyerId?: string; keyword?: string } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.PurchaseOrderWhereInput = { ...scope.toWhere('buyerId') }
    if (query.buyerId) {
      scope.assertWritable(query.buyerId)
      where.buyerId = query.buyerId
    }
    if (query.status) where.status = query.status
    if (query.keyword) {
      where.OR = [
        { id: { contains: query.keyword } },
        { supplierName: { contains: query.keyword } },
        { createdByName: { contains: query.keyword } },
      ]
    }
    const rows = await this.prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: orderInclude,
    })
    const buyers = await this.loadBuyers(rows.map((row) => row.buyerId))
    const canSeePrice = hasPermission(admin.permissions, 'scm:po:price')
    return rows.map((row) => this.toOrderDto(row, canSeePrice, buyers.get(row.buyerId)))
  }

  async detail(admin: AdminContext, id: string) {
    const row = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: orderInclude })
    if (!row) throw new BusinessException('采购单不存在', 4240)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(row.buyerId)
    const buyer = await this.prisma.organization.findUnique({ where: { id: row.buyerId } })
    return this.toOrderDto(row, hasPermission(admin.permissions, 'scm:po:price'), buyer)
  }

  async create(admin: AdminContext, input: CreatePurchaseOrderInput) {
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(input.buyerId)

    const buyer = await this.prisma.organization.findUnique({ where: { id: input.buyerId } })
    if (!buyer) throw new BusinessException('采购方组织不存在', 4241)
    if (!buyer.canPurchase) throw new BusinessException(`${buyer.shortName} 未开启采购权限`, 4242)
    this.assertSupplierRule(buyer, input.supplierType)

    const items = await this.buildItems(admin, input.items, input.supplierType, buyer.type)
    const totalAmount = sumPurchaseAmount(items)
    const supplierName = await this.resolveSupplierName(input.supplierType, input.supplierId)

    const id = await generateDocNo(this.redis, 'PO', async (no) => {
      return !!(await this.prisma.purchaseOrder.findUnique({ where: { id: no } }))
    })
    const operator = await this.operatorOf(admin)

    await this.prisma.purchaseOrder.create({
      data: {
        id,
        buyerId: input.buyerId,
        supplierType: input.supplierType,
        supplierId: input.supplierType === 'EXTERNAL' ? (input.supplierId ?? null) : null,
        supplierName,
        totalAmount,
        status: 'PENDING_APPROVAL',
        createdBy: operator.username,
        createdByName: operator.name,
        remark: input.remark ?? '',
        items: { create: items },
      },
      include: orderInclude,
    })

    // 挂审批：命中流程则等审批，未命中直接转待收货
    const approval = await this.approvalService.submit({
      bizType: 'PURCHASE_ORDER',
      bizId: id,
      summary: `采购单 ${id}：${buyer.shortName} 向 ${supplierName} 采购 ¥${totalAmount.toFixed(2)}`,
      amount: totalAmount,
      orgId: input.buyerId,
      requesterId: admin.adminId,
    })
    const row = await this.prisma.purchaseOrder.update({
      where: { id },
      data: approval
        ? { approvalId: approval.id, flowName: approval.flowName }
        : { status: 'APPROVED', flowName: '' },
      include: orderInclude,
    })
    return this.toOrderDto(row, hasPermission(admin.permissions, 'scm:po:price'), buyer)
  }

  /** 驳回后可改单重提；已在审批中或已收货的单不允许改 */
  async update(admin: AdminContext, id: string, input: CreatePurchaseOrderInput) {
    const current = await this.prisma.purchaseOrder.findUnique({ where: { id } })
    if (!current) throw new BusinessException('采购单不存在', 4240)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(current.buyerId)
    if (current.status !== 'REJECTED' && current.status !== 'CANCELLED') {
      throw new BusinessException('仅已驳回或已取消的采购单可以修改后重提', 4243)
    }

    const buyer = await this.prisma.organization.findUnique({ where: { id: current.buyerId } })
    if (!buyer) throw new BusinessException('采购方组织不存在', 4241)
    this.assertSupplierRule(buyer, input.supplierType)

    const items = await this.buildItems(admin, input.items, input.supplierType, buyer.type)
    const totalAmount = sumPurchaseAmount(items)
    const supplierName = await this.resolveSupplierName(input.supplierType, input.supplierId)

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({ where: { orderId: id } })
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierType: input.supplierType,
          supplierId: input.supplierType === 'EXTERNAL' ? (input.supplierId ?? null) : null,
          supplierName,
          totalAmount,
          status: 'PENDING_APPROVAL',
          approvalId: null,
          flowName: '',
          remark: input.remark ?? '',
          items: { create: items },
        },
      })
    })

    const approval = await this.approvalService.submit({
      bizType: 'PURCHASE_ORDER',
      bizId: id,
      summary: `采购单 ${id} 重新提交：¥${totalAmount.toFixed(2)}`,
      amount: totalAmount,
      orgId: current.buyerId,
      requesterId: admin.adminId,
    })
    const row = await this.prisma.purchaseOrder.update({
      where: { id },
      data: approval
        ? { approvalId: approval.id, flowName: approval.flowName }
        : { status: 'APPROVED', flowName: '' },
      include: orderInclude,
    })
    return this.toOrderDto(row, hasPermission(admin.permissions, 'scm:po:price'), buyer)
  }

  /** 作废：已入过货的单不能作废，否则库存与单据对不上 */
  async cancel(admin: AdminContext, id: string) {
    const current = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: orderInclude,
    })
    if (!current) throw new BusinessException('采购单不存在', 4240)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(current.buyerId)
    if (current.status === 'COMPLETED' || current.status === 'CANCELLED') {
      throw new BusinessException('该采购单已结束，无需作废', 4244)
    }
    if (current.items.some((it) => it.receivedQty > 0)) {
      throw new BusinessException('该采购单已有入库记录，不能作废', 4245)
    }
    const row = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: orderInclude,
    })
    const buyer = await this.prisma.organization.findUnique({ where: { id: row.buyerId } })
    return this.toOrderDto(row, hasPermission(admin.permissions, 'scm:po:price'), buyer)
  }

  // ===== 验收入库 =====

  /** 待收货的采购单：入库页的下拉数据源 */
  async receivableOrders(admin: AdminContext) {
    const scope = await buildOrgScope(this.prisma, admin)
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { ...scope.toWhere('buyerId'), status: { in: PO_RECEIVABLE_STATUS } },
      orderBy: { createdAt: 'asc' },
      include: orderInclude,
    })
    const buyers = await this.loadBuyers(rows.map((row) => row.buyerId))
    const canSeePrice = hasPermission(admin.permissions, 'scm:po:price')
    return rows.map((row) => this.toOrderDto(row, canSeePrice, buyers.get(row.buyerId)))
  }

  async listReceipts(admin: AdminContext, query: { poId?: string; warehouseId?: string } = {}) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.GoodsReceiptWhereInput = { ...scope.toWhere('warehouseId') }
    if (query.poId) where.poId = query.poId
    if (query.warehouseId) {
      scope.assertWritable(query.warehouseId)
      where.warehouseId = query.warehouseId
    }
    const rows = await this.prisma.goodsReceipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { items: true },
    })
    return rows
  }

  /**
   * 执行验收入库。整个过程一个事务：
   * 写验收单 → 累加已收数 → 增库存与流水 → 按累计收货量推采购单状态。
   */
  async createReceipt(admin: AdminContext, input: CreateReceiptInput) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: input.poId },
      include: orderInclude,
    })
    if (!po) throw new BusinessException('采购单不存在', 4240)
    if (!PO_RECEIVABLE_STATUS.includes(po.status)) {
      throw new BusinessException('该采购单当前状态不允许收货', 4246)
    }

    const warehouseId = input.warehouseId || po.buyerId
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(warehouseId)
    const warehouse = await this.prisma.organization.findUnique({ where: { id: warehouseId } })
    if (!warehouse) throw new BusinessException('收货仓库不存在', 4247)
    if (!warehouse.hasWarehouse) {
      throw new BusinessException(`${warehouse.shortName} 未开启独立仓库`, 4248)
    }

    const lines = (input.items ?? []).filter((it) => Number(it.acceptQty) > 0 || Number(it.rejectQty) > 0)
    if (!lines.length) throw new BusinessException('请填写本次验收数量', 4249)

    const itemMap = new Map(po.items.map((it) => [it.productId, it]))
    const receiptItems = lines.map((line) => {
      const poItem = itemMap.get(line.productId)
      if (!poItem) throw new BusinessException('存在采购单之外的商品', 4250)
      const acceptQty = Math.max(0, Math.floor(Number(line.acceptQty) || 0))
      const rejectQty = Math.max(0, Math.floor(Number(line.rejectQty) || 0))
      const remain = poItem.qty - poItem.receivedQty
      if (acceptQty > remain) {
        throw new BusinessException(`${poItem.name} 本次实收超出未收数量（剩余 ${remain}）`, 4251)
      }
      return {
        productId: line.productId,
        name: poItem.name,
        unit: poItem.unit,
        orderedQty: poItem.qty,
        acceptQty,
        rejectQty,
        reason: line.reason ?? '',
      }
    })

    const id = await generateDocNo(this.redis, 'GR', async (no) => {
      return !!(await this.prisma.goodsReceipt.findUnique({ where: { id: no } }))
    })
    const operator = await this.operatorOf(admin)

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          id,
          poId: po.id,
          warehouseId,
          hasDiff: receiptItems.some((it) => it.rejectQty > 0),
          operator: operator.username,
          operatorName: operator.name,
          items: { create: receiptItems },
        },
        include: { items: true },
      })

      for (const line of receiptItems) {
        if (line.acceptQty <= 0) continue
        const poItem = itemMap.get(line.productId)!
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQty: poItem.receivedQty + line.acceptQty },
        })
        await this.stockService.move(tx, {
          warehouseId,
          productId: line.productId,
          qty: line.acceptQty,
          type: 'IN',
          ref: receipt.id,
        })
      }

      const after = po.items.map((it) => {
        const line = receiptItems.find((l) => l.productId === it.productId)
        return { qty: it.qty, receivedQty: it.receivedQty + (line?.acceptQty ?? 0) }
      })
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: derivePoStatus(after) } })
      return receipt
    })
  }

  // ===== 内部工具 =====

  /**
   * 门店/分公司只能向总部采购；只有总部节点可以对外采购。
   */
  private assertSupplierRule(
    buyer: { type: string; shortName: string },
    supplierType: PurchaseSupplierType,
  ): void {
    if (supplierType !== 'HQ' && supplierType !== 'EXTERNAL') {
      throw new BusinessException('供货方类型不合法', 4255)
    }
    const isHqNode = buyer.type === 'GROUP' || buyer.type === 'DEPT'
    if (supplierType === 'EXTERNAL' && !isHqNode) {
      throw new BusinessException(`${buyer.shortName} 只能向总部统一采购，不能向外部供应商采购`, 4256)
    }
  }

  /**
   * 明细取价：
   * - 向总部采购：一律取商品档案供货价，忽略前端传价（门店只能改数量）；
   * - 总部对外采购：有 scm:po:price 可按实价录入，否则回落到档案采购价。
   */
  private async buildItems(
    admin: AdminContext,
    inputs: PurchaseItemInput[],
    supplierType: PurchaseSupplierType,
    buyerType: string,
  ) {
    const lines = (inputs ?? []).filter((it) => it.productId && Number(it.qty) > 0)
    if (!lines.length) throw new BusinessException('请至少添加一行采购明细', 4252)
    const products = await this.prisma.scmProduct.findMany({
      where: { id: { in: lines.map((it) => it.productId) } },
    })
    const map = new Map(products.map((p) => [p.id, p]))
    const isHqNode = buyerType === 'GROUP' || buyerType === 'DEPT'
    const canOverridePrice =
      isHqNode &&
      supplierType === 'EXTERNAL' &&
      hasPermission(admin.permissions, 'scm:po:price')

    return lines.map((line) => {
      const product = map.get(line.productId)
      if (!product) throw new BusinessException('商品不存在或已删除', 4253)
      const basePrice = Number(
        supplierType === 'HQ' ? product.supplyPrice : product.purchasePrice,
      )
      // 门店向总部采购时，即使持有价格权限也不允许改单价
      const price =
        canOverridePrice && line.price !== undefined && Number(line.price) >= 0
          ? Number(line.price)
          : basePrice
      return {
        productId: product.id,
        name: product.name,
        spec: product.spec,
        unit: product.unit,
        price,
        qty: Math.floor(Number(line.qty)),
        receivedQty: 0,
      }
    })
  }

  private async resolveSupplierName(type: PurchaseSupplierType, supplierId?: string | null) {
    if (type === 'HQ') return '总部'
    if (!supplierId) throw new BusinessException('请选择供应商', 4254)
    const supplier = await this.prisma.scmSupplier.findUnique({ where: { id: supplierId } })
    if (!supplier) throw new BusinessException('供应商不存在', 4224)
    return supplier.name
  }

  private async operatorOf(admin: AdminContext) {
    const row = await this.prisma.adminUser.findUnique({
      where: { id: admin.adminId },
      select: { username: true, name: true },
    })
    return { username: row?.username ?? admin.username, name: row?.name ?? '' }
  }

  /**
   * 出参裁剪：无 scm:po:price 权限时把单价与金额抹成 0，
   * 门店只看得到数量，看不到总部的进货价。
   */
  private async loadBuyers(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return new Map<string, { name: string; type: string }>()
    const rows = await this.prisma.organization.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, type: true },
    })
    return new Map(rows.map((row) => [row.id, { name: row.name, type: row.type }]))
  }

  /**
   * 出参裁剪：
   * - 向总部采购的供货单，采购方本来就要付这笔钱，单价/金额直接可见；
   * - 对外采购单仍按 scm:po:price 裁剪，避免门店看到总部进货价。
   */
  private toOrderDto(
    row: Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>,
    canSeePrice: boolean,
    buyer?: { name: string; type: string } | null,
  ) {
    const priceVisible = canSeePrice || row.supplierType === 'HQ'
    return {
      id: row.id,
      buyerId: row.buyerId,
      buyerName: buyer?.name ?? row.buyerId,
      buyerType: buyer?.type ?? null,
      supplierType: row.supplierType,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      totalAmount: priceVisible ? Number(row.totalAmount) : 0,
      status: row.status,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      remark: row.remark,
      approvalId: row.approvalId,
      flowName: row.flowName,
      createdAt: row.createdAt,
      priceVisible,
      items: row.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        name: it.name,
        spec: it.spec,
        unit: it.unit,
        price: priceVisible ? Number(it.price) : 0,
        amount: priceVisible ? Number(it.price) * it.qty : 0,
        qty: it.qty,
        receivedQty: it.receivedQty,
      })),
    }
  }
}
