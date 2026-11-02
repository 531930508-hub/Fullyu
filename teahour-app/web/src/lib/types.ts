export type Series = 'xing' | 'song' | 'qing' | 'mian' | 'retail';

export type Store = {
  id: string;
  city: string;
  cityEn: string;
  name: string;
  nameEn: string;
  short: string;
  address: string;
  addressEn: string;
  open: boolean;
  retailPickup: boolean;
  hours: string;
  printerStatus: string;
  channels: Record<string, boolean>;
  positions: string[];
  waitMinutes: number;
};

export type Category = { id: string; name: string; nameEn: string; kind: string };

export type Product = {
  id: string;
  name: string;
  nameEn: string;
  categoryId: string;
  series: Series;
  kind: 'tea' | 'retail' | 'bottle';
  priceCents: number;
  costCents: number;
  doseGrams: number;
  status: 'published' | 'draft' | 'archived';
  temps: string[];
  ice: boolean;
  memberEligible: boolean;
  desc: string;
  descEn: string;
  spec: string;
  specEn: string;
  tag: string;
  tagEn: string;
  unit: string;
  unitEn: string;
  updatedAt: number;
  stockGrams?: number;
  soldOut?: boolean;
  available?: boolean;
  totalGrams?: number;
  soldOutStores?: number;
};

export type RetailAvailability = {
  id: string;
  name: string;
  price_cents: number;
  totalStock: number;
  stores: number;
};

export type Customer = {
  id: string;
  memberCode: string;
  name: string;
  phone: string | null;
  memberTier: string;
  discountPerCupCents: number;
};

export type Staff = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  allStores: boolean;
  storeIds: string[];
  roles: Array<{ id: string; name: string; scope: string }>;
  permissions: string[];
};

export type OrderItem = {
  id: string;
  productId: string;
  name: string;
  nameEn: string;
  kind: string;
  series: Series;
  qty: number;
  refundedQty: number;
  remainingQty: number;
  unitPriceCents: number;
  totalCents: number;
  costCents: number;
  temp: string | null;
  ice: string | null;
};

export type OrderUnit = {
  id: string;
  itemId: string;
  label: string;
  status: string;
  scannedAt: number | null;
};

export type Order = {
  id: string;
  number: string;
  business: 'fresh' | 'retail';
  storeId: string;
  storeName: string;
  channel: 'mini' | 'assisted' | 'meituan' | 'taobao';
  type: 'dine' | 'takeaway' | 'delivery' | 'retail';
  seat: string | null;
  status: 'unpaid' | 'pending' | 'ready' | 'awaiting' | 'delivered' | 'refunded' | 'cancelled';
  paymentStatus: string;
  totalCents: number;
  refundedCents: number;
  pickupCode: string | null;
  pickupStoreId: string | null;
  printStatus: string;
  parentOrderId: string | null;
  note: string;
  customerId: string | null;
  ownerKind: string;
  createdBy: string | null;
  paymentRef: string | null;
  paymentMethod: string | null;
  preparedAt: number | null;
  createdAt: number;
  paidAt: number | null;
  deliveredAt: number | null;
  refundPending: boolean;
  items: OrderItem[];
  units: OrderUnit[];
  cupTotal: number;
  cupScanned: number;
};

export type FinanceEntry = {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  storeId: string;
  storeName: string;
  type: 'SALE' | 'REFUND';
  amountCents: number;
  method: string;
  settlement: string;
  memo: string;
  costCents: number;
  at: number;
};

export type FinanceSummary = {
  entries: number;
  grossSalesCents: number;
  refundsCents: number;
  netCents: number;
  settledCents: number;
  pendingCents: number;
  cashCents: number;
  wechatCents: number;
  saleCount: number;
  refundCount: number;
};

export type Expense = {
  id: string;
  storeId: string;
  storeName: string;
  category: string;
  categoryName: string;
  amountCents: number;
  date: string;
  memo: string;
  source: string;
  batchId: string | null;
  createdBy: string | null;
  createdAt: number;
  voidedAt: number | null;
  voidedBy: string | null;
};

export type ExpenseSummary = {
  totalCents: number;
  count: number;
  byCategory: Array<{ id: string; name: string; nameEn: string; amountCents: number; count: number }>;
  byStore: Array<{ storeId: string; storeName: string; amountCents: number; count: number }>;
};

