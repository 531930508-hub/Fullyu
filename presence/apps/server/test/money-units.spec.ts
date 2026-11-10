import {
  isFenDenominatedOrder,
  orderAmountToFen,
  orderAmountToYuan,
  POINTS_TO_FEN_RATIO,
  POINTS_TO_YUAN_RATIO,
  voucherYuanToFen,
} from '@fullyu/shared'

describe('订单金额单位换算', () => {
  it('课程/候补订单金额列为分，会员卡为元', () => {
    expect(isFenDenominatedOrder('COURSE')).toBe(true)
    expect(isFenDenominatedOrder('WAITLIST')).toBe(true)
    expect(isFenDenominatedOrder('MEMBER_CARD')).toBe(false)
  })

  it('列值 → 分（支付网关口径）', () => {
    // 课程订单列值本身就是分，不能再乘 100（历史 bug：133 元课程被收 13300 元）
    expect(orderAmountToFen('COURSE', 13300)).toBe(13300)
    expect(orderAmountToFen('WAITLIST', 13300)).toBe(13300)
    // 会员卡列值是元，需乘 100
    expect(orderAmountToFen('MEMBER_CARD', 5980)).toBe(598000)
  })

  it('列值 → 元（展示/统计口径）', () => {
    expect(orderAmountToYuan('COURSE', 13300)).toBe(133)
    expect(orderAmountToYuan('WAITLIST', 26600)).toBe(266)
    expect(orderAmountToYuan('MEMBER_CARD', 5980)).toBe(5980)
  })

  it('积分与代金券进入课程链时按分口径放大 100 倍', () => {
    expect(POINTS_TO_YUAN_RATIO).toBe(1)
    expect(POINTS_TO_FEN_RATIO).toBe(100)
    // 50 积分 = 50 元 = 5000 分
    expect(50 * POINTS_TO_FEN_RATIO).toBe(5000)
    expect(voucherYuanToFen(50)).toBe(5000)
    expect(voucherYuanToFen(9.9)).toBe(990)
  })

  it('非法输入按 0 处理，不产生 NaN', () => {
    expect(orderAmountToFen('COURSE', Number('abc'))).toBe(0)
    expect(orderAmountToYuan('MEMBER_CARD', null as any)).toBe(0)
    expect(voucherYuanToFen(undefined as any)).toBe(0)
  })
})
