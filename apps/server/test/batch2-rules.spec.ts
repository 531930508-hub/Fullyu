/**
 * 第 2 批（审批流引擎 / 进销存 / 财务）共享规则单元测试。
 *
 * 这三块的口径判定全部收敛在 packages/shared 里，前后端各调一次：
 * 前端预览命中的流程、后端落库时算的流程必须是同一个答案，看板上的数
 * 也必须与门店明细逐项对得上。所以这里只测纯函数，不起 Nest 容器 ——
 * 一旦这些规则被改坏，前后端会同时算错，属于必须拦住的回归。
 */
import {
  ADJUST_REASON_NAMES,
  EXPENSE_COUNTED_STATUS,
  PO_COST_COUNTED_STATUS,
  PO_RECEIVABLE_STATUS,
  amountRangeText,
  buildStoreProfit,
  computeRent,
  currentMonth,
  derivePoStatus,
  feeOf,
  isBelowSafety,
  isValidMonth,
  monthRange,
  nodePassed,
  percentToRate,
  pickFlowRule,
  rateToPercent,
  recentMonths,
  ruleMatches,
  scopeOfOrgType,
  sumAdjustAmount,
  sumPurchaseAmount,
} from '@fullyu/shared'
import type { FlowRuleLike } from '@fullyu/shared'

/* ===== 审批流命中 ===== */

/** 三档金额分级：0~5000 店长、5000~20000 加分公司、20000 以上到集团 */
const rules: (FlowRuleLike & { name: string })[] = [
  { name: '门店小额', bizType: 'PURCHASE_ORDER', scope: 'STORE', minAmount: null, maxAmount: 5000, enabled: true },
  { name: '门店中额', bizType: 'PURCHASE_ORDER', scope: 'STORE', minAmount: 5000, maxAmount: 20000, enabled: true },
  { name: '门店大额', bizType: 'PURCHASE_ORDER', scope: 'STORE', minAmount: 20000, maxAmount: null, enabled: true },
  { name: '总部采购', bizType: 'PURCHASE_ORDER', scope: 'HQ', minAmount: null, maxAmount: null, enabled: true },
]

describe('审批流命中判定', () => {
  it('金额区间下限含、上限不含，相邻档既不重叠也不漏', () => {
    expect(pickFlowRule(rules, 'PURCHASE_ORDER', 4999.99, 'STORE')?.name).toBe('门店小额')
    expect(pickFlowRule(rules, 'PURCHASE_ORDER', 5000, 'STORE')?.name).toBe('门店中额')
    expect(pickFlowRule(rules, 'PURCHASE_ORDER', 19999.99, 'STORE')?.name).toBe('门店中额')
    expect(pickFlowRule(rules, 'PURCHASE_ORDER', 20000, 'STORE')?.name).toBe('门店大额')
    expect(pickFlowRule(rules, 'PURCHASE_ORDER', 999999, 'STORE')?.name).toBe('门店大额')
  })

  it('组织范围隔离：门店的单不会命中总部流程', () => {
    expect(pickFlowRule(rules, 'PURCHASE_ORDER', 100, 'HQ')?.name).toBe('总部采购')
    const storeOnly = rules.filter((r) => r.scope === 'STORE')
    expect(pickFlowRule(storeOnly, 'PURCHASE_ORDER', 100, 'HQ')).toBeNull()
  })

  it('单据类型不匹配、规则停用都不命中', () => {
    expect(pickFlowRule(rules, 'EXPENSE_ENTRY', 100, 'STORE')).toBeNull()
    expect(ruleMatches({ ...rules[0], enabled: false }, 'PURCHASE_ORDER', 100, 'STORE')).toBe(false)
  })

  it('没有任何规则覆盖时返回 null（业务侧按免审直通处理）', () => {
    expect(pickFlowRule([], 'PURCHASE_ORDER', 100, 'STORE')).toBeNull()
  })

  it('scope=ALL 的规则对总部和门店都命中', () => {
    const all: FlowRuleLike = {
      bizType: 'STOCK_ADJUST',
      scope: 'ALL',
      minAmount: null,
      maxAmount: null,
      enabled: true,
    }
    expect(ruleMatches(all, 'STOCK_ADJUST', 0, 'HQ')).toBe(true)
    expect(ruleMatches(all, 'STOCK_ADJUST', 0, 'STORE')).toBe(true)
  })

  it('组织类型换算成流程范围：分公司与门店都算 STORE', () => {
    expect(scopeOfOrgType('STORE')).toBe('STORE')
    expect(scopeOfOrgType('SUBSIDIARY')).toBe('STORE')
    expect(scopeOfOrgType('GROUP')).toBe('HQ')
    expect(scopeOfOrgType('DEPT')).toBe('HQ')
    expect(scopeOfOrgType(null)).toBe('HQ')
  })

  it('金额区间文案按万元折算，配置页与单据详情共用', () => {
    expect(amountRangeText(null, null)).toBe('不限金额')
    expect(amountRangeText(null, 5000)).toBe('5000元以下')
    expect(amountRangeText(20000, null)).toBe('2万元及以上')
    expect(amountRangeText(5000, 20000)).toBe('5000 ~ 2万元')
  })

  it('会签要全员通过，或签一人即过', () => {
    expect(nodePassed('ANY', ['13800000001', '13800000002'], ['13800000002'])).toBe(true)
    expect(nodePassed('ALL', ['13800000001', '13800000002'], ['13800000002'])).toBe(false)
    expect(nodePassed('ALL', ['13800000001', '13800000002'], ['13800000001', '13800000002'])).toBe(true)
    // 审批人为空的节点不能被判成已通过，否则会静默跳过一级
    expect(nodePassed('ALL', [], [])).toBe(false)
  })
})

