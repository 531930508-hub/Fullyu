import { Injectable, Module } from '@nestjs/common'
import { Prisma, StockLedgerType } from '@prisma/client'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { qty3 } from './scm.util'

/** 事务客户端与普通客户端都能传进来，入库/调整都要求与单据同事务 */
type Tx = Prisma.TransactionClient | PrismaService

/** 入库时的批次信息：留空时按「默认批次 + 商品档案采购价」落账 */
export interface BatchInput {
  batchNo?: string
  productionDate?: Date | string | null
  expiryDate?: Date | string | null
  /** 不传则回落到商品档案采购价 */
  unitCost?: number
  /** 来源类型：RECEIPT / TRANSFER / PRODUCTION / ADJUST / OPENING */
  sourceType?: string
  sourceNo?: string
  /** 指定批次出库（一般不用，撤销类场景按 FIFO 扣即可） */
  batchId?: string
}

/** 一次出库按批次拆分的明细，调拨/委外要用它把批次带到目标地点 */
export interface BatchAllocation {
  batchId: string | null
  batchNo: string
  productionDate: Date | null
  expiryDate: Date | null
  qty: number
  unitCost: number
}

export interface MoveResult {
  qty: number
  allocations: BatchAllocation[]
  /** 本次变动的成本金额（元，6 位小数精度） */
  cost: number
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * 统一转成「UTC 零点的日期」再落 DATE 列。
 * MySQL DATE 只存年月日，但驱动会按 UTC 截取，若直接传本地时间可能整体提前一天。
 */
function toDate(value: Date | string | null | undefined): Date | null {
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

/**
 * 库存原子操作。
 *
 * 单独成模块是为了断开循环依赖：进销存要调审批发起单据，
 * 审批通过后又要回写库存 —— 让审批只依赖这里，双方就不会互相 import。
 *
 * 二期的批次账：
 * - 入库按「地点 + 商品 + 批号 + 效期」归批，同批多次入库按数量加权平均单位成本；
 * - 出库按效期先到期先出（FIFO），无有效期的批次排最后，再按创建时间；
 * - 流水按批次拆行，结存金额由批次余额 × 批次成本汇总，不再依赖档案采购价。
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 结存增减 + 记流水（含批次）。
   * @param qty 正数为增、负数为减
   * @param ownerOrgId 物权归属组织，行级数据范围按它过滤
   * @param batch 入库批次信息；出库只需忽略
   */
  async move(
    tx: Tx,
    input: {
      warehouseId: string
      ownerOrgId: string
      productId: string
      qty: number
      type: StockLedgerType
      ref?: string
      batch?: BatchInput
    },
  ): Promise<MoveResult> {
    const { warehouseId, ownerOrgId, productId, type } = input
    const qty = qty3(input.qty)
    if (!qty) return { qty, allocations: [], cost: 0 }
    if (!ownerOrgId) throw new BusinessException('库存变动缺少物权组织', 4232)
    const balance = await tx.stockBalance.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    })
    const next = qty3(Number(balance?.qty ?? 0) + qty)
    if (next < 0) {
      throw new BusinessException('库存不足，无法扣减', 4230)
    }
    if (balance) {
      await tx.stockBalance.update({
        where: { id: balance.id },
        data: { qty: next, ownerOrgId },
      })
    } else {
      await tx.stockBalance.create({ data: { warehouseId, ownerOrgId, productId, qty: next } })
    }

