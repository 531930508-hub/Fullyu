/**
 * 系统账号单元测试
 *
 * 对应本次改动的三件事：
 *   1. 登录账号统一用手机号（新建/改号的格式与唯一性校验、username 与 phone 同步）
 *   2. 人员下拉 listAdminOptions 的展示文本与行级范围约束
 *   3. 旧 token（缺 dataScope）判失效 —— 之前它被兜成 SELF，导致各列表静默变空
 *
 * 与 permission.spec.ts 一样刻意不走 Nest Testing module：手工注入假 prisma 即可，
 * 跑得快，也不受 legacy 集成测试脚手架的 DI 问题牵连。
 */
import { UnauthorizedException } from '@nestjs/common'
import { RbacService } from '../src/modules/rbac/rbac.service'
import { AdminJwtStrategy, type AdminJwtPayload } from '../src/modules/auth/admin-jwt.strategy'

/** 超管上下文：不受行级范围限制 */
const superAdmin: any = { adminId: 'a0', username: 'admin', dataScope: 'ALL', orgId: null }

describe('手机号即登录账号', () => {
  /** 只暴露被测方法需要的 prisma 面，其余留空让越界调用直接炸出来 */
  function makeService(opts: {
    existing?: any
    organizations?: any[]
    role?: any[]
  } = {}) {
    const created: any[] = []
    const prisma: any = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
        create: jest.fn(async ({ data }: any) => {
          created.push(data)
          return { id: 'new-id', ...data }
        }),
      },
      organization: {
        findMany: jest.fn().mockResolvedValue(opts.organizations ?? []),
        findUnique: jest.fn(async ({ where }: any) => ({ id: where.id })),
      },
      role: { findMany: jest.fn().mockResolvedValue(opts.role ?? []) },
    }
    return { service: new RbacService(prisma), prisma, created }
  }

  const normalize = (service: RbacService, phone?: string) =>
    (service as any).normalizePhoneAsUsername(phone)

  it('合法手机号原样返回，并容忍首尾空格（复制粘贴很容易带上）', () => {
    const { service } = makeService()
    expect(normalize(service, '13900001011')).toBe('13900001011')
    expect(normalize(service, '  13900001011  ')).toBe('13900001011')
  })

  it('位数不对、号段不对、含非数字、留空都拒绝', () => {
    const { service } = makeService()
    for (const bad of ['1390000101', '139000010112', '12900001011', '1390000101a', '', undefined]) {
      expect(() => normalize(service, bad as any)).toThrow(/手机号/)
    }
  })

  it('createAdmin 用手机号当登录名，username 与 phone 落库一致', async () => {
    const { service, created } = makeService()
    await service.createAdmin(superAdmin, {
      phone: '13900003012',
      password: 'Demo@123456',
      name: '陈璐',
      orgId: 'S003',
    })
    expect(created).toHaveLength(1)
    expect(created[0].username).toBe('13900003012')
    expect(created[0].phone).toBe('13900003012')
  })

  it('createAdmin 兼容只传 username 的旧写法，但仍必须是手机号', async () => {
    const { service, created } = makeService()
    await service.createAdmin(superAdmin, {
      username: '13900003011',
      password: 'Demo@123456',
      name: '孙晓芸',
      orgId: 'S003',
    })
    expect(created[0].username).toBe('13900003011')

    const bad = makeService()
    await expect(
      bad.service.createAdmin(superAdmin, {
        username: 'store_th',
        password: 'Demo@123456',
        name: '孙晓芸',
        orgId: 'S003',
      }),
    ).rejects.toThrow(/手机号/)
  })

  it('createAdmin 手机号被占用时报「已被占用」，不再落库', async () => {
    const { service, prisma } = makeService({ existing: { id: 'old', username: '13900003011' } })
    await expect(
      service.createAdmin(superAdmin, {
        phone: '13900003011',
        password: 'Demo@123456',
        name: '重名的人',
        orgId: 'S003',
      }),
    ).rejects.toThrow(/占用/)
    expect(prisma.adminUser.create).not.toHaveBeenCalled()
  })
})

