import { Injectable, Module } from '@nestjs/common'
import { Prisma, StockLedgerType } from '@prisma/client'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

/** 事务客户端与普通客户端都能传进来，入库/调整都要求与单据同事务 */
type Tx = Prisma.TransactionClient | PrismaService

/**
 * 库存原子操作。
 *
 * 单独成模块是为了断开循环依赖：进销存要调审批发起单据，
 * 审批通过后又要回写库存 —— 让审批只依赖这里，双方就不会互相 import。
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 结存增减 + 记一条流水。
   * @param qty 正数为增、负数为减
   */
  async move(
    tx: Tx,
    input: {
      warehouseId: string
      productId: string
      qty: number
      type: StockLedgerType
      ref?: string
    },
  ) {
    const { warehouseId, productId, qty, type } = input
    if (!qty) return
    const balance = await tx.stockBalance.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    })
    const next = (balance?.qty ?? 0) + qty
    if (next < 0) {
      throw new BusinessException('库存不足，无法扣减', 4230)
    }
    if (balance) {
      await tx.stockBalance.update({ where: { id: balance.id }, data: { qty: next } })
    } else {
      await tx.stockBalance.create({ data: { warehouseId, productId, qty: next } })
    }
    await tx.stockLedger.create({
      data: { warehouseId, productId, type, qty, ref: input.ref ?? '' },
    })
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

    for (const item of adjust.items) {
      await this.move(tx, {
        warehouseId: adjust.warehouseId,
        productId: item.productId,
        qty: item.diffQty,
        type: 'ADJUST',
        ref: adjust.id,
      })
    }
    return tx.stockAdjust.update({ where: { id: adjustId }, data: { status: 'EFFECTIVE' } })
  }

  /** 当前账面数，录调整单时用来抓 beforeQty 快照 */
  async qtyOf(warehouseId: string, productId: string): Promise<number> {
    const row = await this.prisma.stockBalance.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    })
    return row?.qty ?? 0
  }
}

@Module({
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