    const ref = input.ref ?? ''
    if (qty > 0) {
      const allocation = await this.inbound(tx, {
        warehouseId,
        ownerOrgId,
        productId,
        qty,
        ref,
        batch: input.batch ?? {},
      })
      return { qty, allocations: [allocation], cost: round6(allocation.qty * allocation.unitCost) }
    }
    return this.outbound(tx, {
      warehouseId,
      ownerOrgId,
      productId,
      type,
      qty: -qty,
      ref,
      batchId: input.batch?.batchId,
    })
  }

  /** 入库：按批号 + 效期归批，同批加权平均单位成本 */
  private async inbound(
    tx: Tx,
    input: {
      warehouseId: string
      ownerOrgId: string
      productId: string
      qty: number
      ref: string
      batch: BatchInput
    },
  ): Promise<BatchAllocation> {
    const { warehouseId, ownerOrgId, productId, qty, ref, batch } = input
    const batchNo = batch.batchNo?.trim() || '默认批次'
    const productionDate = toDate(batch.productionDate)
    const expiryDate = toDate(batch.expiryDate)
    const product = await tx.scmProduct.findUnique({
      where: { id: productId },
      select: { purchasePrice: true },
    })
    const unitCost = round6(Number(batch.unitCost ?? product?.purchasePrice ?? 0))

    const existing = await tx.scmStockBatch.findFirst({
      where: { warehouseId, productId, batchNo, productionDate, expiryDate },
    })
    if (existing) {
      const oldQty = Number(existing.qty)
      const newQty = qty3(oldQty + qty)
      const newCost =
        newQty > 0 ? round6((oldQty * Number(existing.unitCost) + qty * unitCost) / newQty) : unitCost
      await tx.scmStockBatch.update({
        where: { id: existing.id },
        data: {
          qty: newQty,
          unitCost: newCost,
          ownerOrgId,
          sourceType: batch.sourceType || existing.sourceType,
          sourceNo: batch.sourceNo || existing.sourceNo,
        },
      })
      await tx.stockLedger.create({
        data: { warehouseId, ownerOrgId, productId, type: 'IN', qty, batchNo, ref },
      })
      return {
        batchId: existing.id,
        batchNo,
        productionDate: existing.productionDate,
        expiryDate: existing.expiryDate,
        qty,
        unitCost: newCost,
      }
    }

    const created = await tx.scmStockBatch.create({
      data: {
        warehouseId,
        ownerOrgId,
        productId,
        batchNo,
        productionDate,
        expiryDate,
        qty,
        unitCost,
        sourceType: batch.sourceType ?? '',
        sourceNo: batch.sourceNo ?? '',
      },
    })
    await tx.stockLedger.create({
      data: { warehouseId, ownerOrgId, productId, type: 'IN', qty, batchNo, ref },
    })
    return {
      batchId: created.id,
      batchNo,
      productionDate,
      expiryDate,
      qty,
      unitCost,
    }
  }

  /** 出库：效期先到期先出，无有效期排最后；缺批次的老库存按档案价兜底 */
  private async outbound(
    tx: Tx,
    input: {
      warehouseId: string
      ownerOrgId: string
      productId: string
      type: StockLedgerType
      qty: number
      ref: string
      batchId?: string
    },
  ): Promise<MoveResult> {
    const { warehouseId, ownerOrgId, productId, type, qty, ref } = input
    const batches = await tx.scmStockBatch.findMany({
      where: {
        warehouseId,
        productId,
        qty: { gt: 0 },
        ...(input.batchId ? { id: input.batchId } : {}),
      },
    })
    batches.sort((a, b) => {
      const ae = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY
      const be = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY
      if (ae !== be) return ae - be
      return a.createdAt.getTime() - b.createdAt.getTime()
    })

    const allocations: BatchAllocation[] = []
    let remain = qty
    for (const batch of batches) {
      if (remain <= 0) break
      const available = Number(batch.qty)
      const take = qty3(Math.min(available, remain))
      if (take <= 0) continue
      await tx.scmStockBatch.update({
        where: { id: batch.id },
        data: { qty: qty3(available - take) },
      })
      await tx.stockLedger.create({
        data: { warehouseId, ownerOrgId, productId, type, qty: -take, batchNo: batch.batchNo, ref },
      })
      allocations.push({
        batchId: batch.id,
        batchNo: batch.batchNo,
        productionDate: batch.productionDate,
        expiryDate: batch.expiryDate,
        qty: take,
        unitCost: Number(batch.unitCost),
      })
      remain = qty3(remain - take)
    }

    // 账上有结存但批次没覆盖到（历史数据未补批次时）仍按账面出库，成本用档案价兜底
    if (remain > 0) {
      const product = await tx.scmProduct.findUnique({
        where: { id: productId },
        select: { purchasePrice: true },
      })
      const unitCost = round6(Number(product?.purchasePrice ?? 0))
      await tx.stockLedger.create({
        data: { warehouseId, ownerOrgId, productId, type, qty: -remain, batchNo: '', ref },
      })
      allocations.push({
        batchId: null,
        batchNo: '',
        productionDate: null,
        expiryDate: null,
        qty: remain,
        unitCost,
      })
      remain = 0
    }

    return {
      qty,
      allocations,
      cost: round6(allocations.reduce((sum, it) => sum + it.qty * it.unitCost, 0)),
    }
  }

  /**
   * 让库存调整单生效：按明细的差额写结存与流水，并把单据置为已生效。
   * 审批通过后调用；免审时提交即调用。
   */
  async applyAdjust(tx: Tx, adjustId: string) {
    const adjust = await tx.stockAdjust.findUnique({
      where: { id: adjustId },
      include: { items: true },
    })
    if (!adjust) throw new BusinessException('库存调整单不存在', 4231)
    if (adjust.status === 'EFFECTIVE') return adjust
    const ownerOrgId = adjust.ownerOrgId || adjust.warehouseId

    for (const item of adjust.items) {
      await this.move(tx, {
        warehouseId: adjust.warehouseId,
        ownerOrgId,
        productId: item.productId,
        qty: Number(item.diffQty),
        type: 'ADJUST',
        ref: adjust.id,
        batch: {
          batchNo: Number(item.diffQty) > 0 ? '盘盈' : undefined,
          sourceType: 'ADJUST',
          sourceNo: adjust.id,
        },
      })
    }
    return tx.stockAdjust.update({ where: { id: adjustId }, data: { status: 'EFFECTIVE' } })
  }

  /** 当前账面数，录调整单时用来抓 beforeQty 快照 */
  async qtyOf(warehouseId: string, productId: string): Promise<number> {
    const row = await this.prisma.stockBalance.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    })
    return qty3(row?.qty)
  }
}

@Module({
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
