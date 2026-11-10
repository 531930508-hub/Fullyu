/**
 * 内置角色可编辑性单测
 *
 * 产品要求：内置角色只是「预置了默认权限」的角色，管理员必须能在权限页
 * 直接调整它的权限与数据范围；只有删除仍然禁止，避免把系统兜底角色删没。
 * 超级管理员额外保留一条底线：不能把「权限管理」的查看与修改一起删掉，
 * 否则保存后无人能再维护角色。
 */
import { RbacService } from '../src/modules/rbac/rbac.service'

const GUARDS = [
  { id: 'perm-rbac-view', code: 'rbac:view' },
  { id: 'perm-rbac-update', code: 'rbac:update' },
]

function makeService(role: { id: string; name?: string; isBuiltin: boolean }) {
  const state = {
    deleted: false,
    created: [] as { roleId: string; permissionId: string }[],
    updateData: null as any,
  }
  const tx = {
    rolePermission: {
      deleteMany: async () => {
        state.deleted = true
      },
      createMany: async ({ data }: { data: typeof state.created }) => {
        state.created = data
      },
    },
    role: {
      update: async ({ data }: { data: any }) => {
        state.updateData = data
        return { id: role.id, ...data }
      },
    },
  }
  const prisma: any = {
    role: {
      findUnique: async () => ({ name: 'STORE_MANAGER', ...role }),
      delete: async () => undefined,
    },
    permission: { findMany: async () => GUARDS },
    adminUserRole: { count: async () => 0 },
    $transaction: async (fn: any) => fn(tx),
  }
  return { service: new RbacService(prisma, {} as any), state }
}

describe('内置角色权限编辑', () => {
  it('内置角色可以改权限与数据范围', async () => {
    const { service, state } = makeService({ id: 'role-store', isBuiltin: true })

    await service.updateRole('role-store', {
      permissionIds: ['perm-view', 'perm-edit'],
      dataScope: 'OWN_AND_SUB',
    })

    expect(state.deleted).toBe(true)
    expect(state.created).toEqual([
      { roleId: 'role-store', permissionId: 'perm-view' },
      { roleId: 'role-store', permissionId: 'perm-edit' },
    ])
    expect(state.updateData.dataScope).toBe('OWN_AND_SUB')
  })

  it('清空权限也允许保存，由管理员自己承担后果', async () => {
    const { service, state } = makeService({ id: 'role-x', isBuiltin: true })

    await service.updateRole('role-x', { permissionIds: [] })

    expect(state.deleted).toBe(true)
    expect(state.created).toEqual([])
  })

  it('超级管理员可以调整，但不能删掉自己的权限管理入口', async () => {
    const { service, state } = makeService({ id: 'role-super', name: 'SUPER_ADMIN', isBuiltin: true })

    await expect(
      service.updateRole('role-super', { permissionIds: ['perm-rbac-view'], dataScope: 'ALL' }),
    ).rejects.toThrow('必须保留「权限管理」')
    expect(state.deleted).toBe(false)

    await service.updateRole('role-super', {
      permissionIds: ['perm-rbac-view', 'perm-rbac-update', 'perm-edit'],
      dataScope: 'ALL',
    })
    expect(state.created).toHaveLength(3)
  })

  it('内置角色仍然不可删除', async () => {
    const { service } = makeService({ id: 'role-store', isBuiltin: true })
    await expect(service.removeRole('role-store')).rejects.toThrow('内置角色不可删除')
  })
})
