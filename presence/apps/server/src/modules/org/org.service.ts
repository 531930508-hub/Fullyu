import { Injectable } from '@nestjs/common'
import { OrgStatus, OrgType, Prisma } from '@prisma/client'
import { hasPermission } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'

/** 组织节点出参（费率字段按权限裁剪） */
export interface OrgDto {
  id: string
  name: string
  shortName: string
  code: string
  type: OrgType
  parentId: string | null
  leader: string
  phone: string
  accounting: boolean
  hasWarehouse: boolean
  canPurchase: boolean
  status: OrgStatus
  sortOrder: number
  createdAt: Date
  /** 仅 org:rate 权限可见 */
  mgmtFeeRate?: number
  trainFeeRate?: number
  /** 月保底租金（元） */
  baseRent: number
  /** 提成租金比例（0~1） */
  rentRate: number
  /** 月物业费（元） */
  propertyFee: number
  /** 挂载的管理员数量，删除校验用 */
  adminCount?: number
}

export interface OrgTreeDto extends OrgDto {
  children: OrgTreeDto[]
}

interface UpsertOrgInput {
  id?: string
  name: string
  shortName: string
  code: string
  type: OrgType
  parentId?: string | null
  leader?: string
  phone?: string
  accounting?: boolean
  hasWarehouse?: boolean
  canPurchase?: boolean
  status?: OrgStatus
  sortOrder?: number
  mgmtFeeRate?: number
  trainFeeRate?: number
  baseRent?: number
  rentRate?: number
  propertyFee?: number
}

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 组织列表（扁平）。按当前管理员的数据行级范围过滤。
   * 费率字段（管理费/培训费）需要 org:rate 权限才返回。
   */
  async list(admin: AdminContext, query: { keyword?: string; type?: OrgType; status?: OrgStatus }) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.OrganizationWhereInput = {}
    if (!scope.unrestricted) {
      where.id = { in: scope.orgIds as string[] }
    }
    if (query.type) where.type = query.type
    if (query.status) where.status = query.status
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { shortName: { contains: query.keyword } },
        { code: { contains: query.keyword } },
      ]
    }

    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { admins: true } } },
    })
    const canSeeRate = hasPermission(admin.permissions, 'org:rate')
    return rows.map((row) => this.toDto(row, canSeeRate))
  }

  /**
   * 组织树。行级范围外的节点会被裁掉；若某节点的父级不可见，则该节点上浮为根。
   */
  async tree(admin: AdminContext, query: { status?: OrgStatus } = {}): Promise<OrgTreeDto[]> {
    const flat = await this.list(admin, { status: query.status })
    const map = new Map<string, OrgTreeDto>()
    flat.forEach((node) => map.set(node.id, { ...node, children: [] }))
    const roots: OrgTreeDto[] = []
    map.forEach((node) => {
      const parent = node.parentId ? map.get(node.parentId) : undefined
      if (parent) parent.children.push(node)
      else roots.push(node)
    })
    return roots
  }

  async detail(admin: AdminContext, id: string) {
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(id)
    const row = await this.prisma.organization.findUnique({
      where: { id },
      include: { _count: { select: { admins: true } } },
    })
    if (!row) throw new BusinessException('组织不存在', 4140)
    return this.toDto(row, hasPermission(admin.permissions, 'org:rate'))
  }

  async create(admin: AdminContext, input: UpsertOrgInput) {
    const scope = await buildOrgScope(this.prisma, admin)
    // 新建节点必须挂在可见范围内的父级下；根节点仅不受限范围可建
    if (input.parentId) scope.assertWritable(input.parentId)
    else if (!scope.unrestricted) throw new BusinessException('无权创建顶级组织', 4141)

    const id = (input.id || input.code).trim().toUpperCase()
    if (!id) throw new BusinessException('组织编码不能为空', 4142)
    const [idTaken, codeTaken] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id } }),
      this.prisma.organization.findUnique({ where: { code: input.code } }),
    ])
    if (idTaken) throw new BusinessException('组织 ID 已存在', 4143)
    if (codeTaken) throw new BusinessException('组织编码已存在', 4143)
    if (input.parentId) await this.assertParentExists(input.parentId)

    const row = await this.prisma.organization.create({
      data: {
        id,
        name: input.name,
        shortName: input.shortName || input.name,
        code: input.code,
        type: input.type,
        parentId: input.parentId ?? null,
        leader: input.leader ?? '',
        phone: input.phone ?? '',
        accounting: input.accounting ?? false,
        hasWarehouse: input.hasWarehouse ?? false,
        canPurchase: input.canPurchase ?? false,
        status: input.status ?? 'ACTIVE',
        sortOrder: input.sortOrder ?? 0,
        ...this.rateData(admin, input),
        ...this.rentData(input),
      },
    })
    return this.toDto(row, hasPermission(admin.permissions, 'org:rate'))
  }

  async update(admin: AdminContext, id: string, input: Partial<UpsertOrgInput>) {
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(id)
    const current = await this.prisma.organization.findUnique({ where: { id } })
    if (!current) throw new BusinessException('组织不存在', 4140)

    if (input.code && input.code !== current.code) {
      const taken = await this.prisma.organization.findUnique({ where: { code: input.code } })
      if (taken) throw new BusinessException('组织编码已存在', 4143)
    }
    if (input.parentId !== undefined && input.parentId !== current.parentId) {
      if (input.parentId) {
        scope.assertWritable(input.parentId)
        await this.assertParentExists(input.parentId)
        await this.assertNotCircular(id, input.parentId)
      } else if (!scope.unrestricted) {
        throw new BusinessException('无权将组织调整为顶级', 4141)
      }
    }

    const row = await this.prisma.organization.update({
      where: { id },
      data: {
        name: input.name,
        shortName: input.shortName,
        code: input.code,
        type: input.type,
        parentId: input.parentId,
        leader: input.leader,
        phone: input.phone,
        accounting: input.accounting,
        hasWarehouse: input.hasWarehouse,
        canPurchase: input.canPurchase,
        status: input.status,
        sortOrder: input.sortOrder,
        ...this.rateData(admin, input),
        ...this.rentData(input),
      },
    })
    return this.toDto(row, hasPermission(admin.permissions, 'org:rate'))
  }

  async remove(admin: AdminContext, id: string) {
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(id)
    const [children, admins] = await Promise.all([
      this.prisma.organization.count({ where: { parentId: id } }),
      this.prisma.adminUser.count({ where: { orgId: id } }),
    ])
    if (children > 0) throw new BusinessException('存在下级组织，请先移除下级', 4144)
    if (admins > 0) throw new BusinessException(`仍有 ${admins} 个账号归属该组织，请先调整归属`, 4145)
    await this.prisma.organization.delete({ where: { id } })
    return { success: true }
  }

  /** 下拉选项：全部可见组织的精简结构，供进销存/财务/审批流引用 */
  async options(admin: AdminContext, query: { warehouse?: boolean; purchase?: boolean; accounting?: boolean }) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.OrganizationWhereInput = { status: 'ACTIVE' }
    if (!scope.unrestricted) where.id = { in: scope.orgIds as string[] }
    if (query.warehouse) where.hasWarehouse = true
    if (query.purchase) where.canPurchase = true
    if (query.accounting) where.accounting = true
    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }],
      select: { id: true, name: true, shortName: true, code: true, type: true, parentId: true },
    })
    return rows
  }

  // ===== 内部工具 =====

  /** 费率是 FIELD 级敏感字段，无 org:rate 权限时静默忽略入参，避免越权改比例 */
  private rateData(admin: AdminContext, input: Partial<UpsertOrgInput>) {
    if (!hasPermission(admin.permissions, 'org:rate')) return {}
    const data: { mgmtFeeRate?: number; trainFeeRate?: number } = {}
    if (input.mgmtFeeRate !== undefined) data.mgmtFeeRate = this.normalizeRate(input.mgmtFeeRate, '管理费')
    if (input.trainFeeRate !== undefined) data.trainFeeRate = this.normalizeRate(input.trainFeeRate, '培训费')
    return data
  }

  private normalizeRate(value: number, label: string): number {
    const num = Number(value)
    if (!Number.isFinite(num) || num < 0 || num > 1) {
      throw new BusinessException(`${label}比例需在 0 ~ 1 之间`, 4146)
    }
    return num
  }

  /**
   * 租金参数（月保底租金 / 提成比例 / 月物业费）。
   * 组织架构设置只开给总部，这三项跟 org:update 一起走，不再单独设字段级权限。
   */
  private rentData(input: Partial<UpsertOrgInput>) {
    const data: { baseRent?: number; rentRate?: number; propertyFee?: number } = {}
    if (input.baseRent !== undefined) data.baseRent = this.normalizeAmount(input.baseRent, '月保底租金')
    if (input.rentRate !== undefined) data.rentRate = this.normalizeRate(input.rentRate, '提成租金')
    if (input.propertyFee !== undefined) data.propertyFee = this.normalizeAmount(input.propertyFee, '月物业费')
    return data
  }

  private normalizeAmount(value: number, label: string): number {
    const num = Number(value)
    if (!Number.isFinite(num) || num < 0) {
      throw new BusinessException(`${label}需为不小于 0 的金额`, 4146)
    }
    return num
  }

  private async assertParentExists(parentId: string) {
    const parent = await this.prisma.organization.findUnique({ where: { id: parentId } })
    if (!parent) throw new BusinessException('上级组织不存在', 4147)
  }

  /** 防止把节点挂到自己的后代下形成环 */
  private async assertNotCircular(id: string, newParentId: string) {
    if (id === newParentId) throw new BusinessException('上级组织不能是自己', 4148)
    const all = await this.prisma.organization.findMany({ select: { id: true, parentId: true } })
    const parentOf = new Map(all.map((n) => [n.id, n.parentId]))
    let cursor: string | null | undefined = newParentId
    const seen = new Set<string>()
    while (cursor) {
      if (cursor === id) throw new BusinessException('上级组织不能是自己的下级', 4148)
      if (seen.has(cursor)) break
      seen.add(cursor)
      cursor = parentOf.get(cursor) ?? null
    }
  }

  private toDto(
    row: Prisma.OrganizationGetPayload<{ include: { _count: { select: { admins: true } } } }> | Prisma.OrganizationGetPayload<object>,
    canSeeRate: boolean,
  ): OrgDto {
    const anyRow = row as Record<string, any>
    const dto: OrgDto = {
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      code: row.code,
      type: row.type,
      parentId: row.parentId,
      leader: row.leader,
      phone: row.phone,
      accounting: row.accounting,
      hasWarehouse: row.hasWarehouse,
      canPurchase: row.canPurchase,
      status: row.status,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      baseRent: Number(row.baseRent),
      rentRate: Number(row.rentRate),
      propertyFee: Number(row.propertyFee),
    }
    if (anyRow._count) dto.adminCount = anyRow._count.admins
    if (canSeeRate) {
      dto.mgmtFeeRate = Number(row.mgmtFeeRate)
      dto.trainFeeRate = Number(row.trainFeeRate)
    }
    return dto
  }
}
