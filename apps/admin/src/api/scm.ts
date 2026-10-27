import { get, post, put } from './request'
import type {
  PurchaseOrderStatus,
  PurchaseSupplierType,
  StockAdjustReason,
  StockAdjustStatus,
  StockLedgerType,
} from '@fullyu/shared'

export interface ScmProduct {
  id: string
  code: string
  name: string
  spec: string
  unit: string
  /** 无 scm:po:price 权限时为 null，门店只看得到总部供货价 */
  purchasePrice: number | null
  supplyPrice: number
  /** 是否可见总部对外采购价 */
  priceVisible: boolean
  safetyStock: number
  enabled: boolean
  remark: string
}

export interface ScmSupplier {
  id: string
  name: string
  contact: string
  phone: string
  enabled: boolean
  remark: string
}

export interface PurchaseOrderItem {
  productId: string
  code: string
  name: string
  spec: string
  unit: string
  qty: number
  price: number
  amount: number
  receivedQty: number
}

export interface PurchaseOrder {
  id: string
  buyerId: string
  buyerName: string
  buyerType: 'GROUP' | 'DEPT' | 'SUBSIDIARY' | 'STORE' | null
  supplierType: PurchaseSupplierType
  supplierId: string | null
  supplierName: string
  totalAmount: number
  status: PurchaseOrderStatus
  createdBy: string
  createdByName: string
  remark: string
  approvalId: string | null
  flowName: string
  createdAt: string
  /** 无 scm:po:price 权限时金额一律为 0，前端据此隐藏价格列 */
  priceVisible: boolean
  items: PurchaseOrderItem[]
}

export interface GoodsReceipt {
  id: string
  poId: string
  warehouseId: string
  hasDiff: boolean
  operator: string
  operatorName: string
  createdAt: string
  items: {
    productId: string
    name: string
    unit: string
    acceptQty: number
    rejectQty: number
    reason: string
  }[]
}

export interface StockRow {
  warehouseId: string
  productId: string
  code: string
  name: string
  spec: string
  unit: string
  qty: number
  safetyStock: number
  belowSafety: boolean
  amount: number
  costVisible: boolean
  updatedAt: string
}

export interface StockLedgerRow {
  id: string
  warehouseId: string
  productId: string
  name: string
  unit: string
  type: StockLedgerType
  qty: number
  ref: string
  createdAt: string
}

export interface StockAdjust {
  id: string
  warehouseId: string
  reason: StockAdjustReason
  remark: string
  totalAmount: number
  status: StockAdjustStatus
  createdBy: string
  createdByName: string
  approvalId: string | null
  flowName: string
  createdAt: string
  costVisible: boolean
  items: {
    productId: string
    name: string
    unit: string
    beforeQty: number
    afterQty: number
    diffQty: number
    price: number
  }[]
}

// ===== 基础档案 =====

export function listProducts(params?: { keyword?: string; enabled?: boolean }) {
  return get<ScmProduct[]>('/scm/products', params)
}

export function createProduct(body: Partial<ScmProduct>) {
  return post<ScmProduct>('/scm/products', body)
}

export function updateProduct(id: string, body: Partial<ScmProduct>) {
  return put<ScmProduct>(`/scm/products/${id}`, body)
}

export function toggleProduct(id: string, enabled: boolean) {
  return put<ScmProduct>(`/scm/products/${id}/toggle`, { enabled })
}

export function listSuppliers(params?: { keyword?: string }) {
  return get<ScmSupplier[]>('/scm/suppliers', params)
}

export function createSupplier(body: Partial<ScmSupplier>) {
  return post<ScmSupplier>('/scm/suppliers', body)
}

export function updateSupplier(id: string, body: Partial<ScmSupplier>) {
  return put<ScmSupplier>(`/scm/suppliers/${id}`, body)
}

// ===== 采购订单 =====

export interface PurchaseOrderPayload {
  buyerId: string
  supplierType: PurchaseSupplierType
  supplierId?: string
  remark?: string
  items: { productId: string; qty: number; price?: number }[]
}

export function listPurchaseOrders(params?: {
  status?: PurchaseOrderStatus
  buyerId?: string
  keyword?: string
}) {
  return get<PurchaseOrder[]>('/scm/purchase-orders', params)
}

export function getPurchaseOrder(id: string) {
  return get<PurchaseOrder>(`/scm/purchase-orders/${id}`)
}

export function createPurchaseOrder(body: PurchaseOrderPayload) {
  return post<PurchaseOrder>('/scm/purchase-orders', body)
}

export function updatePurchaseOrder(id: string, body: PurchaseOrderPayload) {
  return put<PurchaseOrder>(`/scm/purchase-orders/${id}`, body)
}

export function cancelPurchaseOrder(id: string) {
  return post<PurchaseOrder>(`/scm/purchase-orders/${id}/cancel`, {})
}

// ===== 验收入库 =====

/** 待收货的采购单，入库页下拉用 */
export function listReceivableOrders() {
  return get<PurchaseOrder[]>('/scm/purchase-orders/receivable')
}

export function listReceipts(params?: { poId?: string; warehouseId?: string }) {
  return get<GoodsReceipt[]>('/scm/receipts', params)
}

export function createReceipt(body: {
  poId: string
  warehouseId?: string
  items: { productId: string; acceptQty: number; rejectQty?: number; reason?: string }[]
}) {
  return post<GoodsReceipt>('/scm/receipts', body)
}

// ===== 库存 =====

export function listStock(params?: {
  warehouseId?: string
  keyword?: string
  belowSafety?: boolean
}) {
  return get<StockRow[]>('/scm/stock', params)
}

export function listLedgers(params?: {
  warehouseId?: string
  productId?: string
  limit?: number
}) {
  return get<StockLedgerRow[]>('/scm/stock/ledgers', params)
}

export function listAdjusts(params?: { warehouseId?: string; status?: StockAdjustStatus }) {
  return get<StockAdjust[]>('/scm/stock/adjusts', params)
}

export function createAdjust(body: {
  warehouseId: string
  reason: StockAdjustReason
  remark?: string
  /** 只报盘点后的实际数，账面数由后端抓快照 */
  items: { productId: string; afterQty: number }[]
}) {
  return post<StockAdjust>('/scm/stock/adjusts', body)
}

export function cancelAdjust(id: string) {
  return post<StockAdjust>(`/scm/stock/adjusts/${id}/cancel`, {})
}
