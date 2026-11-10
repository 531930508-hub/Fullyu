import { computeCommunityPaidUntil } from '../src/modules/payment/community-membership.util'

const at = (value: string) => new Date(value)

describe('社群年费有效期重算', () => {
  it('首次购买获得一年', () => {
    const paidUntil = computeCommunityPaidUntil([at('2026-01-01T04:00:00.000Z')])
    expect(paidUntil?.toISOString()).toBe('2027-01-01T04:00:00.000Z')
  })

  it('有效期内续费从原到期时间叠加一年', () => {
    const paidUntil = computeCommunityPaidUntil([
      at('2026-01-01T04:00:00.000Z'),
      at('2026-06-01T04:00:00.000Z'),
    ])
    expect(paidUntil?.toISOString()).toBe('2028-01-01T04:00:00.000Z')
  })

  it('过期后续费从本次支付时间起算', () => {
    const paidUntil = computeCommunityPaidUntil([
      at('2026-01-01T04:00:00.000Z'),
      at('2027-02-01T04:00:00.000Z'),
    ])
    expect(paidUntil?.toISOString()).toBe('2028-02-01T04:00:00.000Z')
  })

  it('退还续费订单后保留首购仍在有效期的权益', () => {
    const paidUntil = computeCommunityPaidUntil([at('2026-01-01T04:00:00.000Z')])
    expect(paidUntil?.toISOString()).toBe('2027-01-01T04:00:00.000Z')
  })

  it('退还首购订单后按剩余续费订单重算', () => {
    const paidUntil = computeCommunityPaidUntil([at('2026-06-01T04:00:00.000Z')])
    expect(paidUntil?.toISOString()).toBe('2027-06-01T04:00:00.000Z')
  })

  it('全部退款后不再拥有有效期', () => {
    expect(computeCommunityPaidUntil([])).toBeNull()
  })

  it('忽略无效时间，不产生异常有效期', () => {
    const paidUntil = computeCommunityPaidUntil([
      null,
      undefined,
      'not-a-date',
      at('2026-01-01T04:00:00.000Z'),
    ])
    expect(paidUntil?.toISOString()).toBe('2027-01-01T04:00:00.000Z')
  })
})
