import { get, post, put } from './request'
import type {
  ProductionMode,
  PurchaseOrderStatus,
  PurchaseSupplierType,
  ScmBatchStatus,
  ScmLocationType,
  ScmProductType,
  ScmProductionStatus,
  ScmTransferStatus,
  StockAdjustReason,
  StockAdjustStatus,
  StockLedgerType,
} from '@fullyu/shared'

export interface ScmProduct {
  id: string
  code: string
  name: string
  type: ScmProductType
  spec: string
  unit: string
  /** 无 scm:po:price 权限时为 null，门店只看得到总部供货价 */
  purchasePrice: number | null
  /** 最近一次已生效的采购成交价，无历史价时为 null */
  latestPurchasePrice: number | null
  supplyPrice: number
  /** 是否可见总部对外采购价 */
  priceVisible: boolean
  safetyStock: number
  /** 保质期天数，0 表示不管理效期 */
  shelfLifeDays: number
  enabled: boolean
  remark: string
}

export interface ScmPriceRecord {
  id: string
  productId: string
  supplierId: string | null
  supplierName: string
  price: number
  effectiveFrom: string
  source: 'MANUAL' | 'RECEIPT'
  ref: string
  remark: string
  createdBy: string
  createdAt: string
}

export interface ProductPriceHistory {
  productId: string
  productName: string
  unit: string
  archivePrice: number
  rows: ScmPriceRecord[]
}

export interface ScmSupplier {
  id: string
  name: string
  contact: string
  phone: string
  /** 代工厂：可以被建成 FACTORY 类型的库存地点 */
  isProcessor: boolean
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
  warehouseName: string
  ownerOrgId: string
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
    batchNo: string
    productionDate: string | null
    expiryDate: string | null
  }[]
}

export interface StockRow {
  warehouseId: string
  /** 地点名，可能是自有仓/供应商处/代工厂 */
  warehouseName: string
  locationType: ScmLocationType
  ownerOrgId: string
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
  warehouseName: string
  ownerOrgId: string
  productId: string
  name: string
  unit: string
  type: StockLedgerType
  qty: number
  batchNo: string
  ref: string
  createdAt: string
}

export interface StockBatchRow {
  id: string
  warehouseId: string
  warehouseName: string
  ownerOrgId: string
  productId: string
  code: string
  name: string
  spec: string
  unit: string
  shelfLifeDays: number
  batchNo: string
  productionDate: string | null
  expiryDate: string | null
  daysToExpiry: number | null
  qty: number
  unitCost: number
  amount: number
  status: ScmBatchStatus
  sourceType: string
  sourceNo: string
  createdAt: string
}

export interface BatchSummary {
  total: number
  expiring: number
  expired: number
  qty: number
  amount: number
  warningDays: number
}

export interface BatchListResult {
  summary: BatchSummary
  rows: StockBatchRow[]
}

