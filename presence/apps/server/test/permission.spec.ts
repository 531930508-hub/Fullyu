/**
 * 权限体系单元测试
 *
 * 刻意不走 Nest 的 Testing module：本文件覆盖的都是纯函数或依赖可手工注入的逻辑，
 * 直接 new / 直接调用即可，既跑得快，也不受 legacy 集成测试脚手架的 DI 问题牵连。
 *
 * 覆盖三块：
 *   1. 权限码判定（通配符语义）
 *   2. 数据行级范围（多角色取最宽松、可见组织展开、where 拼装、越权写入拦截）
 *   3. 防提权（不能授予范围更宽或含自己没有的权限的角色）
 * 外加权限目录与内置角色画像的自检，防止后续加权限点时漏配或写错模块。
 */
import {
  ALL_PERMISSION_CODES,
  BUILTIN_ROLES,
  DATA_SCOPES,
  PERMISSIONS,
  PERMISSION_MODULES,
  PERM_LEVEL_NAMES,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  resolveWorkbenchBlocks,
  widestDataScope,
} from '@fullyu/shared'
import type { DataScope } from '@fullyu/shared'
import { OrgScope, resolveVisibleOrgIds, buildOrgScope } from '../src/common/utils/data-scope.util'
import { RbacService } from '../src/modules/rbac/rbac.service'

describe('权限码判定 hasPermission', () => {
  it('精确命中', () => {
    expect(hasPermission(['scm:po:view'], 'scm:po:view')).toBe(true)
    expect(hasPermission(['scm:po:view'], 'scm:po:price')).toBe(false)
  })

  it('持有 * 时全部通过', () => {
    expect(hasPermission(['*'], 'finance:dashboard:profit')).toBe(true)
    expect(hasPermission(['*'], '任意没定义过的码')).toBe(true)
  })

  it('前缀通配 scm:* 命中 scm 下所有权限', () => {
    expect(hasPermission(['scm:*'], 'scm:po:view')).toBe(true)
    expect(hasPermission(['scm:*'], 'scm:inventory:adjust')).toBe(true)
    // 不能跨模块误放通
    expect(hasPermission(['scm:*'], 'finance:dashboard:view')).toBe(false)
  })

  it('通配只在以 :* 结尾时生效，避免前缀串味', () => {
    // 'scm:po' 不带 :*，不应命中 'scm:po:view'
    expect(hasPermission(['scm:po'], 'scm:po:view')).toBe(false)
    // 'org:*' 不应命中同前缀的别的模块名 'organization:xxx'
    expect(hasPermission(['org:*'], 'organization:view')).toBe(false)
  })

  it('空权限集恒不通过', () => {
    expect(hasPermission([], 'scm:po:view')).toBe(false)
    expect(hasPermission(undefined, 'scm:po:view')).toBe(false)
  })

  it('any / all 语义', () => {
    const owned = ['scm:po:view', 'finance:dashboard:view']
    expect(hasAnyPermission(owned, ['scm:po:price', 'scm:po:view'])).toBe(true)
    expect(hasAnyPermission(owned, ['scm:po:price', 'scm:po:audit'])).toBe(false)
    expect(hasAllPermissions(owned, ['scm:po:view', 'finance:dashboard:view'])).toBe(true)
    expect(hasAllPermissions(owned, ['scm:po:view', 'scm:po:price'])).toBe(false)
    // 无要求视为通过，避免调用方传空数组时被误拦
    expect(hasAnyPermission([], [])).toBe(true)
    expect(hasAllPermissions([], [])).toBe(true)
  })
})

describe('多角色数据范围 widestDataScope', () => {
  it('取最宽松的一个', () => {
    expect(widestDataScope(['OWN', 'OWN_AND_SUB'])).toBe('OWN_AND_SUB')
    expect(widestDataScope(['SELF', 'OWN', 'ALL'])).toBe('ALL')
    expect(widestDataScope(['SELF', 'SELF'])).toBe('SELF')
  })

  it('无角色时收敛到最严格的 SELF，而不是放通', () => {
    expect(widestDataScope([])).toBe('SELF')
  })
})

