/**
 * 审批流引擎共享定义。
 *
 * 全系统一套引擎：采购订单、费用录入、库存调整、代金券发放、订单强制退款
 * 都按「单据类型 + 组织范围 + 金额区间」命中同一份流程规则。
 * 命中判定放在这里，保证后端落库时算出的流程与前端预览的一致。
 */

/** 可走审批的单据类型 */
export type ApprovalBizType =
  | 'PURCHASE_ORDER'
  | 'EXPENSE_ENTRY'
  | 'STOCK_ADJUST'
  | 'VOUCHER_GRANT'
  | 'ORDER_FORCE_REFUND'

export interface BizTypeMeta {
  text: string
  color: string
  /** 金额字段在该单据下的叫法 */
  amountLabel: string
  desc: string
}

export const BIZ_TYPE_META: Record<ApprovalBizType, BizTypeMeta> = {
  PURCHASE_ORDER: {
    text: '采购订单',
    color: 'blue',
    amountLabel: '采购金额',
    desc: '总部对外采购、门店向总部采购耗材',
  },
  EXPENSE_ENTRY: {
    text: '费用录入',
    color: 'gold',
    amountLabel: '费用金额',
    desc: '房租、人力、美团推广费等月度支出录入',
  },
  STOCK_ADJUST: {
    text: '库存调整',
    color: 'cyan',
    amountLabel: '调整金额',
    desc: '盘盈盘亏、报损等库存变更',
  },
  VOUCHER_GRANT: {
    text: '代金券发放',
    color: 'purple',
    amountLabel: '发放面额',
    desc: '批量发放代金券，通过后自动落券',
  },
  ORDER_FORCE_REFUND: {
    text: '订单强制退款',
    color: 'volcano',
    amountLabel: '退款金额',
    desc: '客诉特殊处理，通过后自动发起退款',
  },
}

/** 流程适用的组织范围 */
export type ApprovalFlowScope = 'ALL' | 'HQ' | 'STORE'

export const FLOW_SCOPE_META: Record<ApprovalFlowScope, { text: string; color: string }> = {
  ALL: { text: '全部组织', color: 'default' },
  HQ: { text: '仅总部/部门', color: 'purple' },
  STORE: { text: '仅子公司/门店', color: 'green' },
}

/** 节点内多审批人时的通过规则 */
export type ApprovalNodeMode = 'ALL' | 'ANY'

export const NODE_MODE_NAMES: Record<ApprovalNodeMode, string> = {
  ALL: '会签（全部同意）',
  ANY: '或签（一人同意即可）',
}

export type ApprovalInstanceStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export const INSTANCE_STATUS_META: Record<ApprovalInstanceStatus, { text: string; color: string }> = {
  PENDING: { text: '审批中', color: 'orange' },
  APPROVED: { text: '已通过', color: 'green' },
  REJECTED: { text: '已驳回', color: 'red' },
  CANCELLED: { text: '已取消', color: 'default' },
}

export type ApprovalNodeStatus = 'WAITING' | 'PROCESSING' | 'APPROVED' | 'REJECTED'

export type ApprovalDecisionAction = 'APPROVE' | 'REJECT'

/** 组织类型（与 Prisma OrgType 对齐） */
export type OrgTypeLike = 'GROUP' | 'DEPT' | 'SUBSIDIARY' | 'STORE'

/**
 * 组织类型 → 流程范围。
 * 集团总部与总部部门算 HQ，子公司与门店算 STORE；组织不明时按 HQ 处理，
 * 避免把总部发起的单据错判成门店流程。
 */
export function scopeOfOrgType(type?: OrgTypeLike | null): Exclude<ApprovalFlowScope, 'ALL'> {
  return type === 'SUBSIDIARY' || type === 'STORE' ? 'STORE' : 'HQ'
}

/** 命中判定所需的规则最小形状，后端 Prisma 行与前端接口返回都能直接传 */
export interface FlowRuleLike {
  bizType: ApprovalBizType
  scope: ApprovalFlowScope
  /** null / undefined 表示不限 */
  minAmount?: number | string | null
  maxAmount?: number | string | null
  enabled: boolean
}

const toNum = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * 单条规则是否命中。
 * 金额区间为「下限含、上限不含」，这样相邻两档不会重叠也不会漏。
 */
export function ruleMatches(
  rule: FlowRuleLike,
  bizType: ApprovalBizType,
  amount: number,
  scope: Exclude<ApprovalFlowScope, 'ALL'>,
): boolean {
  if (!rule.enabled) return false
  if (rule.bizType !== bizType) return false
  if (rule.scope !== 'ALL' && rule.scope !== scope) return false
  const min = toNum(rule.minAmount)
  const max = toNum(rule.maxAmount)
  if (min !== null && amount < min) return false
  if (max !== null && amount >= max) return false
  return true
}

/**
 * 在候选规则中挑第一条命中的（调用方需按 sortOrder 排好序）。
 * 返回 null 表示没有启用的流程覆盖该区间 —— 业务侧应视为「免审直接生效」，
 * 而不是把单据卡住，否则改错一次配置就会锁死业务。
 */
export function pickFlowRule<T extends FlowRuleLike>(
  rules: T[],
  bizType: ApprovalBizType,
  amount: number,
  scope: Exclude<ApprovalFlowScope, 'ALL'>,
): T | null {
  return rules.find((r) => ruleMatches(r, bizType, amount, scope)) ?? null
}

/** 金额区间的可读文案，配置页与审批记录共用 */
export function amountRangeText(
  minAmount?: number | string | null,
  maxAmount?: number | string | null,
): string {
  const min = toNum(minAmount)
  const max = toNum(maxAmount)
  const fmt = (n: number) => (n >= 10000 ? `${n / 10000}万` : `${n}`)
  if (min === null && max === null) return '不限金额'
  if (min === null) return `${fmt(max as number)}元以下`
  if (max === null) return `${fmt(min)}元及以上`
  return `${fmt(min)} ~ ${fmt(max)}元`
}

/** 节点在当前决策集合下是否已通过 */
export function nodePassed(
  mode: ApprovalNodeMode,
  approvers: string[],
  approvedBy: string[],
): boolean {
  if (mode === 'ANY') return approvedBy.length >= 1
  return approvers.length > 0 && approvers.every((a) => approvedBy.includes(a))
}