/* ===== 进销存 ===== */

describe('进销存金额与状态', () => {
  it('采购金额逐行取整后累加，总额与明细对得上', () => {
    expect(sumPurchaseAmount([{ price: 12.35, qty: 3 }, { price: 0.1, qty: 7 }])).toBe(37.75)
    // Decimal 传成字符串也要能算
    expect(sumPurchaseAmount([{ price: '19.90', qty: '2' }])).toBe(39.8)
    expect(sumPurchaseAmount([])).toBe(0)
  })

  it('调整金额按差额绝对值算，盘盈盘亏都能命中金额分级', () => {
    expect(sumAdjustAmount([{ diffQty: -3, price: 10 }, { diffQty: 2, price: 5.5 }])).toBe(41)
    expect(sumAdjustAmount([{ diffQty: 0, price: 100 }])).toBe(0)
  })

  it('采购单状态按累计收货量推算', () => {
    expect(derivePoStatus([{ qty: 10, receivedQty: 0 }])).toBe('APPROVED')
    expect(derivePoStatus([{ qty: 10, receivedQty: 4 }])).toBe('PARTIAL')
    expect(derivePoStatus([{ qty: 10, receivedQty: 10 }])).toBe('COMPLETED')
    // 多行只要没收满就仍是部分入库
    expect(derivePoStatus([{ qty: 5, receivedQty: 5 }, { qty: 5, receivedQty: 1 }])).toBe('PARTIAL')
  })

  it('可收货状态与计入成本状态的边界', () => {
    expect(PO_RECEIVABLE_STATUS).toEqual(['APPROVED', 'PARTIAL'])
    // 审批中、已驳回、已取消都不进财务口径
    expect(PO_COST_COUNTED_STATUS).not.toContain('PENDING_APPROVAL')
    expect(PO_COST_COUNTED_STATUS).not.toContain('CANCELLED')
    expect(PO_COST_COUNTED_STATUS).toContain('COMPLETED')
  })

  it('安全库存：没设安全线时不报警', () => {
    expect(isBelowSafety(3, 10)).toBe(true)
    expect(isBelowSafety(10, 10)).toBe(false)
    expect(isBelowSafety(0, 0)).toBe(false)
  })

  it('调整原因四类齐全', () => {
    expect(Object.keys(ADJUST_REASON_NAMES).sort()).toEqual(['DAMAGE', 'LOSS', 'OTHER', 'PROFIT'])
  })
})

/* ===== 财务 ===== */