describe('可见组织展开 resolveVisibleOrgIds', () => {
  /**
   * 组织树：
   *   group
   *   ├── sub-a
   *   │   ├── store-a1
   *   │   └── store-a2
   *   └── sub-b
   *       └── store-b1
   */
  const orgNodes = [
    { id: 'group', parentId: null },
    { id: 'sub-a', parentId: 'group' },
    { id: 'store-a1', parentId: 'sub-a' },
    { id: 'store-a2', parentId: 'sub-a' },
    { id: 'sub-b', parentId: 'group' },
    { id: 'store-b1', parentId: 'sub-b' },
  ]
  const prisma: any = {
    organization: { findMany: jest.fn().mockResolvedValue(orgNodes) },
  }

  it('ALL 返回 null 表示不加任何限制', async () => {
    const ids = await resolveVisibleOrgIds(prisma, { orgId: 'sub-a', dataScope: 'ALL' })
    expect(ids).toBeNull()
  })

  it('OWN / SELF 只看本组织', async () => {
    expect(await resolveVisibleOrgIds(prisma, { orgId: 'sub-a', dataScope: 'OWN' })).toEqual(['sub-a'])
    expect(await resolveVisibleOrgIds(prisma, { orgId: 'sub-a', dataScope: 'SELF' })).toEqual(['sub-a'])
  })

  it('OWN_AND_SUB 展开自身与全部后代', async () => {
    const ids = await resolveVisibleOrgIds(prisma, { orgId: 'sub-a', dataScope: 'OWN_AND_SUB' })
    expect(ids!.sort()).toEqual(['store-a1', 'store-a2', 'sub-a'])
  })

  it('OWN_AND_SUB 从集团根节点出发能看到整棵树', async () => {
    const ids = await resolveVisibleOrgIds(prisma, { orgId: 'group', dataScope: 'OWN_AND_SUB' })
    expect(ids!.length).toBe(orgNodes.length)
  })

  it('未绑定组织且不是 ALL 范围时返回空数组，不能误放通', async () => {
    for (const scope of ['OWN_AND_SUB', 'OWN', 'SELF'] as DataScope[]) {
      expect(await resolveVisibleOrgIds(prisma, { orgId: null, dataScope: scope })).toEqual([])
    }
  })

  it('脏数据形成环时不死循环', async () => {
    const cyclic: any = {
      organization: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'x', parentId: 'y' },
          { id: 'y', parentId: 'x' },
        ]),
      },
    }
    const ids = await resolveVisibleOrgIds(cyclic, { orgId: 'x', dataScope: 'OWN_AND_SUB' })
    expect(ids!.sort()).toEqual(['x', 'y'])
  })
})

