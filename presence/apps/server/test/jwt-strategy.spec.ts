/**
 * 用户 JWT 策略单元测试
 *
 * 场景来自线上事故：换库 / 重建账号后，旧 token 的签名仍然有效（各环境共用同一个
 * 占位 JWT_SECRET），但 sub 指向的 users 行已经没了。以前这种请求会被放行，
 * /user/profile 于是返回 data:null，小程序只能报「资料加载失败」，点重试永远失败，
 * 积分和订单还静默变成 0 / 空数组。
 *
 * 这里锁住行为：签名有效但账号查无此人 → 401（客户端据此清登录态、重新登录）。
 * 不走 Nest Testing module：JwtStrategy 只依赖 ConfigService.get 和 prisma.user.findUnique。
 */
import { UnauthorizedException } from '@nestjs/common'
import { JwtStrategy } from '../src/modules/auth/jwt.strategy'

function makeStrategy(findUnique: (args: any) => Promise<any>) {
  const configService = {
    get: (key: string) => (key === 'JWT_SECRET' ? 'test-secret' : undefined),
  } as any
  const prisma = { user: { findUnique } } as any
  return new JwtStrategy(configService, prisma)
}

const payload = (sub: string) => ({ sub, phone: '13817901671', isTrainer: false })

describe('JwtStrategy（小程序用户）', () => {
  it('账号还在时按载荷透传，不多查字段', async () => {
    const calls: any[] = []
    const strategy = makeStrategy(async (args) => {
      calls.push(args)
      return { id: args.where.id }
    })

    await expect(strategy.validate(payload('u1'))).resolves.toEqual({
      userId: 'u1',
      phone: '13817901671',
      isTrainer: false,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ where: { id: 'u1' }, select: { id: true } })
  })

  it('旧 token 指向已不存在的账号 → 401，而不是放行后返回空资料', async () => {
    const strategy = makeStrategy(async () => null)
    await expect(strategy.validate(payload('deleted-user'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('载荷缺 sub → 401，且不白查一次库', async () => {
    let queried = false
    const strategy = makeStrategy(async () => {
      queried = true
      return null
    })
    await expect(strategy.validate(payload(''))).rejects.toBeInstanceOf(UnauthorizedException)
    expect(queried).toBe(false)
  })
})