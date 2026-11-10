/**
 * 畅练卡本期节省统计单测
 *
 * 复购提示只在临期时展示节省，数据由 /member/active?stats=1 提供。
 * 约束：
 * - 默认（首页/个人页）不带 stats，不能多跑聚合查询；
 * - 只统计卡期内用畅练卡支付的课程订单（cardType 有值），不混入品牌会员价订单；
 * - 无有效卡时返回 null，不查订单。
 */
import { MemberService } from '../src/modules/member/member.service'

type Card = {
  id: string
  type: string
  status: string
  startDate: Date
  endDate: Date
}

function makeService(card: Card | null, aggregateResult: any) {
  let aggregateCalls = 0
  const prisma: any = {
    memberCard: {
      findFirst: async () => card,
    },
    order: {
      aggregate: async (args: any) => {
        aggregateCalls += 1
        return aggregateResult
      },
    },
  }
  return {
    service: new MemberService(prisma, {} as any),
    aggregateCalls: () => aggregateCalls,
  }
}

const CARD: Card = {
  id: 'card-1',
  type: 'QUARTERLY',
  status: 'ACTIVE',
  startDate: new Date('2026-10-01T00:00:00+08:00'),
  endDate: new Date('2026-12-30T00:00:00+08:00'),
}

describe('畅练卡本期节省统计', () => {
  it('不带 stats 时只返回卡本身，不跑聚合', async () => {
    const { service, aggregateCalls } = makeService(CARD, {
      _sum: { discountAmount: 12345 },
      _count: { _all: 3 },
    })

    const result = await service.activeCard('u-1')

    expect(result).toEqual(CARD)
    expect(aggregateCalls()).toBe(0)
  })

  it('带 stats 时返回本期节省（分）与报课次数', async () => {
    const { service, aggregateCalls } = makeService(CARD, {
      _sum: { discountAmount: 89700 },
      _count: { _all: 4 },
    })

    const result = (await service.activeCard('u-1', { withStats: true })) as any

    expect(aggregateCalls()).toBe(1)
    expect(result.id).toBe('card-1')
    expect(result.stats).toEqual({ savedCents: 89700, classCount: 4 })
  })

  it('金额为空或为负时收敛为 0，避免展示负数节省', async () => {
    const empty = makeService(CARD, { _sum: { discountAmount: null }, _count: { _all: 0 } })
    const negative = makeService(CARD, { _sum: { discountAmount: -1 }, _count: { _all: 0 } })

    expect(((await empty.service.activeCard('u-1', { withStats: true })) as any).stats.savedCents).toBe(0)
    expect(((await negative.service.activeCard('u-1', { withStats: true })) as any).stats.savedCents).toBe(0)
  })

  it('没有有效卡时返回 null，不查订单', async () => {
    const { service, aggregateCalls } = makeService(null, {
      _sum: { discountAmount: 100 },
      _count: { _all: 1 },
    })

    expect(await service.activeCard('u-1', { withStats: true })).toBeNull()
    expect(aggregateCalls()).toBe(0)
  })
})