describe('OrgScope where 拼装与越权拦截', () => {
  it('不限制范围时不产出 orgId 条件', () => {
    const scope = new OrgScope(null, 'ALL')
    expect(scope.unrestricted).toBe(true)
    expect(scope.toWhere('orgId')).toEqual({})
  })

  it('单组织用等值，多组织用 in', () => {
    expect(new OrgScope(['a'], 'OWN').toWhere('orgId')).toEqual({ orgId: 'a' })
    expect(new OrgScope(['a', 'b'], 'OWN_AND_SUB').toWhere('orgId')).toEqual({
      orgId: { in: ['a', 'b'] },
    })
  })

  it('支持自定义组织字段名', () => {
    expect(new OrgScope(['a'], 'OWN').toWhere('warehouseOrgId')).toEqual({ warehouseOrgId: 'a' })
  })

  it('SELF 范围叠加创建人条件', () => {
    const scope = new OrgScope(['a'], 'SELF', 'admin-1')
    expect(scope.selfOnly).toBe(true)
    expect(scope.toWhere('orgId', 'createdById')).toEqual({ orgId: 'a', createdById: 'admin-1' })
    // 调用方没传 creatorField 时不擅自加条件
    expect(scope.toWhere('orgId')).toEqual({ orgId: 'a' })
  })

  it('非 SELF 范围即使传了 creatorField 也不限制创建人', () => {
    const scope = new OrgScope(['a'], 'OWN', 'admin-1')
    expect(scope.toWhere('orgId', 'createdById')).toEqual({ orgId: 'a' })
  })

  it('includes 判定与空组织的处理', () => {
    const scope = new OrgScope(['a', 'b'], 'OWN_AND_SUB')
    expect(scope.includes('a')).toBe(true)
    expect(scope.includes('c')).toBe(false)
    expect(scope.includes(null)).toBe(false)
    // 不限制范围时连 null 也算命中（集团级单据）
    expect(new OrgScope(null, 'ALL').includes(null)).toBe(true)
  })

  it('assertWritable 拦截跨组织写入', () => {
    const scope = new OrgScope(['store-a1'], 'OWN')
    expect(() => scope.assertWritable('store-a1')).not.toThrow()
    // 店长把支出单记到别的门店头上
    expect(() => scope.assertWritable('store-b1')).toThrow('无权操作该组织的数据')
  })

  it('buildOrgScope 串起查询与句柄', async () => {
    const prisma: any = {
      organization: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'sub-a', parentId: null },
          { id: 'store-a1', parentId: 'sub-a' },
        ]),
      },
    }
    const scope = await buildOrgScope(prisma, {
      orgId: 'sub-a',
      dataScope: 'OWN_AND_SUB',
      adminId: 'admin-1',
    })
    expect(scope.unrestricted).toBe(false)
    expect(scope.includes('store-a1')).toBe(true)
  })
})

describe('防提权 assertRolesAssignable', () => {
  function makeService(roles: any[]) {
    const prisma: any = { role: { findMany: jest.fn().mockResolvedValue(roles) } }
    return new RbacService(prisma)
  }
  /** 直接调私有方法，测的是授权判定本身，不绕 HTTP 层 */
  const assign = (service: RbacService, admin: any, roleIds?: string[]) =>
    (service as any).assertRolesAssignable(admin, roleIds)

  const roleOf = (name: string, dataScope: DataScope, codes: string[]) => ({
    id: name,
    name,
    dataScope,
    permissions: codes.map((code) => ({ permission: { code } })),
  })

  it('不传角色时直接放行', async () => {
    const service = makeService([])
    await expect(assign(service, { permissions: [], dataScope: 'OWN' })).resolves.toBeUndefined()
    await expect(assign(service, { permissions: [], dataScope: 'OWN' }, [])).resolves.toBeUndefined()
  })

  it('超管持有 * 时不做任何限制', async () => {
    const service = makeService([roleOf('R', 'ALL', ['finance:dashboard:profit'])])
    await expect(
      assign(service, { permissions: ['*'], dataScope: 'ALL' }, ['R']),
    ).resolves.toBeUndefined()
  })

  it('拒绝授予数据范围比自己更宽的角色', async () => {
    const service = makeService([roleOf('总部财务', 'ALL', ['scm:po:view'])])
    await expect(
      assign(service, { permissions: ['scm:po:view'], dataScope: 'OWN_AND_SUB' }, ['总部财务']),
    ).rejects.toThrow('无权授予数据范围更大的角色：总部财务')
  })

  it('允许授予数据范围相同或更窄的角色', async () => {
    const service = makeService([roleOf('门店员工', 'OWN', ['scm:po:view'])])
    await expect(
      assign(service, { permissions: ['scm:po:view'], dataScope: 'OWN_AND_SUB' }, ['门店员工']),
    ).resolves.toBeUndefined()
  })

  it('拒绝授予含有自己不具备权限的角色', async () => {
    const service = makeService([roleOf('采购', 'OWN', ['scm:po:view', 'scm:po:price'])])
    await expect(
      assign(service, { permissions: ['scm:po:view'], dataScope: 'OWN' }, ['采购']),
    ).rejects.toThrow('无权授予自己不具备的权限：scm:po:price')
  })

  it('自己持有模块通配时可授予该模块下的权限', async () => {
    const service = makeService([roleOf('采购', 'OWN', ['scm:po:view', 'scm:po:price'])])
    // 注意：判定用的是权限码集合的严格包含，通配符不参与展开，
    // 所以持有 'scm:*' 的人仍然授不了具体码——这是刻意的保守设计，避免通配绕过审计。
    await expect(
      assign(service, { permissions: ['scm:*'], dataScope: 'OWN' }, ['采购']),
    ).rejects.toThrow('无权授予自己不具备的权限')
  })

  it('角色 id 查不全时报无效角色，避免静默少授', async () => {
    const service = makeService([roleOf('A', 'OWN', [])])
    await expect(
      assign(service, { permissions: [], dataScope: 'OWN' }, ['A', '不存在的角色']),
    ).rejects.toThrow('存在无效角色')
  })

  it('角色 dataScope 异常取值按最严格处理', async () => {
    const service = makeService([roleOf('怪角色', 'UNKNOWN' as DataScope, [])])
    await expect(
      assign(service, { permissions: [], dataScope: 'SELF' }, ['怪角色']),
    ).resolves.toBeUndefined()
  })
})

