import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { ScmLocation, ScmLocationType } from '@prisma/client'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { buildOrgScope, type OrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'

export interface CreateLocationInput {
  name?: string
  type: ScmLocationType
  /** 物权归属组织。自有仓必填并与地点 id 一致；供应商/代工厂地点通常挂总部 */
  orgId?: string | null
  supplierId?: string | null
  remark?: string
}

export interface LocationRow {
  id: string
  name: string
  type: ScmLocationType
  orgId: string | null
  supplierId: string | null
  enabled: boolean
  remark: string
}

/**
 * 库存地点。
 *
 * 自有仓直接复用组织 id（历史库存的 warehouse_id 不用改键），
 * 供应商处、代工厂处、在途是独立地点，物权仍挂在某个组织名下。
 * 这样「货在供应商那里、但已经是我们的」能看见，「货在门店但归总部」也能算清。
 */
@Injectable()
export class ScmLocationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 补齐所有已开启独立仓库的组织对应的自有仓地点，幂等 */
  async ensureOwnLocations() {
    const orgs = await this.prisma.organization.findMany({
      where: { hasWarehouse: true },
      select: { id: true, shortName: true },
    })
    if (!orgs.length) return
    await this.prisma.$transaction(
      orgs.map((org) =>
        this.prisma.scmLocation.upsert({
          where: { id: org.id },
          update: { name: org.shortName, type: 'OWN', orgId: org.id },
          create: { id: org.id, name: org.shortName, type: 'OWN', orgId: org.id },
        }),
      ),
    )
  }

  async list(
    admin: AdminContext,
    query: { type?: ScmLocationType; orgId?: string; keyword?: string; includeDisabled?: boolean } = {},
  ) {
    await this.ensureOwnLocations()
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Record<string, unknown> = { ...scope.toWhere('orgId') }
    if (query.type) where.type = query.type
    if (query.orgId) {
      scope.assertWritable(query.orgId)
      where.orgId = query.orgId
    }
    if (!query.includeDisabled) where.enabled = true
    if (query.keyword) where.name = { contains: query.keyword }
    const rows = await this.prisma.scmLocation.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    const names = await this.loadNames(rows)
    return rows.map((row) => this.toDto(row, names))
  }

  async create(admin: AdminContext, input: CreateLocationInput) {
    const scope = await buildOrgScope(this.prisma, admin)
    const type = input.type
    if (!['OWN', 'SUPPLIER', 'FACTORY', 'TRANSIT'].includes(type)) {
      throw new BusinessException('库存地点类型不合法', 4270)
    }
    const orgId = input.orgId || admin.orgId || null
    if (type === 'OWN') {
      if (!orgId) throw new BusinessException('自有仓必须指定所属组织', 4271)
      scope.assertWritable(orgId)
      const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
      if (!org) throw new BusinessException('组织不存在', 4272)
      if (!org.hasWarehouse) {
        throw new BusinessException(`${org.shortName} 未开启独立仓库`, 4248)
      }
      return this.describe(
        await this.prisma.scmLocation.upsert({
          where: { id: org.id },
          update: { name: input.name?.trim() || org.shortName, type: 'OWN', orgId: org.id },
          create: {
            id: org.id,
            name: input.name?.trim() || org.shortName,
            type: 'OWN',
            orgId: org.id,
          },
        }),
      )
    }

    if (!orgId) throw new BusinessException('请指定物权归属组织', 4273)
    scope.assertWritable(orgId)
    if (type === 'SUPPLIER' || type === 'FACTORY') {
      if (!input.supplierId) throw new BusinessException('请选择供应商或代工厂', 4274)
      const supplier = await this.prisma.scmSupplier.findUnique({
        where: { id: input.supplierId },
      })
      if (!supplier) throw new BusinessException('供应商不存在', 4224)
      if (type === 'FACTORY' && !supplier.isProcessor) {
        throw new BusinessException('该合作方未标记为代工厂，请先到供应商档案勾选', 4275)
      }
      return this.describe(
        await this.prisma.scmLocation.create({
          data: {
            id: `SL-${randomUUID().slice(0, 8)}`,
            name: input.name?.trim() || `${supplier.name}${type === 'FACTORY' ? ' 代工厂' : ' 存货点'}`,
            type,
            orgId,
            supplierId: supplier.id,
            remark: input.remark ?? '',
          },
        }),
      )
    }

    return this.describe(
      await this.prisma.scmLocation.create({
        data: {
          id: `SL-${randomUUID().slice(0, 8)}`,
          name: input.name?.trim() || '在途',
          type: 'TRANSIT',
          orgId,
          remark: input.remark ?? '',
        },
      }),
    )
  }

  async update(
    admin: AdminContext,
    id: string,
    input: { name?: string; remark?: string; enabled?: boolean },
  ) {
    const current = await this.requireLocation(id)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(this.ownerOf(current))
    return this.describe(
      await this.prisma.scmLocation.update({
        where: { id },
        data: {
          name: input.name?.trim() || undefined,
          remark: input.remark,
          enabled: input.enabled,
        },
      }),
    )
  }

  /**
   * 解析地点。找不到时回落到组织仓库：历史数据与刚创建的组织都能直接收货，
   * 不用先跑一遍同步。
   */
  async resolveLocation(id: string) {
    const row = await this.prisma.scmLocation.findUnique({ where: { id } })
    if (row) return row
    const org = await this.prisma.organization.findUnique({ where: { id } })
    if (org?.hasWarehouse) {
      return {
        id: org.id,
        name: org.shortName,
        type: 'OWN' as ScmLocationType,
        orgId: org.id,
        supplierId: null,
        enabled: true,
        remark: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies ScmLocation
    }
    throw new BusinessException('库存地点不存在', 4276)
  }

  /** 物权组织：自有仓即仓库组织，其余取地点挂靠的组织 */
  ownerOf(location: Pick<ScmLocation, 'type' | 'orgId' | 'id'>): string {
    const owner = location.type === 'OWN' ? location.orgId || location.id : location.orgId
    if (!owner) throw new BusinessException('库存地点未绑定物权组织', 4277)
    return owner
  }

  assertOwnerScope(scope: OrgScope, location: Pick<ScmLocation, 'type' | 'orgId' | 'id'>) {
    scope.assertWritable(this.ownerOf(location))
  }

  async requireLocation(id: string) {
    const row = await this.prisma.scmLocation.findUnique({ where: { id } })
    if (!row) throw new BusinessException('库存地点不存在', 4276)
    if (!row.enabled) throw new BusinessException('库存地点已停用', 4278)
    return row
  }

  /** 批量取地点名称，列表页一次查询避免 N+1 */
  async nameMap(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
    if (!unique.length) return new Map<string, ScmLocation>()
    const rows = await this.prisma.scmLocation.findMany({ where: { id: { in: unique } } })
    return new Map(rows.map((row) => [row.id, row]))
  }

  private async loadNames(rows: ScmLocation[]) {
    const orgIds = [...new Set(rows.map((r) => this.ownerOf(r)).filter(Boolean))]
    const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((v): v is string => Boolean(v)))]
    const [orgs, suppliers] = await Promise.all([
      orgIds.length
        ? this.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true, shortName: true },
          })
        : [],
      supplierIds.length
        ? this.prisma.scmSupplier.findMany({
            where: { id: { in: supplierIds } },
            select: { id: true, name: true },
          })
        : [],
    ])
    return {
      orgs: new Map(orgs.map((o) => [o.id, o])),
      suppliers: new Map(suppliers.map((s) => [s.id, s])),
    }
  }

  private async describe(row: ScmLocation) {
    return this.toDto(row, await this.loadNames([row]))
  }

  private toDto(
    row: ScmLocation,
    names?: {
      orgs: Map<string, { id: string; name: string; shortName: string }>
      suppliers: Map<string, { id: string; name: string }>
    },
  ) {
    const owner = this.ownerOf(row)
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      orgId: row.orgId,
      orgName: names?.orgs.get(owner)?.shortName ?? owner,
      supplierId: row.supplierId,
      supplierName: row.supplierId ? names?.suppliers.get(row.supplierId)?.name ?? '' : '',
      enabled: row.enabled,
      remark: row.remark,
    }
  }
}
