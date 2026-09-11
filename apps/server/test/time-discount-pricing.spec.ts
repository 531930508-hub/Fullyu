/**
 * 时段折扣接入 PricingService 的金额单位口径测试。
 *
 * 课程链路的钱（course.originalPrice、coursePriceTier.price、order 各金额列）在库里是「分」
 * （实测 36000 = ¥360，后台 sales/order 页也按 orderType 区分分/元展示），
 * 而后台时段规则里配置的 fixedPrices.price 是「元」（运营按 133/266/399 录入）。
 * 两者在 getMemberDiscount 里相遇，换算错一次就是 100 倍差价，属于必须拦住的回归。
 * 只用桩对象注入 Prisma，不起 Nest 容器。
 */
import { PricingService } from '../src/modules/pricing/pricing.service'

const BASE_PRICE_FEN = 36000 // ¥360 的课程
const SAT_1530 = new Date(2026, 8, 5, 15, 30) // 周六下午

/** 规则行桩：字段形态与 Prisma 读出的一致 */
function row(over: Record<string, any> = {}) {
  return {
    id: 'r1',
    name: '规则',
    orgIds: [],
    cardTypes: [],
    priority: 0,
    weekdays: [],
    timeRanges: [],
    validFrom: null,
    validTo: null,
    actionType: 'PERCENT',
    discountPercent: 90,
    fixedPrices: null,
    status: 'ENABLED',
    ...over,
  }
}

/** Prisma 桩：默认年卡会员 + S1 门店 + 60 分钟课程 + 无固定折扣 */
function svc(over: Record<string, any> = {}, rules: any[] = []) {
  return new PricingService({
    memberCard: { findFirst: async () => ({ id: 'card1', type: 'YEARLY' }) },
    course: { findUnique: async () => ({ duration: 60, venue: { orgId: 'S1' } }) },
    memberTimeDiscountRule: { findMany: async () => rules },
    courseMemberDiscount: { findUnique: async () => null },
    ...over,
  } as any)
}

describe('PricingService.getMemberDiscount：时段折扣', () => {
  it('FIXED_BY_DURATION：规则价按元配置，与分为单位的 basePrice 换算后相减', async () => {
    const res = await svc(
      {},
      [
        row({
          id: 'r-fixed',
          name: '轻疗时长价',
          weekdays: [6, 7],
          timeRanges: [{ start: '14:00', end: '18:00' }],
          actionType: 'FIXED_BY_DURATION',
          discountPercent: null,
          fixedPrices: [
            { minutes: 30, price: 133 },
            { minutes: 60, price: 266 },
            { minutes: 90, price: 399 },
          ],
        }),
      ],
    ).getMemberDiscount('u1', 'c1', BASE_PRICE_FEN, SAT_1530)

    // ¥266 = 26600 分，抵扣 = 36000 - 26600 = 9400 分
    expect(res.discountAmount).toBe(9400)
    expect(res.hitTimeRuleId).toBe('r-fixed')
    // 回传给前端展示的仍是元，调用方不应再除 100
    expect(res.timeDiscount?.fixedPrice).toBe(266)
    expect(res.discountPercent).toBeNull()
  })

  it('PERCENT >100：峰时加价，抵扣为负数（百分比与单位无关）', async () => {
    const res = await svc({}, [row({ id: 'r-peak', discountPercent: 115 })]).getMemberDiscount(
      'u1',
      'c1',
      BASE_PRICE_FEN,
      SAT_1530,
    )
    expect(res.discountPercent).toBe(115)
    expect(res.discountAmount).toBe(-5400) // 36000 * (1 - 1.15)
    expect(res.hitTimeRuleId).toBe('r-peak')
  })

  it('显式门店规则优先于全局兜底，与 priority 无关', async () => {
    const rules = [
      row({ id: 'r-global', name: '全局兜底', priority: 0, discountPercent: 70 }),
      row({ id: 'r-store', name: '来福士专属', orgIds: ['S1'], priority: 9, discountPercent: 100 }),
    ]
    expect((await svc({}, rules).getMemberDiscount('u1', 'c1', BASE_PRICE_FEN, SAT_1530)).hitTimeRuleId).toBe('r-store')

    const otherStore = svc({ course: { findUnique: async () => ({ duration: 60, venue: { orgId: 'S2' } }) } }, rules)
    expect((await otherStore.getMemberDiscount('u1', 'c1', BASE_PRICE_FEN, SAT_1530)).hitTimeRuleId).toBe('r-global')

    // 场地未挂门店（orgId=null）只能命中全局规则
    const noOrg = svc({ course: { findUnique: async () => ({ duration: 60, venue: { orgId: null } }) } }, rules)
    expect((await noOrg.getMemberDiscount('u1', 'c1', BASE_PRICE_FEN, SAT_1530)).hitTimeRuleId).toBe('r-global')
  })

  it('时长不在价目表 → 视为未命中，回退课程固定折扣', async () => {
    const res = await svc(
      {
        course: { findUnique: async () => ({ duration: 45, venue: { orgId: 'S1' } }) },
        courseMemberDiscount: { findUnique: async () => ({ discountPercent: 70 }) },
      },
      [
        row({
          id: 'r-fixed',
          actionType: 'FIXED_BY_DURATION',
          discountPercent: null,
          fixedPrices: [{ minutes: 60, price: 266 }],
        }),
      ],
    ).getMemberDiscount('u1', 'c1', BASE_PRICE_FEN, SAT_1530)

    expect(res.hitTimeRuleId).toBeNull()
    expect(res.timeDiscount).toBeNull()
    expect(res.discountPercent).toBe(70)
    expect(res.discountAmount).toBe(10800) // 36000 * 0.3
  })

  it('无时段规则时保持原有固定折扣行为；无有效会员卡则无折扣', async () => {
    const fallback = await svc({
      courseMemberDiscount: { findUnique: async () => ({ discountPercent: 85 }) },
    }).getMemberDiscount('u1', 'c1', BASE_PRICE_FEN, SAT_1530)
    expect(fallback).toEqual({
      cardType: 'YEARLY',
      discountPercent: 85,
      discountAmount: 5400, // 36000 * 0.15
      hitTimeRuleId: null,
      timeDiscount: null,
    })

    const noCard = await svc({ memberCard: { findFirst: async () => null } }).getMemberDiscount(
      'u1',
      'c1',
      BASE_PRICE_FEN,
      SAT_1530,
    )
    expect(noCard).toEqual({
      cardType: null,
      discountPercent: null,
      discountAmount: 0,
      hitTimeRuleId: null,
      timeDiscount: null,
    })
  })

  it('courseStartAt：startDate + startTime 拼出判定用的开课时刻', () => {
    const at = svc().courseStartAt({ startDate: new Date(2026, 8, 5), startTime: '15:30' })
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate()]).toEqual([2026, 9, 5])
    expect([at.getHours(), at.getMinutes()]).toEqual([15, 30])
    // startTime 缺失时退化为 00:00，不抛异常
    expect(svc().courseStartAt({ startDate: new Date(2026, 8, 5), startTime: '' }).getHours()).toBe(0)
  })
})