export interface StockAdjust {
  id: string
  warehouseId: string
  warehouseName: string
  ownerOrgId: string
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

export function listProducts(params?: { keyword?: string; enabled?: boolean; type?: ScmProductType }) {
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

export function listProductPrices(id: string) {
  return get<ProductPriceHistory>(`/scm/products/${id}/prices`)
}

export function createProductPrice(
  id: string,
  body: { supplierId?: string; price: number; effectiveFrom?: string; remark?: string },
) {
  return post<ScmPriceRecord>(`/scm/products/${id}/prices`, body)
}

export function listSuppliers(params?: { keyword?: string; enabled?: boolean }) {
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
  items: {
    productId: string
    acceptQty: number
    rejectQty?: number
    reason?: string
    batchNo?: string
    productionDate?: string
    expiryDate?: string
  }[]
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

export function listBatches(params?: {
  warehouseId?: string
  keyword?: string
  status?: ScmBatchStatus
  expiringDays?: number
}) {
  return get<BatchListResult>('/scm/stock/batches', params)
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

// ===== 库存地点 =====

export interface ScmLocation {
  id: string
  name: string
  type: ScmLocationType
  orgId: string | null
  orgName: string
  supplierId: string | null
  supplierName: string
  enabled: boolean
  remark: string
}

export function listLocations(params?: {
  type?: ScmLocationType
  orgId?: string
  keyword?: string
  includeDisabled?: boolean
}) {
  return get<ScmLocation[]>('/scm/locations', params)
}

export function createLocation(body: {
  name?: string
  type: ScmLocationType
  orgId?: string
  supplierId?: string
  remark?: string
}) {
  return post<ScmLocation>('/scm/locations', body)
}

export function updateLocation(
  id: string,
  body: { name?: string; remark?: string; enabled?: boolean },
) {
  return put<ScmLocation>(`/scm/locations/${id}`, body)
}

// ===== BOM 配方 =====

export interface BomItem {
  componentId: string
  code: string
  name: string
  spec: string
  unit: string
  /** 每 1 个成品的用量 */
  qtyPerUnit: number
  /** 0.02 = 2% */
  lossRate: number
  remark: string
  unitPrice: number
  amount: number
}

export interface ScmBom {
  id: string
  productId: string
  productCode: string
  productName: string
  productSpec: string
  productUnit: string
  productType: ScmProductType
  version: number
  status: 'ACTIVE' | 'ARCHIVED'
  remark: string
  createdBy: string
  createdAt: string
  unitCost: number
  costVisible: boolean
  items: BomItem[]
}

export function listBoms(params?: {
  productId?: string
  keyword?: string
  status?: 'ACTIVE' | 'ARCHIVED'
}) {
  return get<ScmBom[]>('/scm/boms', params)
}

export function getBom(id: string) {
  return get<ScmBom>(`/scm/boms/${id}`)
}

export function saveBom(body: {
  productId: string
  remark?: string
  items: { componentId: string; qtyPerUnit: number; lossRate?: number; remark?: string }[]
}) {
  return post<ScmBom>('/scm/boms', body)
}

export function archiveBom(id: string) {
  return post<ScmBom>(`/scm/boms/${id}/archive`, {})
}

// ===== 库存调拨 =====

export interface ScmTransferItem {
  productId: string
  name: string
  spec: string
  unit: string
  qty: number
}

export interface ScmTransfer {
  id: string
  fromLocationId: string
  fromLocationName: string
  toLocationId: string
  toLocationName: string
  fromOwnerOrgId: string
  toOwnerOrgId: string
  status: ScmTransferStatus
  remark: string
  createdBy: string
  createdByName: string
  createdAt: string
  items: ScmTransferItem[]
}

export function listTransfers(params?: {
  locationId?: string
  productId?: string
  status?: ScmTransferStatus
  limit?: number
}) {
  return get<ScmTransfer[]>('/scm/transfers', params)
}

export function getTransfer(id: string) {
  return get<ScmTransfer>(`/scm/transfers/${id}`)
}

export function createTransfer(body: {
  fromLocationId: string
  toLocationId: string
  remark?: string
  items: { productId: string; qty: number }[]
}) {
  return post<ScmTransfer>('/scm/transfers', body)
}

export function cancelTransfer(id: string) {
  return post<ScmTransfer>(`/scm/transfers/${id}/cancel`, {})
}

// ===== 生产/委外工单 =====

export interface ProductionItem {
  componentId: string
  name: string
  spec: string
  unit: string
  qtyPerUnit: number
  lossRate: number
  requiredQty: number
  issuedQty: number
  unitPrice: number
  amount: number
}

export interface ProductionOrder {
  id: string
  orgId: string
  productId: string
  productName: string
  productSpec: string
  productUnit: string
  bomVersion: number
  plannedQty: number
  outputQty: number
  sourceLocationId: string
  sourceLocationName: string
  outputLocationId: string
  outputLocationName: string
  factoryLocationId: string | null
  factoryLocationName: string
  mode: ProductionMode
  status: ScmProductionStatus
  batchNo: string
  productionDate: string | null
  expiryDate: string | null
  processingFee: number
  materialCost: number
  totalCost: number
  unitCost: number
  costVisible: boolean
  remark: string
  createdBy: string
  createdByName: string
  createdAt: string
  items: ProductionItem[]
}

export function listProductionOrders(params?: {
  status?: ScmProductionStatus
  keyword?: string
  limit?: number
}) {
  return get<ProductionOrder[]>('/scm/production-orders', params)
}

export function getProductionOrder(id: string) {
  return get<ProductionOrder>(`/scm/production-orders/${id}`)
}

export function createProductionOrder(body: {
  productId: string
  plannedQty: number
  sourceLocationId: string
  outputLocationId: string
  factoryLocationId?: string
  batchNo?: string
  productionDate?: string
  expiryDate?: string
  processingFee?: number
  remark?: string
}) {
  return post<ProductionOrder>('/scm/production-orders', body)
}

export function issueProductionOrder(id: string) {
  return post<ProductionOrder>(`/scm/production-orders/${id}/issue`, {})
}

export function completeProductionOrder(
  id: string,
  body: {
    outputQty?: number
    batchNo?: string
    productionDate?: string
    expiryDate?: string
    remark?: string
  },
) {
  return post<ProductionOrder>(`/scm/production-orders/${id}/complete`, body)
}

export function cancelProductionOrder(id: string) {
  return post<ProductionOrder>(`/scm/production-orders/${id}/cancel`, {})
}
