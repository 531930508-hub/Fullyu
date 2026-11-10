import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { money2 } from './scm.util'

type Tx = Prisma.TransactionClient | PrismaService

export interface CreatePriceInput {
  supplierId?: string | null
  price: number
  /** 生效日期，默认今天 */
  effectiveFrom?: string | null
  remark?: string
}

const priceInclude = { supplier: { select: { name: true } } } satisfies Prisma.ScmPurchasePriceInclude

function toDateOnly(value?: string | null): Date {
  if (!value) {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new BusinessException('生效日期不合法', 4321)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * 采购价历史。
 *
 * 同一商品不同供应商、不同时期的价格分开记：
 * - 外部验收入库时自动落一条（source = RECEIPT）；
 * - 也可以手工补录/调价（source = MANUAL）。
 * 新建采购单与生产工单取「最近一条已生效价格」做默认值，
 * 商品档案里的采购价仍作为没有历史价时的兜底。
 */
@Injectable()
export class ScmPriceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(productId: string) {
    const product = await this.prisma.scmProduct.findUnique({
      where: { id: productId },
      select: { id: true, name: true, unit: true, purchasePrice: true },
    })
    if (!product) throw new BusinessException('商品不存在', 4222)
    const rows = await this.prisma.scmPurchasePrice.findMany({
      where: { productId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: priceInclude,
    })
    return {
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      archivePrice: money2(product.purchasePrice),
      rows: rows.map((row) => this.toDto(row)),
    }
  }

  async create(productId: string, input: CreatePriceInput, operator: string) {
    const product = await this.prisma.scmProduct.findUnique({ where: { id: productId } })
    if (!product) throw new BusinessException('商品不存在', 4222)
    const price = money2(input.price)
    if (!Number.isFinite(price) || price < 0) {
      throw new BusinessException('采购单价格式不正确', 4322)
    }
    if (input.supplierId) {
      const supplier = await this.prisma.scmSupplier.findUnique({ where: { id: input.supplierId } })
      if (!supplier) throw new BusinessException('供应商不存在', 4224)
    }
    const row = await this.prisma.scmPurchasePrice.create({
      data: {
        productId,
        supplierId: input.supplierId || null,
        price,
        effectiveFrom: toDateOnly(input.effectiveFrom),
        source: 'MANUAL',
        remark: input.remark ?? '',
        createdBy: operator,
      },
      include: priceInclude,
    })
    return this.toDto(row)
  }

  /** 最近一条已生效价格；没有历史价返回 null，由调用方回落到档案价 */
  async latestPrice(tx: Tx, productId: string): Promise<number | null> {
    const row = await tx.scmPurchasePrice.findFirst({
      where: { productId, effectiveFrom: { lte: new Date() } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    })
    return row ? Number(row.price) : null
  }

  /** 批量取最近价，避免列表页 N+1 */
  async latestPriceMap(tx: Tx, productIds: string[]): Promise<Map<string, number>> {
    const ids = [...new Set(productIds.filter(Boolean))]
    if (!ids.length) return new Map()
    const rows = await tx.scmPurchasePrice.findMany({
      where: { productId: { in: ids }, effectiveFrom: { lte: new Date() } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    })
    const map = new Map<string, number>()
    for (const row of rows) {
      if (!map.has(row.productId)) map.set(row.productId, Number(row.price))
    }
    return map
  }

  /** 外部供应商验收入库时自动记录一条价格历史（同事务） */
  async recordReceipt(
    tx: Tx,
    input: { productId: string; supplierId?: string | null; price: number; ref?: string },
  ) {
    const price = money2(input.price)
    if (!(price > 0)) return null
    return tx.scmPurchasePrice.create({
      data: {
        productId: input.productId,
        supplierId: input.supplierId || null,
        price,
        effectiveFrom: toDateOnly(null),
        source: 'RECEIPT',
        ref: input.ref ?? '',
      },
    })
  }

  private toDto(row: Prisma.ScmPurchasePriceGetPayload<{ include: typeof priceInclude }>) {
    return {
      id: row.id,
      productId: row.productId,
      supplierId: row.supplierId,
      supplierName: row.supplier?.name ?? '',
      price: money2(row.price),
      effectiveFrom: row.effectiveFrom,
      source: row.source,
      ref: row.ref,
      remark: row.remark,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    }
  }
}
