import { Injectable } from '@nestjs/common'
import { Prisma, ScmBomStatus, ScmProductType } from '@prisma/client'
import { hasPermission } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { money2 } from './scm.util'

export interface BomItemInput {
  componentId: string
  /** 每 1 个成品的耗用量 */
  qtyPerUnit: number
  /** 损耗率，0.02 表示 2% */
  lossRate?: number
  remark?: string
}

export interface SaveBomInput {
  productId: string
  remark?: string
  items: BomItemInput[]
}

const bomInclude = {
  product: true,
  items: { include: { component: true }, orderBy: { name: 'asc' } },
} satisfies Prisma.ScmBomInclude

/**
 * 单层 BOM（配方）。
 *
 * 每个成品同时只有一版生效：保存新配方会把旧版归档并生成 version+1，
 * 生产工单下单时快照组件与用量，之后改配方不影响在产工单。
 * 只支持单层 —— 半成品若要再拆，给自己的半成品单独维护一版 BOM。
 */
@Injectable()
export class ScmBomService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    admin: AdminContext,
    query: { productId?: string; keyword?: string; status?: ScmBomStatus } = {},
  ) {
    const where: Prisma.ScmBomWhereInput = {}
    if (query.productId) where.productId = query.productId
    if (query.status) where.status = query.status
    if (query.keyword) {
      where.product = {
        OR: [{ name: { contains: query.keyword } }, { code: { contains: query.keyword } }],
      }
    }
    const rows = await this.prisma.scmBom.findMany({
      where,
      orderBy: [{ productId: 'asc' }, { version: 'desc' }],
      take: 300,
      include: bomInclude,
    })
    const canSeePrice = hasPermission(admin.permissions, 'scm:po:price')
    return rows.map((row) => this.toDto(row, canSeePrice))
  }

  /** 某成品当前生效的配方，生产下单用 */
  async activeFor(productId: string) {
    return this.prisma.scmBom.findFirst({
      where: { productId, status: 'ACTIVE' },
      include: bomInclude,
      orderBy: { version: 'desc' },
    })
  }

  async detail(admin: AdminContext, id: string) {
    const row = await this.prisma.scmBom.findUnique({ where: { id }, include: bomInclude })
    if (!row) throw new BusinessException('BOM 不存在', 4290)
    return this.toDto(row, hasPermission(admin.permissions, 'scm:po:price'))
  }

  async save(admin: AdminContext, input: SaveBomInput) {
    const product = await this.prisma.scmProduct.findUnique({ where: { id: input.productId } })
    if (!product) throw new BusinessException('成品不存在', 4253)
    if (product.type === 'RAW' || product.type === 'PACK') {
      throw new BusinessException('原料/包材不能维护 BOM，请选择成品或半成品', 4291)
    }

    const lines = (input.items ?? []).filter((it) => it.componentId)
    if (!lines.length) throw new BusinessException('请至少添加一条组件明细', 4292)
    const seen = new Set<string>()
    for (const line of lines) {
      if (line.componentId === product.id) {
        throw new BusinessException('成品不能把自己作为组件', 4293)
      }
      if (seen.has(line.componentId)) {
        throw new BusinessException('同一组件只能出现一次，请合并用量', 4294)
      }
      seen.add(line.componentId)
      if (!(Number(line.qtyPerUnit) > 0)) {
        throw new BusinessException('单位用量必须大于 0', 4295)
      }
    }

    const components = await this.prisma.scmProduct.findMany({
      where: { id: { in: lines.map((it) => it.componentId) } },
    })
    const componentMap = new Map(components.map((p) => [p.id, p]))
    for (const line of lines) {
      const component = componentMap.get(line.componentId)
      if (!component) throw new BusinessException('组件商品不存在或已删除', 4253)
      if (component.type === 'FINISHED') {
        throw new BusinessException(`${component.name} 是成品，不能作为组件；可把它设为半成品`, 4296)
      }
      if (!component.enabled) {
        throw new BusinessException(`组件 ${component.name} 已停用`, 4297)
      }
    }

    const operator = await this.prisma.adminUser.findUnique({
      where: { id: admin.adminId },
      select: { username: true },
    })

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.scmBom.updateMany({
        where: { productId: product.id, status: 'ACTIVE' },
        data: { status: 'ARCHIVED' },
      })
      const latest = await tx.scmBom.findFirst({
        where: { productId: product.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const bom = await tx.scmBom.create({
        data: {
          productId: product.id,
          version: (latest?.version ?? 0) + 1,
          status: 'ACTIVE',
          remark: input.remark ?? '',
          createdBy: operator?.username ?? admin.username,
          items: {
            create: lines.map((line) => {
              const component = componentMap.get(line.componentId)!
              return {
                componentId: component.id,
                name: component.name,
                spec: component.spec,
                unit: component.unit,
                qtyPerUnit: Number(line.qtyPerUnit),
                lossRate: Math.max(0, Number(line.lossRate) || 0),
                remark: line.remark ?? '',
              }
            }),
          },
        },
        include: bomInclude,
      })
      return bom
    })
    return this.toDto(row, hasPermission(admin.permissions, 'scm:po:price'))
  }

  /** 归档：历史工单仍保留快照，只是不再用于新工单 */
  async archive(admin: AdminContext, id: string) {
    const row = await this.prisma.scmBom.findUnique({ where: { id }, include: bomInclude })
    if (!row) throw new BusinessException('BOM 不存在', 4290)
    if (row.status === 'ARCHIVED') {
      throw new BusinessException('该版本已归档', 4298)
    }
    const updated = await this.prisma.scmBom.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      include: bomInclude,
    })
    return this.toDto(updated, hasPermission(admin.permissions, 'scm:po:price'))
  }

  /** 组件类型校验供生产服务复用 */
  static canBeComponent(type: ScmProductType): boolean {
    return type !== 'FINISHED'
  }

  private toDto(
    row: Prisma.ScmBomGetPayload<{ include: typeof bomInclude }>,
    canSeePrice: boolean,
  ) {
    const items = row.items.map((it) => {
      const qtyPerUnit = Number(it.qtyPerUnit)
      const lossRate = Number(it.lossRate)
      const unitPrice = Number(it.component.purchasePrice)
      return {
        componentId: it.componentId,
        code: it.component.code,
        name: it.name,
        spec: it.spec,
        unit: it.unit,
        qtyPerUnit: Math.round(qtyPerUnit * 1e6) / 1e6,
        lossRate,
        remark: it.remark,
        unitPrice: canSeePrice ? money2(unitPrice) : 0,
        amount: canSeePrice ? money2(qtyPerUnit * (1 + lossRate) * unitPrice) : 0,
      }
    })
    const unitCost = items.reduce((sum, it) => sum + it.amount, 0)
    return {
      id: row.id,
      productId: row.productId,
      productCode: row.product.code,
      productName: row.product.name,
      productSpec: row.product.spec,
      productUnit: row.product.unit,
      productType: row.product.type,
      version: row.version,
      status: row.status,
      remark: row.remark,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      unitCost: canSeePrice ? money2(unitCost) : 0,
      costVisible: canSeePrice,
      items,
    }
  }
}
