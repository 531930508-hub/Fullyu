import { HttpStatus } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { CrmClient, type CrmMember } from '../src/common/crm/crm.client'
import { readCrmConfig } from '../src/common/crm/crm.config'
import { BusinessException } from '../src/common/exceptions/business.exception'
import { AuthService } from '../src/modules/auth/auth.service'
import { UserService } from '../src/modules/user/user.service'
import { startFakeCrm, type FakeCrm } from './mocks/crm-fake'

const baseEnv = {
  CRM_ENABLED: '1',
  CRM_KEY_ID: 'presence-test',
  CRM_SECRET: 'test-secret-0123456789'
}

const configOf = (env: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService

describe('CRM 接入配置与客户端（在场）', () => {
  let fake: FakeCrm

  beforeEach(async () => {
    fake = await startFakeCrm({ keyId: 'presence-test', secret: 'test-secret-0123456789' })
  })

  afterEach(async () => {
    await fake.close()
  })

  it('未配置时关闭；开启后缺地址或短密钥启动即报错', () => {
    expect(readCrmConfig({})).toBeNull()
    expect(readCrmConfig({ CRM_ENABLED: '0', CRM_BASE_URL: fake.url })).toBeNull()
    expect(() => readCrmConfig({ ...baseEnv })).toThrow(/CRM_BASE_URL/)
    expect(() => readCrmConfig({ ...baseEnv, CRM_BASE_URL: fake.url, CRM_SECRET: 'short' })).toThrow(
      /CRM_SECRET/,
    )
    expect(
      readCrmConfig({ ...baseEnv, CRM_BASE_URL: `${fake.url}/`, CRM_TIMEOUT_MS: '900' }),
    ).toEqual({
      baseUrl: fake.url,
      keyId: 'presence-test',
      secret: 'test-secret-0123456789',
      timeoutMs: 900,
    })
  })

  it('resolve 按契约签名，重复解析回到同一会员', async () => {
    const client = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    const first = await client.resolve({
      localUserId: 'u-1',
      phone: '13900003001',
      name: '在场茶客',
    })
    expect(first.created).toBe(true)
    const again = await client.resolve({ localUserId: 'u-1', phone: '13900003001' })
    expect(again.memberId).toBe(first.memberId)
    expect(fake.requests.every((item) => item.signatureOk)).toBe(true)
    expect(fake.requests[0].path).toBe('/api/external/members/resolve')
    const sent = JSON.parse(fake.requests[0].body) as Record<string, unknown>
    expect(sent).toMatchObject({ localUserId: 'u-1', phone: '13900003001', name: '在场茶客' })
    expect(sent).not.toHaveProperty('business')
  })

  it('余额读取以 CRM 为准；未同步返回 null；故障收敛为 503', async () => {
    const client = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    await client.resolve({ localUserId: 'u-2', name: '余额会员' })
    fake.members.get('u-2')!.balance = 518
    await expect(client.getByLocalUser('u-2')).resolves.toMatchObject({ balance: 518 })
    await expect(client.getByLocalUser('u-unknown')).resolves.toBeNull()

    fake.failNext = { status: 500, body: { message: '内部堆栈' } }
    const failure = await client.resolve({ localUserId: 'u-3' }).catch((error) => error)
    expect(failure).toBeInstanceOf(BusinessException)
    expect(failure).toMatchObject({ bizCode: 5030 })
    expect((failure as BusinessException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
    expect((failure as Error).message).not.toMatch(/内部堆栈/)
  })

  it('批量生日按本地用户返回；CRM 故障时降级为空表，不阻断签到', async () => {
    const client = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    fake.birthdays.set('u-b1', '1992-09-09')
    fake.birthdays.set('u-b2', null)
    const birthdays = await client.getBirthdays(['u-b1', 'u-b2', 'u-missing'])
    expect(birthdays.get('u-b1')).toBe('1992-09-09')
    expect(birthdays.get('u-b2')).toBeNull()
    expect(birthdays.has('u-missing')).toBe(false)
    const sent = JSON.parse(fake.requests[fake.requests.length - 1]!.body) as {
      localUserIds: string[]
    }
    expect(sent.localUserIds).toEqual(['u-b1', 'u-b2', 'u-missing'])

    fake.failNext = { status: 500, body: { message: '内部堆栈' } }
    await expect(client.getBirthdays(['u-b1'])).resolves.toEqual(new Map())
  })

  it('资料回写：已建档按字段覆盖，未建档返回 NOT_SYNCED 由调用方补建档', async () => {
    const client = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    await client.resolve({ localUserId: 'u-p1', name: '资料会员' })
    await expect(
      client.updateProfile('u-p1', { name: '新昵称', gender: 2, birthday: '1995-03-08' }),
    ).resolves.toBe('UPDATED')
    expect(fake.profiles.get('u-p1')).toEqual({
      name: '新昵称',
      gender: 2,
      birthday: '1995-03-08',
    })
    expect(fake.birthdays.get('u-p1')).toBe('1995-03-08')
    const sent = JSON.parse(fake.requests[fake.requests.length - 1]!.body) as Record<string, unknown>
    expect(sent).toMatchObject({ localUserId: 'u-p1', name: '新昵称', gender: 2 })
    expect(fake.requests.every((item) => item.signatureOk)).toBe(true)

    await expect(client.updateProfile('u-absent', { gender: 1 })).resolves.toBe('NOT_SYNCED')

    fake.failNext = { status: 500, body: { message: '内部堆栈' } }
    await expect(client.updateProfile('u-p1', { gender: 1 })).rejects.toMatchObject({ bizCode: 5030 })
  })

  it('身份冲突返回 409 业务码，由顾客联系客服', async () => {
    const client = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    fake.failNext = { status: 409, body: { error: 'CONFLICT' } }
    const failure = await client.resolve({ localUserId: 'u-4' }).catch((error) => error)
    expect(failure).toBeInstanceOf(BusinessException)
    expect(failure).toMatchObject({ bizCode: 4090 })
    expect((failure as BusinessException).getStatus()).toBe(HttpStatus.CONFLICT)
  })
})

describe('在场业务接入点', () => {
  let fake: FakeCrm

  beforeEach(async () => {
    fake = await startFakeCrm({ keyId: 'presence-test', secret: 'test-secret-0123456789' })
  })

  afterEach(async () => {
    await fake.close()
  })

  it('登录后解析 CRM 身份；CRM 故障降级登录，身份冲突仍阻断', async () => {
    const crm = new CrmClient(
      configOf({ ...baseEnv, CRM_BASE_URL: fake.url }),
    )
    const user = {
      id: 'u-login',
      phone: '13900003002',
      nickname: '登录会员',
      avatar: null,
      isTrainer: false,
      openId: 'openid-1',
      unionId: 'unionid-1',
    }
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn(),
        create: jest.fn(),
      },
    }
    const jwt: any = { sign: jest.fn().mockReturnValue('token-1') }
    const wechat: any = {
      code2Session: jest.fn().mockResolvedValue({ openid: user.openId, unionid: user.unionId }),
      getPhoneNumber: jest.fn().mockResolvedValue(user.phone),
    }
    const service = new AuthService(
      prisma,
      jwt,
      configOf({}),
      wechat,
      {} as any,
      crm,
    )

    const result = await service.wechatPhoneLogin('login-code', 'phone-code')
    expect(result.token).toBe('token-1')
    expect(result.memberSync).toBe('live')
    const sent = JSON.parse(fake.requests[0].body) as Record<string, unknown>
    expect(sent).toMatchObject({
      localUserId: user.id,
      phone: user.phone,
      name: user.nickname,
      unionId: user.unionId,
    })

    // CRM 挂了不能挡住登录：照常签发 token，前端按 memberSync=degraded 展示「同步中」。
    fake.failNext = { status: 503, body: { message: 'down' } }
    const degraded = await service.wechatPhoneLogin('login-code-2', 'phone-code-2')
    expect(degraded.token).toBe('token-1')
    expect(degraded.memberSync).toBe('degraded')
    expect(jwt.sign).toHaveBeenCalledTimes(2)

    // 身份冲突（409）是唯一必须让顾客看到的 CRM 报错：带着两份档案继续下单会把积分记错人。
    fake.failNext = { status: 409, body: { error: 'CONFLICT' } }
    await expect(service.wechatPhoneLogin('login-code-3', 'phone-code-3')).rejects.toMatchObject({
      bizCode: 4090,
    })
    expect(jwt.sign).toHaveBeenCalledTimes(2)
  })

  it('积分余额读取 CRM；未同步时补一次解析；关闭时沿用本地记录', async () => {
    const crm = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    await crm.resolve({ localUserId: 'u-points', name: '积分会员' })
    fake.members.get('u-points')!.balance = 620

    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u-points',
          phone: '13900003003',
          nickname: '积分会员',
          unionId: null,
          openId: null,
        }),
      },
      pointsRecord: { findFirst: jest.fn().mockResolvedValue({ balance: 5 }) },
    }
    const service = new UserService(prisma, crm)
    await expect(service.getPointsBalance('u-points')).resolves.toBe(620)

    const unsynced: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u-new',
          phone: '13900003004',
          nickname: '新会员',
          unionId: null,
          openId: null,
        }),
      },
      pointsRecord: { findFirst: jest.fn() },
    }
    const created = await new UserService(unsynced, crm).getPointsBalance('u-new')
    expect(created).toBe(0)
    expect(fake.members.has('u-new')).toBe(true)

    const disabled = new UserService(
      {
        user: { findUnique: jest.fn() },
        pointsRecord: { findFirst: jest.fn().mockResolvedValue({ balance: 77 }) },
      } as any,
      { enabled: false } as unknown as CrmClient,
    )
    await expect(disabled.getPointsBalance('u-old')).resolves.toBe(77)
  })

  it('资料编辑先写 CRM 再写本地；未建档时补一次 resolve 建档', async () => {
    const crm = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u-edit',
          phone: '13900003006',
          nickname: '旧名',
          avatar: null,
          gender: null,
          birthday: null,
          unionId: null,
          openId: null,
        }),
        update: jest.fn(async ({ data }: any) => ({ id: 'u-edit', photo: null, ...data })),
      },
    }
    const service = new UserService(prisma, crm)
    await service.updateProfile('u-edit', {
      nickname: '新名',
      gender: 1,
      birthday: '1990-05-06',
      avatar: 'https://cdn.example.com/me.jpg',
    })

    // 老会话还没建档：先 resolve 再写，建档时带上本次的新值
    expect(fake.members.get('u-edit')).toMatchObject({
      name: '新名',
      gender: 1,
      birthday: '1990-05-06',
      avatarUrl: 'https://cdn.example.com/me.jpg',
    })
    const stored = prisma.user.update.mock.calls[0][0].data
    // 生日按 +08 当天 0 点存，避免跨时区变成前一天
    expect((stored.birthday as Date).toISOString()).toBe('1990-05-05T16:00:00.000Z')

    await expect(service.updateProfile('u-edit', { gender: 3 })).rejects.toThrow(/性别/)
    await expect(service.updateProfile('u-edit', { birthday: '2999-01-01' })).rejects.toThrow(/生日/)
  })

  it('CRM 写资料失败时整单失败，不落本地库（否则出现两边不一致）', async () => {
    const crm = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    await crm.resolve({ localUserId: 'u-fail', name: '失败会员' })
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u-fail',
          phone: '13900003007',
          nickname: '失败会员',
          avatar: null,
          gender: null,
          birthday: null,
          unionId: null,
          openId: null,
        }),
        update: jest.fn(),
      },
    }
    fake.failNext = { status: 500, body: { message: '内部堆栈' } }
    await expect(
      new UserService(prisma, crm).updateProfile('u-fail', { gender: 2 }),
    ).rejects.toMatchObject({ bizCode: 5030 })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('拒绝返回不符合契约的余额数据，避免前端显示 NaN', async () => {
    const client = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    fake.failNext = {
      status: 200,
      body: { memberId: 'm', memberNo: 'FY', name: 'x', balance: 'not-a-number' } as unknown as CrmMember,
    }
    await expect(client.resolve({ localUserId: 'u-bad' })).rejects.toMatchObject({ bizCode: 5030 })
  })
})
