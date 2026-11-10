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

  it('登录后解析 CRM 身份；CRM 故障阻断登录并沿用业务错误码', async () => {
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
    const sent = JSON.parse(fake.requests[0].body) as Record<string, unknown>
    expect(sent).toMatchObject({
      localUserId: user.id,
      phone: user.phone,
      name: user.nickname,
      unionId: user.unionId,
    })

    fake.failNext = { status: 503, body: { message: 'down' } }
    await expect(service.wechatPhoneLogin('login-code-2', 'phone-code-2')).rejects.toMatchObject({
      bizCode: 5030
    })
    // 失败时不签发 token，避免带着未同步身份进入下单链路。
    expect(jwt.sign).toHaveBeenCalledTimes(1)
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

  it('拒绝返回不符合契约的余额数据，避免前端显示 NaN', async () => {
    const client = new CrmClient(configOf({ ...baseEnv, CRM_BASE_URL: fake.url }))
    fake.failNext = {
      status: 200,
      body: { memberId: 'm', memberNo: 'FY', name: 'x', balance: 'not-a-number' } as unknown as CrmMember,
    }
    await expect(client.resolve({ localUserId: 'u-bad' })).rejects.toMatchObject({ bizCode: 5030 })
  })
})
