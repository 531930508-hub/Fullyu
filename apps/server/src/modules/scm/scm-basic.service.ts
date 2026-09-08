import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

interface UpsertProductInput {
  code: string
  name: string
  spec?: string
  unit?: string
  purchasePrice?: number
  supplyPrice?: number
  safetyStock?: number
  enabled?: boolean
  remark?: string
}

interface UpsertSupplierInput {
  name: string
  contact?: string
  phone?: string
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
  constructor(private readonly prisma: PrismaService) {}

  // ===== 商品 =====

  async listProducts(query: { keyword?: string; enabled?: boolean } = {}) {
    const where: Prisma.ScmProductWhereInput = {}
    if (query.enabled !== undefined) where.enabled = query.enabled
    if (query.keyword) {
      where.OR = [{ name: { contains: query.keyword } }, { code: { contains: query.keyword } }]
    }
    const rows = await this.prisma.scmProduct.findMany({
      where,
      orderBy: [{ code: 'asc' }],
    })
    return rows.map((row) => this.toProductDto(row))
  }

  async createProduct(input: UpsertProductInput) {
    const code = input.code?.trim().toUpperCase()
    if (!code) throw new BusinessException('商品编码不能为空', 4220)
    if (!input.name?.trim()) throw new BusinessException('商品名称不能为空', 4225)
    const taken = await this.prisma.scmProduct.findUnique({ where: { code } })
    if (taken) throw new BusinessException('商品编码已存在', 4221)
    const row = await this.prisma.scmProduct.create({
      data: { ...this.productData(input), code, name: input.name.trim() },
    })
    return this.toProductDto(row)
  }

  async updateProduct(id: string, input: Partial<UpsertProductInput>) {
    const current = await this.prisma.scmProduct.findUnique({ where: { id } })
    if (!current) throw new BusinessException('商品不存在', 4222)
    if (input.code && input.code.trim().toUpperCase() !== current.code) {
      const taken = await this.prisma.scmProduct.findUnique({
        where: { code: input.code.trim().toUpperCase() },
      })
      if (taken) throw new BusinessException('商品编码已存在', 4221)
    }
    const row = await this.prisma.scmProduct.update({
      where: { id },
      data: {
        ...this.productData(input),
        code: input.code ? input.code.trim().toUpperCase() : undefined,
      },
    })
    return this.toProductDto(row)
  }

  /**
   * 停用而非删除：已开出的采购单与库存流水都引用商品，
   * 删掉会让历史单据显示不出名字。
   */
  async toggleProduct(id: string, enabled: boolean) {
    await this.prisma.scmProduct.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new BusinessException('商品不存在', 4222)
    })
    const row = await this.prisma.scmProduct.update({ where: { id }, data: { enabled } })
    return this.toProductDto(row)
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
        enabled: input.enabled,
        remark: input.remark,
      },
    })
  }

  // ===== 内部工具 =====

  private productData(input: Partial<UpsertProductInput>) {
    return {
      name: input.name,
      spec: input.spec,
      unit: input.unit,
      purchasePrice: input.purchasePrice,
      supplyPrice: input.supplyPrice,
      safetyStock: input.safetyStock,
      enabled: input.enabled,
      remark: input.remark,
    }
  }

  /** Decimal 出参统一转 number，前端不必再处理字符串金额 */
  private toProductDto(row: Prisma.ScmProductGetPayload<object>) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      spec: row.spec,
      unit: row.unit,
      purchasePrice: Number(row.purchasePrice),
      supplyPrice: Number(row.supplyPrice),
      safetyStock: row.safetyStock,
      enabled: row.enabled,
      remark: row.remark,
    }
  }
}
