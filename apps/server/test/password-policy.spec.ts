/**
 * 密码策略单元测试
 *
 * 同样不走 Nest Testing module：PasswordPolicyService 只依赖 ConfigService 的
 * get(key)，手工塞一个假的即可。重点验证两件事：
 *   1. 策略开启时按配置逐条拦截；
 *   2. 策略关闭时除空密码外全部放过，且不再强制首次登录改密（测试阶段诉求）。
 */
import { DEFAULT_PASSWORD_POLICY, checkPassword, passwordHint } from '@fullyu/shared'
import { PasswordPolicyService } from '../src/common/password-policy.service'

/** 用一份 env 键值造出 service，未列出的键走默认值 */
function makeService(env: Record<string, string> = {}) {
  const configService = { get: (key: string) => env[key] } as any
  return new PasswordPolicyService(configService)
}

describe('checkPassword（共享规则）', () => {
  it('空密码始终被拦，即使策略整体关闭', () => {
    expect(checkPassword('', DEFAULT_PASSWORD_POLICY)).toBe('请输入新密码')
    expect(checkPassword('', { ...DEFAULT_PASSWORD_POLICY, enabled: false })).toBe('请输入新密码')
  })

  it('策略关闭后任意非空密码都通过', () => {
    const policy = {
      ...DEFAULT_PASSWORD_POLICY,
      enabled: false,
      minLength: 12,
      requireLetter: true,
      requireNumber: true,
      requireSymbol: true,
    }
    expect(checkPassword('1', policy)).toBeNull()
  })

  it('逐条规则各自生效', () => {
    expect(checkPassword('12345', DEFAULT_PASSWORD_POLICY)).toBe('密码至少 6 位')
    expect(checkPassword('123456', DEFAULT_PASSWORD_POLICY)).toBeNull()
    expect(checkPassword('123456', { ...DEFAULT_PASSWORD_POLICY, requireLetter: true })).toBe(
      '密码必须包含字母',
    )
    expect(checkPassword('abcdef', { ...DEFAULT_PASSWORD_POLICY, requireNumber: true })).toBe(
      '密码必须包含数字',
    )
    expect(checkPassword('abc123', { ...DEFAULT_PASSWORD_POLICY, requireSymbol: true })).toBe(
      '密码必须包含符号',
    )
    expect(checkPassword('abc123!', { ...DEFAULT_PASSWORD_POLICY, requireSymbol: true })).toBeNull()
  })

  it('提示文案随策略变化', () => {
    expect(passwordHint({ ...DEFAULT_PASSWORD_POLICY, enabled: false })).toContain('未启用')
    expect(
      passwordHint({ ...DEFAULT_PASSWORD_POLICY, requireLetter: true, requireNumber: true }),
    ).toBe('至少 6 位，需含字母、数字')
  })
})

describe('PasswordPolicyService', () => {
  it('不配任何环境变量时沿用默认策略', () => {
    const svc = makeService()
    expect(svc.get()).toEqual(DEFAULT_PASSWORD_POLICY)
    expect(svc.shouldForceChange()).toBe(true)
    expect(() => svc.assertValid('12345')).toThrow()
    expect(() => svc.assertValid('123456')).not.toThrow()
  })

  it('测试阶段关掉总开关：不校验强度、不强制改密，但仍拦空密码', () => {
    const svc = makeService({ PASSWORD_POLICY_ENABLED: 'false' })
    expect(svc.get().enabled).toBe(false)
    expect(svc.shouldForceChange()).toBe(false)
    expect(() => svc.assertValid('1')).not.toThrow()
    expect(() => svc.assertValid('')).toThrow()
  })

  it('按环境变量收紧规则', () => {
    const svc = makeService({
      PASSWORD_MIN_LENGTH: '10',
      PASSWORD_REQUIRE_LETTER: 'true',
      PASSWORD_REQUIRE_NUMBER: 'true',
    })
    expect(svc.get().minLength).toBe(10)
    expect(() => svc.assertValid('abc123')).toThrow()
    expect(() => svc.assertValid('abcdefg123')).not.toThrow()
  })

  it('总开关开着但关掉首登改密时不再强制', () => {
    const svc = makeService({ PASSWORD_FORCE_CHANGE_ON_FIRST_LOGIN: 'false' })
    expect(svc.get().enabled).toBe(true)
    expect(svc.shouldForceChange()).toBe(false)
  })

  it('非法数字配置回退默认值，不会把最小长度弄成 NaN', () => {
    const svc = makeService({ PASSWORD_MIN_LENGTH: 'abc' })
    expect(svc.get().minLength).toBe(DEFAULT_PASSWORD_POLICY.minLength)
  })

  it('describe 附带给前端展示的提示文案', () => {
    const svc = makeService({ PASSWORD_POLICY_ENABLED: 'false' })
    expect(svc.describe().hint).toContain('未启用')
  })
})
