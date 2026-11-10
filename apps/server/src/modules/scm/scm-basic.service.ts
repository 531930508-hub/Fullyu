import { Injectable } from '@nestjs/common'
import { Prisma, ScmProductType } from '@prisma/client'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ScmPriceService } from './scm-price.service'

const PRODUCT_TYPES: ScmProductType[] = ['RAW', 'PACK', 'SEMI', 'FINISHED', 'CONSUMABLE']

interface UpsertProductInput {
  code: string
  name: string
  type?: ScmProductType
  spec?: string
  unit?: string
  purchasePrice?: number
  supplyPrice?: number
  safetyStock?: number
  /** 保质期天数，0 表示不管理效期 */
  shelfLifeDays?: number
  enabled?: boolean
  remark?: string
}

interface UpsertSupplierInput {
  name: string
  contact?: string
  phone?: string
  /** 是否代工厂：只有代工厂可以被建成 FACTORY 类型的库存地点 */
  isProcessor?: boolean
  enabled?: boolean
  remark?: string
}

/**
 * 进销存基础档案：商品与供应商。
 *
 * 商品与小程序侧的 Material 是两回事 —— 后者是课程用料、按积分消耗，
 * 这里的是耗材商品，带采购价、供货价与安全库存。
 */
@Injectable()
export class ScmBasicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceService: ScmPriceService,
  ) {}

  // ===== 商品 =====

  async listProducts(
    query: { keyword?: string; enabled?: boolean; type?: ScmProductType } = {},
    canSeePurchasePrice = false,
  ) {
    const where: Prisma.ScmProductWhereInput = {}
    if (query.enabled !== undefined) where.enabled = query.enabled
    if (query.type) where.type = query.type
    if (query.keyword) {
      where.OR = [{ name: { contains: query.keyword } }, { code: { contains: query.keyword } }]
    }
    const rows = await this.prisma.scmProduct.findMany({
      where,
      orderBy: [{ code: 'asc' }],
    })
    const latestPrices = canSeePurchasePrice
      ? await this.priceService.latestPriceMap(
          this.prisma,
          rows.map((row) => row.id),
        )
      : new Map<string, number>()
    return rows.map((row) =>
      this.toProductDto(row, canSeePurchasePrice, latestPrices.get(row.id)),
    )
  }

  async createProduct(input: UpsertProductInput, canSeePurchasePrice = true) {
    const code = input.code?.trim().toUpperCase()
    if (!code) throw new BusinessException('商品编码不能为空', 4220)
    if (!input.name?.trim()) throw new BusinessException('商品名称不能为空', 4225)
    this.assertProductType(input.type)
    const taken = await this.prisma.scmProduct.findUnique({ where: { code } })
    if (taken) throw new BusinessException('商品编码已存在', 4221)
    const row = await this.prisma.scmProduct.create({
      data: {
        ...this.productData(input, canSeePurchasePrice),
        code,
        name: input.name.trim(),
        type: input.type ?? 'CONSUMABLE',
      },
    })
    return this.toProductDto(row, canSeePurchasePrice)
  }

  async updateProduct(
    id: string,
    input: Partial<UpsertProductInput>,
    canSeePurchasePrice = true,
  ) {
    const current = await this.prisma.scmProduct.findUnique({ where: { id } })
    if (!current) throw new BusinessException('商品不存在', 4222)
    this.assertProductType(input.type)
    if (input.code && input.code.trim().toUpperCase() !== current.code) {
      const taken = await this.prisma.scmProduct.findUnique({
        where: { code: input.code.trim().toUpperCase() },
      })
      if (taken) throw new BusinessException('商品编码已存在', 4221)
    }
    const row = await this.prisma.scmProduct.update({
      where: { id },
      data: {
        ...this.productData(input, canSeePurchasePrice),
        type: input.type,
        code: input.code ? input.code.trim().toUpperCase() : undefined,
      },
    })
    return this.toProductDto(row, canSeePurchasePrice)
  }

  /**
   * 停用而非删除：已开出的采购单与库存流水都引用商品，
   * 删掉会让历史单据显示不出名字。
   */
  async toggleProduct(id: string, enabled: boolean, canSeePurchasePrice = true) {
    await this.prisma.scmProduct.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new BusinessException('商品不存在', 4222)
    })
    const row = await this.prisma.scmProduct.update({ where: { id }, data: { enabled } })
    return this.toProductDto(row, canSeePurchasePrice)
  }

  // ===== 供应商 =====

  async listSuppliers(query: { keyword?: string; enabled?: boolean } = {}) {
    const where: Prisma.ScmSupplierWhereInput = {}
    if (query.enabled !== undefined) where.enabled = query.enabled
    if (query.keyword) where.name = { contains: query.keyword }
    return this.prisma.scmSupplier.findMany({ where, orderBy: { createdAt: 'asc' } })
  }

  async createSupplier(input: UpsertSupplierInput) {
    if (!input.name?.trim()) throw new BusinessException('供应商名称不能为空', 4223)
    return this.prisma.scmSupplier.create({
      data: {
        name: input.name.trim(),
        contact: input.contact ?? '',
        phone: input.phone ?? '',
        isProcessor: !!input.isProcessor,
        enabled: input.enabled ?? true,
        remark: input.remark ?? '',
      },
    })
  }

  async updateSupplier(id: string, input: Partial<UpsertSupplierInput>) {
    const current = await this.prisma.scmSupplier.findUnique({ where: { id } })
    if (!current) throw new BusinessException('供应商不存在', 4224)
    return this.prisma.scmSupplier.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        contact: input.contact,
        phone: input.phone,
        isProcessor: input.isProcessor,
        enabled: input.enabled,
        remark: input.remark,
      },
    })
  }

  // ===== 内部工具 =====

  private assertProductType(type?: ScmProductType) {
    if (type !== undefined && !PRODUCT_TYPES.includes(type)) {
      throw new BusinessException('商品类型不合法', 4226)
    }
  }

  /** 无价格权限时忽略前端传的采购价，避免把总部维护的价格覆盖成 0 */
  private productData(input: Partial<UpsertProductInput>, canSeePurchasePrice = true) {
    return {
      name: input.name,
      spec: input.spec,
      unit: input.unit,
      purchasePrice: canSeePurchasePrice ? input.purchasePrice : undefined,
      supplyPrice: input.supplyPrice,
      safetyStock: input.safetyStock,
      shelfLifeDays: input.shelfLifeDays === undefined ? undefined : Math.max(0, Math.round(Number(input.shelfLifeDays))),
      enabled: input.enabled,
      remark: input.remark,
    }
  }

  /**
   * Decimal 出参统一转 number。
   * 无 scm:po:price 时隐藏总部对外采购价，只保留门店要付的供货价。
   */
  private toProductDto(
    row: Prisma.ScmProductGetPayload<object>,
    canSeePurchasePrice = true,
    latestPurchasePrice?: number,
  ) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      spec: row.spec,
      unit: row.unit,
      purchasePrice: canSeePurchasePrice ? Number(row.purchasePrice) : null,
      latestPurchasePrice: canSeePurchasePrice
        ? (latestPurchasePrice ?? null)
        : null,
      supplyPrice: Number(row.supplyPrice),
      priceVisible: canSeePurchasePrice,
      safetyStock: row.safetyStock,
      shelfLifeDays: row.shelfLifeDays,
      enabled: row.enabled,
      remark: row.remark,
    }
  }
}