describe('updateAdmin 改手机号 = 改登录账号', () => {
  /**
   * updateAdmin 走事务，这里让 $transaction 直接把回调跑在同一个假 prisma 上，
   * 便于断言最终下发给 update 的字段。
   */
  function makeService(target: any, taken: any = null) {
    const updates: any[] = []
    const prisma: any = {
      adminUser: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id ? target : where.username === taken?.username ? taken : null,
        ),
        update: jest.fn(async ({ data }: any) => {
          updates.push(data)
          return { ...target, ...data }
        }),
      },
      adminUserRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      organization: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(async ({ where }: any) => ({ id: where.id })),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: (fn: any) => fn(prisma),
    }
    return { service: new RbacService(prisma), updates }
  }

  const target = { id: 'u1', username: '13900002011', orgId: 'S002' }

  it('手机号没变时不动 username / phone，避免无谓的账号变更', async () => {
    const { service, updates } = makeService(target)
    await service.updateAdmin(superAdmin, 'u1', { name: '王海涛', phone: '13900002011' })
    expect(updates[0].username).toBeUndefined()
    expect(updates[0].phone).toBeUndefined()
    expect(updates[0].name).toBe('王海涛')
  })

  it('手机号变了则 username 与 phone 一起换，否则下次登录会对不上', async () => {
    const { service, updates } = makeService(target)
    await service.updateAdmin(superAdmin, 'u1', { phone: '13900002099' })
    expect(updates[0].username).toBe('13900002099')
    expect(updates[0].phone).toBe('13900002099')
  })

  it('换到别人已占用的手机号要拒绝', async () => {
    const { service } = makeService(target, { id: 'u9', username: '13900002012' })
    await expect(service.updateAdmin(superAdmin, 'u1', { phone: '13900002012' })).rejects.toThrow(
      /占用/,
    )
  })

  it('存量非手机号账号（如 admin）不传 phone 时可以正常改别的字段', async () => {
    const legacy = { id: 'u0', username: 'admin', orgId: null }
    const { service, updates } = makeService(legacy)
    await service.updateAdmin(superAdmin, 'u0', { name: '超级管理员' })
    expect(updates[0].username).toBeUndefined()
    expect(updates[0].name).toBe('超级管理员')
  })
})

describe('listAdminOptions 人员下拉', () => {
  const rows = [
    { id: 'u1', username: '13900000002', name: '周雅琪', orgId: 'D-FIN', org: { shortName: '财务部' } },
    { id: 'u2', username: '13900001011', name: '李文静', orgId: 'S001', org: { shortName: '福田店' } },
    // 纯技术超管账号没绑组织
    { id: 'u3', username: 'admin', name: '超级管理员', orgId: null, org: null },
  ]

  function makeService(organizations: any[] = []) {
    const prisma: any = {
      adminUser: { findMany: jest.fn().mockResolvedValue(rows) },
      organization: { findMany: jest.fn().mockResolvedValue(organizations) },
    }
    return { service: new RbacService(prisma), prisma }
  }

  it('存值用 username（手机号），展示文本为「组织·姓名」', async () => {
    const { service } = makeService()
    const list = await service.listAdminOptions(superAdmin)
    expect(list.map((o) => o.value)).toEqual(['13900000002', '13900001011', 'admin'])
    expect(list[0].label).toBe('财务部·周雅琪')
    expect(list[1].label).toBe('福田店·李文静')
  })

  it('未绑组织的人不拼前缀，避免出现「·超级管理员」这种残形', async () => {
    const { service } = makeService()
    const list = await service.listAdminOptions(superAdmin)
    expect(list[2].label).toBe('超级管理员')
  })

  it('ALL 范围不带组织条件；受限范围按可见组织过滤', async () => {
    const { service, prisma } = makeService()
    await service.listAdminOptions(superAdmin)
    expect(prisma.adminUser.findMany.mock.calls[0][0].where).toEqual({ isActive: true })

    const limited = makeService([
      { id: 'C001', parentId: 'HQ' },
      { id: 'S001', parentId: 'C001' },
    ])
    await limited.service.listAdminOptions({
      adminId: 'a1',
      username: '13900001001',
      orgId: 'C001',
      dataScope: 'OWN_AND_SUB',
    } as any)
    const where = limited.prisma.adminUser.findMany.mock.calls[0][0].where
    expect(where.isActive).toBe(true)
    expect(where.orgId).toEqual({ in: ['C001', 'S001'] })
  })

  it('只取启用中的账号，离职停用的人不该出现在审批人候选里', async () => {
    const { service, prisma } = makeService()
    await service.listAdminOptions(superAdmin)
    expect(prisma.adminUser.findMany.mock.calls[0][0].where.isActive).toBe(true)
  })
})

describe('旧 token 判失效（修「列表静默变空」）', () => {
  const strategy = Object.create(AdminJwtStrategy.prototype) as AdminJwtStrategy

  const payload = (extra: Partial<AdminJwtPayload> = {}) =>
    ({
      sub: 'u1',
      username: '13900001011',
      type: 'admin',
      permissions: ['scm:po:view'],
      ...extra,
    }) as AdminJwtPayload

  it('缺 dataScope 的历史 token 直接 401，而不是兜成 SELF 查出空列表', async () => {
    await expect(strategy.validate(payload())).rejects.toThrow(UnauthorizedException)
    await expect(strategy.validate(payload())).rejects.toThrow(/重新登录/)
  })

  it('带 dataScope 的新 token 正常放行，orgId 缺失按 null 处理', async () => {
    const ctx = await strategy.validate(payload({ dataScope: 'ALL' }))
    expect(ctx.dataScope).toBe('ALL')
    expect(ctx.orgId).toBeNull()
    expect(ctx.username).toBe('13900001011')
  })

  it('非 admin 类型的令牌照旧拒绝', async () => {
    await expect(
      strategy.validate(payload({ type: 'user' as any, dataScope: 'ALL' })),
    ).rejects.toThrow(/无效的管理员令牌/)
  })
})
