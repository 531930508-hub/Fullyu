/**
 * 进销存共享定义。
 *
 * 单据流：采购订单（审批通过后待收货）→ 验收入库（可分批）→ 库存结存 + 流水。
 * 库存调整（盘盈盘亏/报损）同样走审批，通过后才写库存。
 */

/** 供货方类型 */
export type PurchaseSupplierType = 'EXTERNAL' | 'HQ'

export const SUPPLIER_TYPE_NAMES: Record<PurchaseSupplierType, string> = {
  EXTERNAL: '外部供应商',
  HQ: '总部',
}

export type PurchaseOrderStatus =
  | 'PENDING_APPROVAL'
  | 'REJECTED'
  | 'APPROVED'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'CANCELLED'

export const PO_STATUS_META: Record<PurchaseOrderStatus, { text: string; color: string }> = {
  PENDING_APPROVAL: { text: '审批中', color: 'orange' },
  REJECTED: { text: '已驳回', color: 'red' },
  APPROVED: { text: '待收货', color: 'blue' },
  PARTIAL: { text: '部分入库', color: 'cyan' },
  COMPLETED: { text: '已完成', color: 'green' },
  CANCELLED: { text: '已取消', color: 'default' },
}

/** 可以执行验收入库的状态：审批中和已终止的单不允许收货 */
export const PO_RECEIVABLE_STATUS: PurchaseOrderStatus[] = ['APPROVED', 'PARTIAL']

/** 计入门店耗材成本的状态：审批未过的单不能进财务口径 */
export const PO_COST_COUNTED_STATUS: PurchaseOrderStatus[] = ['APPROVED', 'PARTIAL', 'COMPLETED']

export type StockLedgerType = 'IN' | 'OUT' | 'ADJUST'

export const LEDGER_TYPE_NAMES: Record<StockLedgerType, string> = {
  IN: '入库',
  OUT: '出库',
  ADJUST: '调整',
}

export type StockAdjustReason = 'PROFIT' | 'LOSS' | 'DAMAGE' | 'OTHER'

export const ADJUST_REASON_NAMES: Record<StockAdjustReason, string> = {
  PROFIT: '盘盈',
  LOSS: '盘亏',
  DAMAGE: '报损',
  OTHER: '其他',
}

export type StockAdjustStatus = 'PENDING_APPROVAL' | 'REJECTED' | 'EFFECTIVE' | 'CANCELLED'

export const ADJUST_STATUS_META: Record<StockAdjustStatus, { text: string; color: string }> = {
  PENDING_APPROVAL: { text: '审批中', color: 'orange' },
  REJECTED: { text: '已驳回', color: 'red' },
  EFFECTIVE: { text: '已生效', color: 'green' },
  CANCELLED: { text: '已取消', color: 'default' },
}

/** 明细行的最小形状，前后端算金额时共用 */
export interface PurchaseItemLike {
  price: number | string
  qty: number | string
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * 采购单金额合计。
 * 单价保留两位，逐行四舍五入后再累加，与账面显示一致，避免总额与明细差一分。
 */
export function sumPurchaseAmount(items: PurchaseItemLike[]): number {
  const cents = items.reduce((s, it) => s + Math.round(num(it.price) * 100) * num(it.qty), 0)
  return Math.round(cents) / 100
}

/** 库存调整单的影响金额：按差额绝对值 × 单价累加，仅用于命中审批金额分级 */
export function sumAdjustAmount(items: { diffQty: number | string; price: number | string }[]): number {
  const cents = items.reduce(
    (s, it) => s + Math.abs(num(it.diffQty)) * Math.round(num(it.price) * 100),
    0,
  )
  return Math.round(cents) / 100
}

/**
 * 按明细的累计收货量推算采购单状态。
 * 一件未收仍是「待收货」，收满才算「已完成」，中间一律「部分入库」。
 */
export function derivePoStatus(
  items: { qty: number | string; receivedQty: number | string }[],
): Extract<PurchaseOrderStatus, 'APPROVED' | 'PARTIAL' | 'COMPLETED'> {
  const total = items.reduce((s, it) => s + num(it.qty), 0)
  const received = items.reduce((s, it) => s + num(it.receivedQty), 0)
  if (received <= 0) return 'APPROVED'
  if (received >= total) return 'COMPLETED'
  return 'PARTIAL'
}

/** 库存是否低于安全线 */
export function isBelowSafety(qty: number, safetyStock: number): boolean {
  return safetyStock > 0 && qty < safetyStock
}