describe('财务口径', () => {
  it('上缴费用按百分数算，比例与金额换算不差 100 倍', () => {
    expect(feeOf(100000, 15)).toBe(15000)
    expect(feeOf(100000, 2)).toBe(2000)
    expect(rateToPercent(0.15)).toBe(15)
    expect(rateToPercent('0.02')).toBe(2)
    expect(rateToPercent(null)).toBe(0)
    expect(percentToRate(15)).toBe(0.15)
    expect(percentToRate(2.5)).toBe(0.025)
  })

  it('房租取高：提成高于保底走提成，反之走保底，相等按保底记', () => {
    // 营收 300000 × 8% = 24000 > 保底 20000
    const ratio = computeRent({ revenue: 300000, baseRent: 20000, ratePercent: 8 })
    expect(ratio.rent).toBe(24000)
    expect(ratio.mode).toBe('RATIO')
    expect(ratio.ratioRent).toBe(24000)

    // 营收 100000 × 6% = 6000 < 保底 20000
    const base = computeRent({ revenue: 100000, baseRent: 20000, ratePercent: 6 })
    expect(base.rent).toBe(20000)
    expect(base.mode).toBe('BASE')

    // 打平时不额外让利，仍按保底口径记账
    const tie = computeRent({ revenue: 200000, baseRent: 20000, ratePercent: 10 })
    expect(tie.rent).toBe(20000)
    expect(tie.mode).toBe('BASE')

    // 参数没维护时不能报错，也不能算出负数
    const blank = computeRent({ revenue: 100000, baseRent: 0, ratePercent: 0 })
    expect(blank.rent).toBe(0)
    expect(blank.mode).toBe('BASE')
  })

  it('门店损益：租金取高与物业费现算，管理费培训费耗材一并计入支出', () => {
    const row = buildStoreProfit({
      orgId: 'org-1',
      storeName: '望京店',
      revenue: 100000,
      sources: [],
      baseRent: 15000,
      rentRatePercent: 20,
      propertyFee: 3000,
      labor: 30000,
      meituan: 2000,
      other: 1000,
      consumable: 5000,
      mgmtRatePercent: 15,
      trainingRatePercent: 2,
    })
    expect(row.mgmtFee).toBe(15000)
    expect(row.trainingFee).toBe(2000)
    // 100000 × 20% = 20000 > 保底 15000，房租走提成
    expect(row.rent).toBe(20000)
    expect(row.rentMode).toBe('RATIO')
    expect(row.property).toBe(3000)
    // 20000 + 3000 + 30000 + 2000 + 1000 + 15000 + 2000 + 5000
    expect(row.totalExpense).toBe(78000)
    expect(row.profit).toBe(22000)
    expect(row.profitRate).toBe(22)
  })

  it('零营收门店不做除零，净利率给 0，房租回落到保底', () => {
    const row = buildStoreProfit({
      orgId: 'org-2',
      storeName: '筹备店',
      revenue: 0,
      sources: [],
      baseRent: 8000,
      rentRatePercent: 10,
      propertyFee: 0,
      labor: 0,
      meituan: 0,
      other: 0,
      consumable: 0,
      mgmtRatePercent: 15,
      trainingRatePercent: 2,
    })
    expect(row.mgmtFee).toBe(0)
    expect(row.rent).toBe(8000)
    expect(row.rentMode).toBe('BASE')
    expect(row.profit).toBe(-8000)
    expect(row.profitRate).toBe(0)
  })

  it('只有已生效的支出计入看板', () => {
    expect(EXPENSE_COUNTED_STATUS).toEqual(['EFFECTIVE'])
  })

  it('月份校验与月份列表', () => {
    expect(isValidMonth('2026-01')).toBe(true)
    expect(isValidMonth('2026-13')).toBe(false)
    expect(isValidMonth('2026-1')).toBe(false)
    expect(isValidMonth('')).toBe(false)
    expect(currentMonth(new Date(2026, 7, 11))).toBe('2026-08')
    // 由近及远，含当月，跨年不出错
    expect(recentMonths(3, new Date(2026, 0, 15))).toEqual(['2026-01', '2025-12', '2025-11'])
  })

  it('月份区间是左闭右开，跨年月份边界正确', () => {
    const { start, end } = monthRange('2026-12')
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(11)
    expect(end.getFullYear()).toBe(2027)
    expect(end.getMonth()).toBe(0)
  })
})
