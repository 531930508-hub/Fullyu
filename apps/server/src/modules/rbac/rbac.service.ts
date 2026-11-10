import { Injectable } from '@nestjs/common'
import { DataScope, Prisma } from '@prisma/client'
import { DATA_SCOPES, PERMISSION_MODULES, PERM_LEVEL_NAMES } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import { PasswordPolicyService } from '../../common/password-policy.service'
import type { AdminContext } from '../auth/admin-jwt.strategy'

/** 权限树节点：模块 -> 分组 -> 权限点 */
export interface PermTreeNode {
  key: string
  title: string
  /** 叶子节点才有 */
  code?: string
  level?: string
  levelName?: string
  children?: PermTreeNode[]
}

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  // ===== 管理员 =====

  /**
   * 管理员列表。非 ALL 范围的管理员只能看到自己可见组织下的账号
   * （未绑定组织的账号仅 ALL 范围可见，避免超管账号被下级看到）。
   */
  async listAdmins(admin: AdminContext) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.AdminUserWhereInput = {}
    if (!scope.unrestricted) where.orgId = { in: scope.orgIds as string[] }

    return this.prisma.adminUser.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        isActive: true,
        orgId: true,
        createdAt: true,
        org: { select: { id: true, name: true, shortName: true, type: true } },
        roles: {
          include: { role: { select: { id: true, name: true, description: true, dataScope: true } } },
        },
      },
    })
  }

  /**
   * 人员下拉选项（审批人、负责人等选人场景专用）。
   *
   * 与 listAdmins 分开是有意的：选人是很多业务页的基础能力（审批流配置、
   * 审批人设定），不应要求 rbac:view 这种管理类权限，否则只有审批权限的人
   * 打开配置页会拿到一个空下拉。作为交换，返回字段只留展示必需，
   * 不带权限码、角色、手机号以外的任何敏感信息，并同样受行级范围约束。
   */
  async listAdminOptions(admin: AdminContext) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.AdminUserWhereInput = { isActive: true }
    if (!scope.unrestricted) where.orgId = { in: scope.orgIds as string[] }

    const rows = await this.prisma.adminUser.findMany({
      where,
      orderBy: [{ orgId: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        username: true,
        name: true,
        orgId: true,
        org: { select: { shortName: true } },
      },
    })

    return rows.map((r) => ({
      id: r.id,
      // 选人的存值用 username（即手机号）：比 cuid 稳定，重新 seed 也不会失效，
      // 配置里存的值还能让人直接看懂是谁。
      value: r.username,
      username: r.username,
      name: r.name,
      orgId: r.orgId,
      orgName: r.org?.shortName ?? '',
      // 未绑定组织的（如纯技术超管账号）不拼前缀，避免出现「·张三」这种残形
      label: r.org?.shortName ? `${r.org.shortName}·${r.name}` : r.name,
    }))
  }

  /**
   * 登录账号统一用手机号，不再自定义用户名。
   * 这样账号能直接对应到人，也不会再出现 store_ft 这类看不出是谁的账号。
   * 存量非手机号账号（如 admin）不受影响，仅在新建与改手机号时校验。
   */
  private normalizePhoneAsUsername(phone?: string): string {
    const value = (phone ?? '').trim()
    if (!/^1[3-9]\d{9}$/.test(value)) {
      throw new BusinessException('请填写正确的 11 位手机号，手机号即登录账号', 4115)
    }
    return value
  }

  async createAdmin(
    admin: AdminContext,
    data: {
      username?: string
      password: string
      name: string
      phone?: string
      orgId?: string | null
      roleIds?: string[]
    },
  ) {
    // 兼容调用方只传 username 的旧写法，但两者最终必须是同一个手机号
    const username = this.normalizePhoneAsUsername(data.phone || data.username)

    const exists = await this.prisma.adminUser.findUnique({ where: { username } })
    if (exists) throw new BusinessException('该手机号已被占用', 4110)

    const scope = await buildOrgScope(this.prisma, admin)
    if (data.orgId) {
      scope.assertWritable(data.orgId)
      await this.assertOrgExists(data.orgId)
    } else if (!scope.unrestricted) {
      throw new BusinessException('必须指定归属组织', 4113)
    }
    await this.assertRolesAssignable(admin, data.roleIds)

    const bcrypt = require('bcrypt')
    this.passwordPolicy.assertValid(data.password)
    const hash = await bcrypt.hash(data.password, 10)
    return this.prisma.adminUser.create({
      data: {
        username,
        password: hash,
        name: data.name,
        phone: username,
        orgId: data.orgId ?? null,
        // 强制首登改密受策略控制；测试阶段关掉后新建账号直接用初始密码登录
        mustChangePassword: this.passwordPolicy.shouldForceChange(),
        roles: data.roleIds?.length
          ? { create: data.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
    })
  }

  async updateAdmin(
    admin: AdminContext,
    id: string,
    data: {
      name?: string
      phone?: string
      isActive?: boolean
      password?: string
      orgId?: string | null
      roleIds?: string[]
    },
  ) {
    const target = await this.prisma.adminUser.findUnique({ where: { id } })
    if (!target) throw new BusinessException('管理员不存在', 4114)

    const scope = await buildOrgScope(this.prisma, admin)
    if (!scope.unrestricted) {
      scope.assertWritable(target.orgId)
      if (data.orgId !== undefined) {
        if (!data.orgId) throw new BusinessException('必须指定归属组织', 4113)
        scope.assertWritable(data.orgId)
      }
    }
    if (data.orgId) await this.assertOrgExists(data.orgId)
    await this.assertRolesAssignable(admin, data.roleIds)

    const updateData: Prisma.AdminUserUpdateInput = {
      name: data.name,
      isActive: data.isActive,
    }
    // 手机号即登录名，换号就是换账号，两个字段必须一起动，否则下次登录会对不上
    if (data.phone !== undefined && data.phone.trim() !== target.username) {
      const nextUsername = this.normalizePhoneAsUsername(data.phone)
      const taken = await this.prisma.adminUser.findUnique({ where: { username: nextUsername } })
      if (taken && taken.id !== id) throw new BusinessException('该手机号已被占用', 4110)
      updateData.username = nextUsername
      updateData.phone = nextUsername
    }
    if (data.orgId !== undefined) {
      updateData.org = data.orgId ? { connect: { id: data.orgId } } : { disconnect: true }
    }
    if (data.password) {
      const bcrypt = require('bcrypt')
      this.passwordPolicy.assertValid(data.password)
      updateData.password = await bcrypt.hash(data.password, 10)
      // 管理员代改密码后是否要本人下次登录改密，由密码策略决定
      updateData.mustChangePassword = this.passwordPolicy.shouldForceChange()
    }
    return this.prisma.$transaction(async (tx) => {
      if (data.roleIds) {
        await tx.adminUserRole.deleteMany({ where: { userId: id } })
        if (data.roleIds.length) {
          await tx.adminUserRole.createMany({
            data: data.roleIds.map((roleId) => ({ userId: id, roleId })),
          })
        }
      }
      return tx.adminUser.update({ where: { id }, data: updateData })
    })
  }

  // ===== 角色 =====

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isBuiltin: 'desc' }, { createdAt: 'asc' }],
      include: {
        permissions: { select: { permission: { select: { id: true, code: true } } } },
        _count: { select: { users: true } },
      },
    })
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      dataScope: role.dataScope,
      isBuiltin: role.isBuiltin,
      createdAt: role.createdAt,
      userCount: role._count.users,
      permissionIds: role.permissions.map((p) => p.permission.id),
      permissionCodes: role.permissions.map((p) => p.permission.code),
    }))
  }

  async createRole(data: {
    name: string
    description?: string
    dataScope?: DataScope
    permissionIds?: string[]
  }) {
    const exists = await this.prisma.role.findUnique({ where: { name: data.name } })
    if (exists) throw new BusinessException('角色名已存在', 4111)
    return this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        dataScope: data.dataScope ?? 'OWN',
        isBuiltin: false,
        permissions: data.permissionIds?.length
          ? { create: data.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
    })
  }

  async updateRole(
    id: string,
    data: { description?: string; dataScope?: DataScope; permissionIds?: string[] },
  ) {
    const role = await this.prisma.role.findUnique({ where: { id } })
    if (!role) throw new BusinessException('角色不存在', 4115)
    // 内置角色只是「带默认权限的预置角色」，默认值仅用于首次初始化；
    // 之后允许管理员按实际业务调整权限与数据范围（seed 也不会再覆盖线上配置）。
    // 区别只剩一个：内置角色不可删除，避免把系统兜底角色删没。
    //
    // 唯一的兜底：超级管理员必须保留「权限管理」的查看与修改，
    // 否则保存后没人能再回到这个页面，只能直接改库救场。
    if (role.name === 'SUPER_ADMIN' && data.permissionIds) {
      const guards = await this.prisma.permission.findMany({
        where: { code: { in: ['rbac:view', 'rbac:update'] } },
        select: { id: true, code: true },
      })
      const missing = guards.filter((g) => !data.permissionIds!.includes(g.id))
      if (missing.length) {
        throw new BusinessException(
          '超级管理员必须保留「权限管理」的查看与修改权限，否则将无人能再维护角色',
          4120,
        )
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } })
        if (data.permissionIds.length) {
          await tx.rolePermission.createMany({
            data: data.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          })
        }
      }
      return tx.role.update({
        where: { id },
        data: { description: data.description, dataScope: data.dataScope },
      })
    })
  }

  async removeRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } })
    if (!role) throw new BusinessException('角色不存在', 4115)
    if (role.isBuiltin) throw new BusinessException('内置角色不可删除', 4117)
    const inUse = await this.prisma.adminUserRole.count({ where: { roleId: id } })
    if (inUse > 0) throw new BusinessException('该角色已分配给管理员，无法删除', 4112)
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.role.delete({ where: { id } }),
    ])
    return { success: true }
  }

  /** 复制内置角色为可编辑的自定义角色 */
  async cloneRole(id: string, data: { name: string; description?: string }) {
    const source = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true },
    })
    if (!source) throw new BusinessException('角色不存在', 4115)
    const taken = await this.prisma.role.findUnique({ where: { name: data.name } })
    if (taken) throw new BusinessException('角色名已存在', 4111)
    return this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description ?? `复制自 ${source.name}`,
        dataScope: source.dataScope,
        isBuiltin: false,
        permissions: {
          create: source.permissions.map((p) => ({ permissionId: p.permissionId })),
        },
      },
    })
  }

  // ===== 权限点 =====

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }],
    })
  }

  /**
   * 权限树：模块 -> 分组 -> 权限点（叶子带粒度标签）。
   * 前端权限分配页直接用它渲染可勾选树。
   */
  async permissionTree(): Promise<{
    tree: PermTreeNode[]
    dataScopes: typeof DATA_SCOPES
  }> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ sortOrder: 'asc' }],
    })
    const moduleNameOf = new Map(PERMISSION_MODULES.map((m) => [m.key, m.name]))

    const tree: PermTreeNode[] = []
    const moduleIndex = new Map<string, PermTreeNode>()
    const groupIndex = new Map<string, PermTreeNode>()

    for (const p of permissions) {
      let moduleNode = moduleIndex.get(p.module)
      if (!moduleNode) {
        moduleNode = {
          key: `module:${p.module}`,
          title: moduleNameOf.get(p.module) ?? p.module,
          children: [],
        }
        moduleIndex.set(p.module, moduleNode)
        tree.push(moduleNode)
      }
      const groupKey = `${p.module}/${p.groupName || '其他'}`
      let groupNode = groupIndex.get(groupKey)
      if (!groupNode) {
        groupNode = { key: `group:${groupKey}`, title: p.groupName || '其他', children: [] }
        groupIndex.set(groupKey, groupNode)
        moduleNode.children!.push(groupNode)
      }
      groupNode.children!.push({
        key: p.id,
        title: p.name,
        code: p.code,
        level: p.level,
        levelName: PERM_LEVEL_NAMES[p.level as keyof typeof PERM_LEVEL_NAMES] ?? p.level,
      })
    }

    // 按 PERMISSION_MODULES 声明顺序排列模块，保证前端展示稳定
    const order = new Map(PERMISSION_MODULES.map((m, i) => [`module:${m.key}`, i]))
    tree.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))

    return { tree, dataScopes: DATA_SCOPES }
  }

  // ===== 内部工具 =====

  private async assertOrgExists(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new BusinessException('归属组织不存在', 4118)
  }

  /**
   * 防提权：非超管不能把「数据范围比自己宽」或「含自己没有的权限」的角色授予他人。
   */
  private async assertRolesAssignable(admin: AdminContext, roleIds?: string[]) {
    if (!roleIds?.length) return
    if (admin.permissions.includes('*')) return

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      include: { permissions: { select: { permission: { select: { code: true } } } } },
    })
    if (roles.length !== roleIds.length) throw new BusinessException('存在无效角色', 4115)

    const weight: Record<DataScope, number> = { ALL: 4, OWN_AND_SUB: 3, OWN: 2, SELF: 1 }
    const mine = weight[admin.dataScope as DataScope] ?? 1
    const owned = new Set(admin.permissions)
    for (const role of roles) {
      if ((weight[role.dataScope] ?? 1) > mine) {
        throw new BusinessException(`无权授予数据范围更大的角色：${role.name}`, 4119)
      }
      const over = role.permissions
        .map((p) => p.permission.code)
        .filter((code) => !owned.has(code))
      if (over.length) {
        throw new BusinessException(`无权授予自己不具备的权限：${over.slice(0, 3).join('、')}`, 4119)
      }
    }
  }
}
