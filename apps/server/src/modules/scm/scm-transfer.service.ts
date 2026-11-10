import { Injectable } from '@nestjs/common'
import { Prisma, ScmTransferStatus } from '@prisma/client'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { generateDocNo } from '../../common/doc-no.helper'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { StockService } from './stock.service'
import { ScmLocationService } from './scm-location.service'
import { qty3 } from './scm.util'

export interface CreateTransferInput {
  fromLocationId: string
  toLocationId: string
  remark?: string
  items: { productId: string; qty: number }[]
}

const transferInclude = { items: true } satisfies Prisma.ScmTransferInclude

/**
 * 库存调拨：一次事务内源地点出库、目标地点入库。
 *
 * 一期不做审批，提交即生效 —— 调拨只是所有权/存放位置变化，不动钱。
 * 反向撤销会再写一对红字流水，保证「结存 = 流水累计」这条账始终成立。
 */
@Injectable()
export class ScmTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly stockService: StockService,
    private readonly locationService: ScmLocationService,
  ) {}

  async list(
    admin: AdminContext,
    query: { locationId?: string; productId?: string; status?: ScmTransferStatus; limit?: number } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.ScmTransferWhereInput = {}
    if (query.locationId) {
      const location = await this.locationService.resolveLocation(query.locationId)
      scope.assertWritable(this.locationService.ownerOf(location))
      where.OR = [{ fromLocationId: location.id }, { toLocationId: location.id }]
    }
    // 可见范围同时覆盖「货从我这出」与「货到我这里」
    const visibility: Prisma.ScmTransferWhereInput = scope.unrestricted
      ? {}
      : {
          OR: [
            ...(scope.orgIds ?? []).map((id) => ({ fromOwnerOrgId: id })),
            ...(scope.orgIds ?? []).map((id) => ({ toOwnerOrgId: id })),
          ],
        }
    const combined: Prisma.ScmTransferWhereInput =
      where.OR && visibility.OR ? { AND: [where, visibility] } : { ...where, ...visibility }
    if (query.status) combined.status = query.status
    if (query.productId) combined.items = { some: { productId: query.productId } }
    const rows = await this.prisma.scmTransfer.findMany({
      where: combined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.limit) || 200, 500),
      include: transferInclude,
    })
    return this.toDtos(rows)
  }

  async detail(admin: AdminContext, id: string) {
    const row = await this.prisma.scmTransfer.findUnique({ where: { id }, include: transferInclude })
    if (!row) throw new BusinessException('调拨单不存在', 4280)
    const scope = await buildOrgScope(this.prisma, admin)
    if (!scope.includes(row.fromOwnerOrgId) && !scope.includes(row.toOwnerOrgId)) {
      throw new BusinessException('无权查看该调拨单', 4281)
    }
    const [dto] = await this.toDtos([row])
    return dto
  }

  async create(admin: AdminContext, input: CreateTransferInput) {
    if (input.fromLocationId === input.toLocationId) {
      throw new BusinessException('调出与调入库位不能相同', 4282)
    }
    const [from, to] = await Promise.all([
      this.locationService.resolveLocation(input.fromLocationId),
      this.locationService.resolveLocation(input.toLocationId),
    ])
    if (!from.enabled) throw new BusinessException(`调出地点 ${from.name} 已停用`, 4278)
    if (!to.enabled) throw new BusinessException(`调入地点 ${to.name} 已停用`, 4278)
    const fromOwnerOrgId = this.locationService.ownerOf(from)
    const toOwnerOrgId = this.locationService.ownerOf(to)

    const scope = await buildOrgScope(this.prisma, admin)
    // 出库方必须有权限；调入方可跨范围（如总部调给门店），但不能凭空落到不可见组织
    scope.assertWritable(fromOwnerOrgId)

    const lines = (input.items ?? []).filter((it) => it.productId && Number(it.qty) > 0)
    if (!lines.length) throw new BusinessException('请至少添加一行调拨明细', 4283)
    const products = await this.prisma.scmProduct.findMany({
      where: { id: { in: lines.map((it) => it.productId) } },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))
    const items = lines.map((line) => {
      const product = productMap.get(line.productId)
      if (!product) throw new BusinessException('商品不存在或已删除', 4253)
      return {
        productId: product.id,
        name: product.name,
        spec: product.spec,
        unit: product.unit,
        qty: qty3(line.qty),
      }
    })

    const id = await generateDocNo(this.redis, 'TR', async (no) => {
      return !!(await this.prisma.scmTransfer.findUnique({ where: { id: no } }))
    })
    const operator = await this.prisma.adminUser.findUnique({
      where: { id: admin.adminId },
      select: { username: true, name: true },
    })

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.scmTransfer.create({
        data: {
          id,
          fromLocationId: from.id,
          toLocationId: to.id,
          fromOwnerOrgId,
          toOwnerOrgId,
          status: 'COMPLETED',
          remark: input.remark ?? '',
          createdBy: operator?.username ?? admin.username,
          createdByName: operator?.name ?? '',
          items: { create: items },
        },
        include: transferInclude,
      })
      for (const item of items) {
        const out = await this.stockService.move(tx, {
          warehouseId: from.id,
          ownerOrgId: fromOwnerOrgId,
          productId: item.productId,
          qty: -item.qty,
          type: 'OUT',
          ref: id,
        })
        // 按 FIFO 拆出的批次原样带到调入地点，批号与效期不丢
        for (const alloc of out.allocations) {
          await this.stockService.move(tx, {
            warehouseId: to.id,
            ownerOrgId: toOwnerOrgId,
            productId: item.productId,
            qty: alloc.qty,
            type: 'IN',
            ref: id,
            batch: {
              batchNo: alloc.batchNo,
              productionDate: alloc.productionDate,
              expiryDate: alloc.expiryDate,
              unitCost: alloc.unitCost,
              sourceType: 'TRANSFER',
              sourceNo: id,
            },
          })
        }
      }
      return created
    })

    const [dto] = await this.toDtos([row])
    return dto
  }

  /** 撤销：写反向流水，原调拨单置为已取消。调入方库存已被消耗时会因不足而失败 */
  async cancel(admin: AdminContext, id: string) {
    const row = await this.prisma.scmTransfer.findUnique({ where: { id }, include: transferInclude })
    if (!row) throw new BusinessException('调拨单不存在', 4280)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(row.fromOwnerOrgId)
    if (row.status !== 'COMPLETED') {
      throw new BusinessException('该调拨单已取消', 4284)
    }
    const operator = await this.prisma.adminUser.findUnique({
      where: { id: admin.adminId },
      select: { username: true, name: true },
    })
    await this.prisma.$transaction(async (tx) => {
      for (const item of row.items) {
        const qty = qty3(item.qty)
        const out = await this.stockService.move(tx, {
          warehouseId: row.toLocationId,
          ownerOrgId: row.toOwnerOrgId,
          productId: item.productId,
          qty: -qty,
          type: 'OUT',
          ref: `${id}-R`,
        })
        // 撤销按调入地点的实际批次冲回，成本口径与去程一致
        for (const alloc of out.allocations) {
          await this.stockService.move(tx, {
            warehouseId: row.fromLocationId,
            ownerOrgId: row.fromOwnerOrgId,
            productId: item.productId,
            qty: alloc.qty,
            type: 'IN',
            ref: `${id}-R`,
            batch: {
              batchNo: alloc.batchNo,
              productionDate: alloc.productionDate,
              expiryDate: alloc.expiryDate,
              unitCost: alloc.unitCost,
              sourceType: 'TRANSFER',
              sourceNo: `${id}-R`,
            },
          })
        }
      }
      await tx.scmTransfer.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          remark: [row.remark, `撤销人：${operator?.name || operator?.username || admin.username}`]
            .filter(Boolean)
            .join(' / '),
        },
      })
    })
    const after = await this.prisma.scmTransfer.findUniqueOrThrow({
      where: { id },
      include: transferInclude,
    })
    const [dto] = await this.toDtos([after])
    return dto
  }

  private async toDtos(rows: Prisma.ScmTransferGetPayload<{ include: typeof transferInclude }>[]) {
    const locations = await this.locationService.nameMap(
      rows.flatMap((row) => [row.fromLocationId, row.toLocationId]),
    )
    return rows.map((row) => ({
      id: row.id,
      fromLocationId: row.fromLocationId,
      fromLocationName: locations.get(row.fromLocationId)?.name ?? row.fromLocationId,
      toLocationId: row.toLocationId,
      toLocationName: locations.get(row.toLocationId)?.name ?? row.toLocationId,
      fromOwnerOrgId: row.fromOwnerOrgId,
      toOwnerOrgId: row.toOwnerOrgId,
      status: row.status,
      remark: row.remark,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      createdAt: row.createdAt,
      items: row.items.map((it) => ({
        productId: it.productId,
        name: it.name,
        spec: it.spec,
        unit: it.unit,
        qty: qty3(it.qty),
      })),
    }))
  }
}