describe('权限目录与内置角色自检', () => {
  it('权限码不重复', () => {
    const dup = ALL_PERMISSION_CODES.filter((c, i) => ALL_PERMISSION_CODES.indexOf(c) !== i)
    expect(dup).toEqual([])
  })

  it('每个权限点的 module 都在模块清单里', () => {
    const modules = new Set(PERMISSION_MODULES.map((m) => m.key))
    const orphan = PERMISSIONS.filter((p) => !modules.has(p.module)).map((p) => p.code)
    expect(orphan).toEqual([])
  })

  it('每个权限点都有中文名、分组与合法粒度', () => {
    const levels = new Set(Object.keys(PERM_LEVEL_NAMES))
    const bad = PERMISSIONS.filter((p) => !p.name || !p.group || !levels.has(p.level)).map(
      (p) => p.code,
    )
    expect(bad).toEqual([])
  })

  it('权限码统一为「模块:资源:动作」或「模块:动作」形式', () => {
    const bad = PERMISSIONS.filter((p) => !/^[a-z][a-z0-9]*(:[a-z][a-z0-9]*){1,2}$/.test(p.code)).map(
      (p) => p.code,
    )
    expect(bad).toEqual([])
  })

  it('内置角色引用的权限码都真实存在', () => {
    const known = new Set(ALL_PERMISSION_CODES)
    for (const role of BUILTIN_ROLES) {
      const unknown = role.permissions.filter((c) => c !== '*' && !known.has(c))
      expect({ role: role.name, unknown }).toEqual({ role: role.name, unknown: [] })
    }
  })

  it('内置角色的 dataScope 都是合法取值', () => {
    const scopes = new Set(DATA_SCOPES.map((s) => s.value))
    for (const role of BUILTIN_ROLES) {
      expect(scopes.has(role.dataScope)).toBe(true)
    }
  })

  it('内置角色不重名，且超管是唯一的全通角色', () => {
    const names = BUILTIN_ROLES.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
    const wildcards = BUILTIN_ROLES.filter((r) => r.permissions.includes('*')).map((r) => r.name)
    expect(wildcards).toEqual(['SUPER_ADMIN'])
  })

  it('门店店长看不到采购单价与损益表（关键越权画像）', () => {
    const manager = BUILTIN_ROLES.find((r) => r.name === 'STORE_MANAGER')!
    expect(manager.dataScope).toBe('OWN_AND_SUB')
    expect(hasPermission(manager.permissions, 'scm:po:price')).toBe(false)
    expect(hasPermission(manager.permissions, 'finance:dashboard:profit')).toBe(false)
  })

  it('分公司负责人是店长的超集：多出审批表态与采购金额，仍看不到利润明细', () => {
    const branch = BUILTIN_ROLES.find((r) => r.name === 'BRANCH_MANAGER')!
    const manager = BUILTIN_ROLES.find((r) => r.name === 'STORE_MANAGER')!
    // 范围一致：都是「本组织及下级」，分公司负责人靠 orgId 落在分公司上覆盖旗下门店
    expect(branch.dataScope).toBe(manager.dataScope)
    const missing = manager.permissions.filter((c) => !branch.permissions.includes(c))
    expect(missing).toEqual([])
    // 他是审批流「所属分公司负责人」节点的审批人，必须能表态并看到金额
    expect(hasPermission(branch.permissions, 'flow:todo:approve')).toBe(true)
    expect(hasPermission(branch.permissions, 'scm:po:price')).toBe(true)
    expect(hasPermission(manager.permissions, 'flow:todo:approve')).toBe(false)
    // 利润口径仍归总部
    expect(hasPermission(branch.permissions, 'finance:dashboard:profit')).toBe(false)
  })

  it('门店员工唯一的写权限是课程签到，且完全没有财务与采购权限', () => {
    const staff = BUILTIN_ROLES.find((r) => r.name === 'STORE_STAFF')!
    expect(staff.dataScope).toBe('OWN')
    const byCode = new Map(PERMISSIONS.map((p) => [p.code, p]))
    // 前台要给会员签到，所以留了这一个动作；多出别的写权限就是配错了
    const writable = staff.permissions.filter((c) => {
      const def = byCode.get(c)
      return def && (def.level === 'ACTION' || def.level === 'FIELD')
    })
    expect(writable).toEqual(['checkin:create'])
    const forbidden = staff.permissions.filter((c) => {
      const mod = byCode.get(c)?.module
      return mod === 'finance' || mod === 'scm'
    })
    expect(forbidden).toEqual([])
  })

  it('审计员全模块只读但可见敏感金额', () => {
    const auditor = BUILTIN_ROLES.find((r) => r.name === 'AUDITOR')!
    const byCode = new Map(PERMISSIONS.map((p) => [p.code, p]))
    const actions = auditor.permissions.filter((c) => byCode.get(c)?.level === 'ACTION')
    expect(actions).toEqual([])
    expect(hasPermission(auditor.permissions, 'scm:po:price')).toBe(true)
    expect(hasPermission(auditor.permissions, 'finance:dashboard:profit')).toBe(true)
  })

  /**
   * 首页曾整页挂 analytics:view，导致下面这几个角色一登录就吃两条无权限红字。
   * 这条测试把「首页不能依赖 analytics:view」钉住，防止有人日后又把权限门加回去。
   */
  it('首页工作台按块判权限：四个角色没有 analytics:view 也能有内容', () => {
    const roleOf = (name: string) => BUILTIN_ROLES.find((r) => r.name === name)!.permissions

    for (const name of ['HQ_PURCHASE', 'BRANCH_MANAGER', 'STORE_MANAGER', 'STORE_STAFF']) {
      expect(hasPermission(roleOf(name), 'analytics:view')).toBe(false)
      // 每个角色首页至少要有一块能看，否则首页就是一片空白
      expect(Object.values(resolveWorkbenchBlocks(roleOf(name))).some(Boolean)).toBe(true)
    }

    // 门店员工只剩课程一块：没有场地、订单、库存、财务权限
    expect(resolveWorkbenchBlocks(roleOf('STORE_STAFF'))).toEqual({
      courses: true,
      venues: false,
      orders: false,
      stock: false,
      revenue: false,
    })
    // 总部采购反过来：只有库存那块
    expect(resolveWorkbenchBlocks(roleOf('HQ_PURCHASE'))).toEqual({
      courses: false,
      venues: false,
      orders: false,
      stock: true,
      revenue: false,
    })
    // 店长/分公司负责人：课程、订单、库存、收入都在，唯独没有场地权限
    for (const name of ['STORE_MANAGER', 'BRANCH_MANAGER']) {
      expect(resolveWorkbenchBlocks(roleOf(name))).toEqual({
        courses: true,
        venues: false,
        orders: true,
        stock: true,
        revenue: true,
      })
    }
    // 超管通配全开
    expect(Object.values(resolveWorkbenchBlocks(['*'])).every(Boolean)).toBe(true)
    // 未登录或空权限不给任何块
    expect(Object.values(resolveWorkbenchBlocks([])).some(Boolean)).toBe(false)
  })
})
