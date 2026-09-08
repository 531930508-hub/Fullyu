/**
 * 数据行级权限工具
 *
 * 设计边界（产品决策）：行级隔离只作用于「按组织核算」的模块 —— 组织架构、进销存、财务。
 * 教务与运营销售模块沿用模块级权限，不做行级过滤。
 *
 * 用法（Service 层）：
 *   const scope = await buildOrgScope(this.prisma, admin)
 *   const where = { ...scope.toWhere('orgId'), month }
 *   // SELF 范围时还需叠加 createdById
 */
import { ForbiddenException } from '@nestjs/common'
import type { DataScope } from '@fullyu/shared'
import type { PrismaService } from '../prisma.service'

/** 参与行级判定的最小管理员信息 */
export interface ScopeSubject {
  orgId: string | null
  dataScope: DataScope
  adminId?: string
}

/**
 * 解析行级范围内可见的组织 id 列表。
 * 返回 null 表示不限制（ALL）；返回空数组表示无任何可见组织。
 */
export async function resolveVisibleOrgIds(
  prisma: PrismaService,
  subject: ScopeSubject,
): Promise<string[] | null> {
  const { orgId, dataScope } = subject

  if (dataScope === 'ALL') return null

  // 未绑定组织却不是 ALL 范围 —— 无任何可见数据，避免误放通
  if (!orgId) return []

  if (dataScope === 'OWN' || dataScope === 'SELF') return [orgId]

  // OWN_AND_SUB：自身 + 全部后代。组织层级浅（集团/部门/子公司/门店 四层），
  // 用一次全量查询在内存里展开，避免递归 CTE 与 N+1。
  const all = await prisma.organization.findMany({
    select: { id: true, parentId: true },
  })
  const childrenOf = new Map<string, string[]>()
  for (const node of all) {
    if (!node.parentId) continue
    const list = childrenOf.get(node.parentId)
    if (list) list.push(node.id)
    else childrenOf.set(node.parentId, [node.id])
  }

  const result: string[] = []
  const queue = [orgId]
  const seen = new Set<string>()
  while (queue.length) {
    const cur = queue.shift()!
    if (seen.has(cur)) continue // 防御脏数据造成的环
    seen.add(cur)
    result.push(cur)
    const children = childrenOf.get(cur)
    if (children) queue.push(...children)
  }
  return result
}

/** 组织范围句柄，供 Service 拼 where 条件 */
export class OrgScope {
  constructor(
    /** null 表示不限制 */
    readonly orgIds: string[] | null,
    readonly dataScope: DataScope,
    readonly adminId?: string,
  ) {}

  get unrestricted(): boolean {
    return this.orgIds === null
  }

  /** 是否为「仅本人创建」范围 */
  get selfOnly(): boolean {
    return this.dataScope === 'SELF'
  }

  /**
   * 生成 Prisma where 片段。
   * @param field 业务表上的组织字段名，默认 orgId
   * @param creatorField SELF 范围下用于限定创建人的字段名，传入才生效
   */
  toWhere(field = 'orgId', creatorField?: string): Record<string, unknown> {
    const where: Record<string, unknown> = {}
    if (this.orgIds !== null) {
      where[field] = this.orgIds.length === 1 ? this.orgIds[0] : { in: this.orgIds }
    }
    if (this.selfOnly && creatorField && this.adminId) {
      where[creatorField] = this.adminId
    }
    return where
  }

  /** 判断某个组织是否在可见范围内 */
  includes(orgId: string | null | undefined): boolean {
    if (this.orgIds === null) return true
    if (!orgId) return false
    return this.orgIds.includes(orgId)
  }

  /**
   * 写操作前置校验：目标组织不在范围内直接拒绝。
   * 用于「店长只能给自己门店录支出」这类越权写入。
   */
  assertWritable(orgId: string | null | undefined): void {
    if (!this.includes(orgId)) {
      throw new ForbiddenException('无权操作该组织的数据')
    }
  }
}

/** 构造当前管理员的组织范围句柄 */
export async function buildOrgScope(
  prisma: PrismaService,
  subject: ScopeSubject,
): Promise<OrgScope> {
  const orgIds = await resolveVisibleOrgIds(prisma, subject)
  return new OrgScope(orgIds, subject.dataScope, subject.adminId)
}