export type ProfitRow = {
  storeId: string;
  store: string;
  revenueCents: number;
  cogsCents: number;
  remakeCostCents: number;
  remakeCount: number;
  ingredientCostCents: number;
  lossCents: number;
  lossCount: number;
  pendingLossCents: number;
  pendingLossCount: number;
  grossCents: number;
  grossMargin: number | null;
  opexCents: number;
  opexCount: number;
  opexByCategory: Array<{ id: string; name: string; amountCents: number }>;
  netCents: number;
  netMargin: number | null;
  entries: number;
};

export type ProfitReport = {
  rows: ProfitRow[];
  totals: ProfitRow & {
    opexByCategory: Array<{ id: string; name: string; amountCents: number }>;
  };
  range: { from: string; to: string };
  includesBrand: boolean;
};

export type Approval = {
  id: string;
  kind: 'REFUND' | 'LOSS';
  status: 'pending' | 'approved' | 'rejected';
  amountCents: number;
  storeId: string | null;
  storeName: string;
  orderId: string | null;
  orderNumber: string | null;
  summary: string;
  requestedBy: string | null;
  requesterName: string;
  decidedBy: string | null;
  comment: string;
  resultNote: string;
  createdAt: number;
  decidedAt: number | null;
  payload: Record<string, unknown>;
};

export type Loss = {
  id: string;
  storeId: string;
  storeName: string;
  productId: string;
  name: string;
  kind: string;
  qty: number;
  unit: string;
  amountCents: number;
  reason: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  reportedBy: string;
  decidedBy: string | null;
  decidedAt: number | null;
  decisionNote: string;
  approvalId: string | null;
  at: number;
};

export type LossPolicy = {
  enabled: boolean;
  monthlyRatio: number;
  approvalThresholdCents: number;
  approvers: string[];
};

export type LossSummary = {
  from: number;
  to: number;
  rows: Array<{
    storeId: string;
    store: string;
    amountCents: number;
    pendingCents: number;
    salesCents: number;
    ratio: number;
    limit: number;
    count: number;
    pending: number;
    warning: boolean;
    recent: Loss[];
  }>;
  totalCents: number;
  pendingTotalCents: number;
};

export type StockItem = {
  productId: string;
  name: string;
  nameEn: string;
  kind: string;
  doseGrams: number;
  unit: string;
  unitEn: string;
  grams: number;
  soldOut: boolean;
};

export type DeviceStatus = {
  name?: string;
  kind?: string;
  mode: string;
  online?: boolean;
  detail?: string;
  id?: string;
};

export type DevicePayload = {
  printer: DeviceStatus;
  machines: Array<DeviceStatus & { id: string; kind: string }>;
  payment: DeviceStatus;
  platform: { mode: string };
  member: { mode: string };
};

export type Mapping = {
  id: string;
  externalId: string;
  productId: string;
  productName: string;
  unit: string;
  factor: number;
  updatedAt: number;
};

export type Role = {
  id: string;
  name: string;
  description: string;
  scope: string;
  builtin: boolean;
  perms: string[];
  users?: number;
};

export type Permission = {
  code: string;
  name: string;
  module: string;
  level: string;
};

export type PermissionModule = { key: string; name: string };

export type StaffRow = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  allStores: boolean;
  storeIds: string[];
  roles: Array<{ id: string; name: string; scope: string }>;
  createdAt?: number;
  lastLoginAt?: number | null;
};

export type LogEntry = {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  detail: string;
  type: string;
  storeId: string | null;
  storeName: string | null;
  orderId: string | null;
  at: number;
};

export type Overview = {
  range: { from: string; to: string };
  revenueCents: number;
  grossCents: number;
  refundsCents: number;
  financeEntries: number;
  orderCount: number;
  freshSalesCents: number;
  retailSalesCents: number;
  cups: number;
  averageOrderCents: number;
  bySeries: Array<{ id: Series; name: string; nameEn: string; qty: number; amountCents: number }>;
  byStore: Array<{
    storeId: string;
    store: string;
    amountCents: number;
    grossCents: number;
    refundsCents: number;
    entries: number;
  }>;
  daily: Array<{ day: string; gross: number; net: number; entries: number }>;
  topProducts: Array<{ name: string; series: Series; qty: number; amount: number }>;
};
