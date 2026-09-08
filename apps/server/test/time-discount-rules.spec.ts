/**
 * 会员卡分时段折扣：共享匹配规则单元测试。
 * 命中判定收敛在 packages/shared，后端锁价与后台"一周总览预览"各调一次，
 * 必须给出同一个答案。只测纯函数，不起 Nest 容器（同 batch2-rules.spec.ts 口径）。
 */
import {
  parseHHmm,
  pickTimeDiscountRule,
  weekdayOf,
  type TimeDiscountRuleLike,
} from '@fullyu/shared'

function rule(over: Partial<TimeDiscountRuleLike> = {}): TimeDiscountRuleLike {
  return {
    id: 'r1',
    name: 'r1',
    orgIds: [],
    cardTypes: [],
    priority: 1,
    weekdays: [],
    timeRanges: [],
    validFrom: null,
    validTo: null,
    actionType: 'PERCENT',
    discountPercent: 90,
    fixedPrices: null,
    enabled: true,
    ...over,
  }
}

// 2026-09-05 周六、09-06 周日、09-07 周一、09-08 周二、2026-10-01 周四（国庆）
const SAT_1530 = new Date(2026, 8, 5, 15, 30)
const SAT_1359 = new Date(2026, 8, 5, 13, 59)
const SAT_1800 = new Date(2026, 8, 5, 18, 0)
const MON_1530 = new Date(2026, 8, 7, 15, 30)

function ctx(over: Partial<Parameters<typeof pickTimeDiscountRule>[1]> = {}) {
  return { orgId: 'S1', cardType: 'YEARLY', appointmentStart: SAT_1530, durationMinutes: 60, ...over }
}

describe('基础工具', () => {
  it('weekdayOf：周一=1 … 周日=7', () => {
    expect(weekdayOf(new Date(2026, 8, 7))).toBe(1) // 周一
    expect(weekdayOf(SAT_1530)).toBe(6) // 周六
    expect(weekdayOf(new Date(2026, 8, 6))).toBe(7) // 周日
  })

  it('parseHHmm：合法/非法格式', () => {
    expect(parseHHmm('14:00')).toBe(840)
    expect(parseHHmm('9:30')).toBe(570)
    expect(parseHHmm('24:00')).toBeNull()
    expect(parseHHmm('bad')).toBeNull()
  })
})

describe('时段折扣规则命中', () => {
  it('周末下午规则：星期+时间段联合命中，边界含头不含尾', () => {
    const rules = [rule({ weekdays: [6, 7], timeRanges: [{ start: '14:00', end: '18:00' }], discountPercent: 100 })]
    expect(pickTimeDiscountRule(rules, ctx())?.discountPercent).toBe(100) // 周六 15:30 命中
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: SAT_1359 }))).toBeNull() // 13:59 不命中
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: SAT_1800 }))).toBeNull() // 18:00 整不含尾
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: MON_1530 }))).toBeNull() // 周一不命中
    // 14:00 整含头
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: new Date(2026, 8, 5, 14, 0) }))).not.toBeNull()
  })

  it('weekdays/timeRanges 为空 = 不限星期/全天', () => {
    const rules = [rule({ discountPercent: 70 })]
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: MON_1530 }))?.discountPercent).toBe(70)
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: new Date(2026, 8, 7, 10, 0) })))?.discountPercent
  })

  it('门店特异性：显式门店规则优先于全局规则，与 priority 无关', () => {
    const rules = [
      rule({ id: 'global', name: '全局兜底', orgIds: [], priority: 1, discountPercent: 70 }),
      rule({ id: 'store', name: '门店专属', orgIds: ['S1'], priority: 9, discountPercent: 100 }),
    ]
    expect(pickTimeDiscountRule(rules, ctx())?.ruleId).toBe('store')
    // 门店不匹配时全局兜底
    expect(pickTimeDiscountRule(rules, ctx({ orgId: 'S2' }))?.ruleId).toBe('global')
    // 场地未挂门店（orgId=null）只命中全局规则
    expect(pickTimeDiscountRule(rules, ctx({ orgId: null }))?.ruleId).toBe('global')
  })

  it('同特异性内按 priority 升序，先命中先生效', () => {
    const rules = [
      rule({ id: 'low', priority: 5, discountPercent: 80 }),
      rule({ id: 'high', priority: 2, discountPercent: 115 }),
    ]
    expect(pickTimeDiscountRule(rules, ctx())?.ruleId).toBe('high')
    expect(pickTimeDiscountRule(rules, ctx())?.discountPercent).toBe(115) // 峰时加价 >100 原样返回
  })

  it('卡类型过滤：不匹配的卡不命中', () => {
    const rules = [rule({ cardTypes: ['YEARLY'], discountPercent: 85 })]
    expect(pickTimeDiscountRule(rules, ctx())?.discountPercent).toBe(85)
    expect(pickTimeDiscountRule(rules, ctx({ cardType: 'MONTHLY' }))).toBeNull()
  })

  it('日期范围含两端（节假日场景 10-01~10-07）', () => {
    const rules = [rule({ validFrom: '2026-10-01', validTo: '2026-10-07', discountPercent: 115 })]
    const oct1 = new Date(2026, 9, 1, 12, 0)
    const oct7 = new Date(2026, 9, 7, 22, 30)
    const sep30 = new Date(2026, 8, 30, 12, 0)
    const oct8 = new Date(2026, 9, 8, 0, 30)
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: oct1 }))).not.toBeNull()
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: oct7 }))).not.toBeNull()
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: sep30 }))).toBeNull()
    expect(pickTimeDiscountRule(rules, ctx({ appointmentStart: oct8 }))).toBeNull()
    // ISO 带时区串（Prisma 返回形态）同样按前 10 位日期字面量解析
    expect(pickTimeDiscountRule([rule({ validFrom: '2026-10-01T00:00:00.000Z', validTo: '2026-10-07T00:00:00.000Z', discountPercent: 115 })], ctx({ appointmentStart: oct1 }))).not.toBeNull()
  })

  it('按时长固定价：命中时长取固定价；时长缺失/不在价目表 → 视为未命中继续下一条', () => {
    const fixed = rule({
      id: 'fixed', priority: 1, actionType: 'FIXED_BY_DURATION', discountPercent: null,
      fixedPrices: [{ minutes: 30, price: 133 }, { minutes: 60, price: 266 }],
    })
    const percent = rule({ id: 'percent', priority: 2, discountPercent: 85 })
    expect(pickTimeDiscountRule([fixed], ctx({ durationMinutes: 60 }))?.fixedPrice).toBe(266)
    expect(pickTimeDiscountRule([fixed], ctx({ durationMinutes: 30 }))?.fixedPrice).toBe(133)
    expect(pickTimeDiscountRule([fixed], ctx({ durationMinutes: 45 }))).toBeNull()
    expect(pickTimeDiscountRule([fixed], ctx({ durationMinutes: null }))).toBeNull()
    // 45 分钟不在价目表 → 落到下一条百分比规则
    expect(pickTimeDiscountRule([fixed, percent], ctx({ durationMinutes: 45 }))?.ruleId).toBe('percent')
  })

  it('停用规则跳过；非法时间段(start>=end)不命中', () => {
    expect(pickTimeDiscountRule([rule({ enabled: false })], ctx())).toBeNull()
    expect(pickTimeDiscountRule([rule({ timeRanges: [{ start: '20:00', end: '10:00' }] })], ctx())).toBeNull()
  })
})
