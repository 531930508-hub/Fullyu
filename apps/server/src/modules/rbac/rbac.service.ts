import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  // ===== 管理员 =====

  async listAdmins() {
    return this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        isActive: true,
        createdAt: true,
        roles: { include: { role: { select: { id: true, name: true } } } },
      },
    })
  }

  async createAdmin(data: {
    username: string
    password: string
    name: string
    phone?: string
    roleIds?: string[]
  }) {
    const exists = await this.prisma.adminUser.findUnique({
      where: { username: data.username },
    })
    if (exists) throw new BusinessException('用户名已存在', 4110)
    const bcrypt = require('bcrypt')
    const hash = await bcrypt.hash(data.password, 10)
    return this.prisma.adminUser.create({
      data: {
        username: data.username,
        password: hash,
        name: data.name,
        phone: data.phone,
        roles: data.roleIds?.length
          ? { create: data.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
    })
  }

  async updateAdmin(
    id: string,
    data: { name?: string; phone?: string; isActive?: boolean; password?: string; roleIds?: string[] },
  ) {
    const updateData: any = {
      name: data.name,
      phone: data.phone,
      isActive: data.isActive,
    }
    if (data.password) {
      const bcrypt = require('bcrypt')
      updateData.password = await bcrypt.hash(data.password, 10)
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
    return this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { permissions: { include: { permission: true } } },
    })
  }

  async createRole(data: { name: string; description?: string; permissionIds?: string[] }) {
    const exists = await this.prisma.role.findUnique({ where: { name: data.name } })
    if (exists) throw new BusinessException('角色名已存在', 4111)
    return this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissionIds?.length
          ? { create: data.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
    })
  }

  async updateRole(
    id: string,
    data: { description?: string; permissionIds?: string[] },
  ) {
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
        data: { description: data.description },
      })
    })
  }

  async removeRole(id: string) {
    const inUse = await this.prisma.adminUserRole.count({ where: { roleId: id } })
    if (inUse > 0) throw new BusinessException('该角色已分配给管理员，无法删除', 4112)
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.role.delete({ where: { id } }),
    ])
    return { success: true }
  }

  // ===== 权限点 =====

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { module: 'asc' } })
  }
}
