const STAFF_TOKEN_KEY = 'teahour.staff.token';
const CUSTOMER_TOKEN_KEY = 'teahour.customer.token';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokens = {
  staff: () => localStorage.getItem(STAFF_TOKEN_KEY),
  setStaff: (token: string) => localStorage.setItem(STAFF_TOKEN_KEY, token),
  clearStaff: () => localStorage.removeItem(STAFF_TOKEN_KEY),
  customer: () => localStorage.getItem(CUSTOMER_TOKEN_KEY),
  setCustomer: (token: string) => localStorage.setItem(CUSTOMER_TOKEN_KEY, token),
  clearCustomer: () => localStorage.removeItem(CUSTOMER_TOKEN_KEY)
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, query?: RequestOptions['query']) {
  if (!query) return `/api${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return `/api${path}${text ? `?${text}` : ''}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = options.token === undefined ? tokens.staff() : options.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查服务是否已启动');
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const body = (payload || {}) as { error?: string; message?: string; details?: unknown };
    if (response.status === 401 && token === tokens.staff()) tokens.clearStaff();
    throw new ApiError(response.status, body.message || `请求失败（${response.status}）`, body.error, body.details);
  }
  return payload as T;
}

export const api = {
  health: () => request<{ ok: boolean; hardware: string; note: string }>('/health'),

  staffLogin: (username: string, password: string) =>
    request<{ token: string; staff: import('./types').Staff }>('/auth/login', {
      method: 'POST',
      body: { username, password },
      token: null
    }),
  staffMe: () => request<{ staff: import('./types').Staff }>('/auth/me'),

  customerSession: (body: { memberCode?: string; name?: string; phone?: string } = {}) =>
    request<{ token: string; customer: import('./types').Customer }>('/customer/session', {
      method: 'POST',
      body,
      token: null
    }),
  customerMe: () =>
    request<{ customer: import('./types').Customer }>('/customer/me', {
      token: tokens.customer()
    }),

  customerStores: () => request<{ stores: import('./types').Store[] }>('/customer/stores', { token: null }),
  bootstrap: (storeId?: string) =>
    request<{
      stores: import('./types').Store[];
      store: import('./types').Store;
      categories: import('./types').Category[];
      products: import('./types').Product[];
      retail: import('./types').RetailAvailability[];
      hardware: Record<string, string>;
      // 员工目录视图（/store/catalog）：保留投茶量供代点/报损展示，仍不含成本字段。
    }>('/store/catalog', { query: { storeId } }),
  customerMemberVerify: (code: string) =>
    request<{ benefit: { code: string; tier: string; discountPerCupCents: number; name: string } | null; mode: string }>(
      '/customer/member/verify',
      { method: 'POST', body: { code }, token: null }
    ),
  customerCreateOrder: (body: unknown) =>
    request<{ order: import('./types').Order; printError?: string }>('/customer/orders', {
      method: 'POST',
      body,
      token: tokens.customer()
    }),
  customerOrders: () =>
    request<{ orders: import('./types').Order[] }>('/customer/orders', { token: tokens.customer() }),
  customerOrder: (id: string) =>
    request<{ order: import('./types').Order }>(`/customer/orders/${id}`, { token: tokens.customer() }),
  customerRetail: () =>
    request<{ products: import('./types').RetailAvailability[] }>('/customer/retail', { token: null }),

  storeOverview: (storeId: string) =>
    request<{
      storeId: string;
      date: string;
      queue: QueuePayload;
      finance: import('./types').FinanceSummary;
      opexCents: number;
      expenses: import('./types').Expense[];
      approvals: { pending: number; approved: number; rejected: number };
    }>('/store/overview', { query: { storeId } }),
  storeQueue: (storeId: string) => request<QueuePayload>('/store/queue', { query: { storeId } }),
  storeOrders: (query: Record<string, string | number | undefined>) =>
    request<{ orders: import('./types').Order[] }>('/store/orders', { query }),
  storeCreateOrder: (body: unknown) =>
    request<{
      order: import('./types').Order;
      printError?: string;
      payment?:
        | { kind: 'qr'; method: 'wechat' | 'alipay'; qrCode: string; status: 'pending' }
        | { kind: 'scan'; method: 'wechat' | 'alipay'; status: 'paid' | 'processing'; providerRef?: string }
        | { kind: 'prepay'; method: 'wechat' | 'alipay' }
        | { kind: 'cash'; status: 'paid' }
        | { kind: 'none'; status: 'paid' };
    }>('/store/orders', {
      method: 'POST',
      body
    }),
  /** 代点支付状态：轮询到账，回调晚到也能收敛。 */
  storeOrderPayment: (orderId: string) =>
    request<{
      paymentStatus: 'paid' | 'unpaid' | 'cancelled';
      gatewayStatus?: string;
      error?: string;
      order: import('./types').Order;
    }>(`/store/orders/${orderId}/payment`),
  /** 顾客未付款时取消代点单：释放库存与锁定的券。 */
  storeCancelOrder: (orderId: string) =>
    request<{ order: import('./types').Order }>(`/store/orders/${orderId}/cancel`, { method: 'POST' }),
  storeVerifyMember: (code: string) =>
    request<{
      benefit: { code: string; tier: 'annual' | 'guest'; discountPerCupCents: number; name?: string };
      mode: string;
    }>('/store/member/verify', { method: 'POST', body: { code } }),
  storeOrder: (id: string) =>
    request<{ order: import('./types').Order; logs: import('./types').LogEntry[] }>(`/store/orders/${id}`),
  storeScan: (code: string) =>
    request<{ order: import('./types').Order }>('/store/scan', { method: 'POST', body: { code } }),
  storeScanUnit: (orderId: string, unitId: string) =>
    request<{ order: import('./types').Order }>(`/store/orders/${orderId}/scan`, {
      method: 'POST',
      body: { unitId }
    }),
  /** 待取餐 → 已取餐：顾客无需再扫码，门店交付时归档。 */
  storeDeliverFresh: (orderId: string) =>
    request<{ order: import('./types').Order }>(`/store/orders/${orderId}/deliver`, { method: 'POST' }),
  storeReprint: (orderId: string) =>
    request<{ ok: boolean; error?: string }>(`/store/orders/${orderId}/reprint`, { method: 'POST' }),
  storeRemake: (orderId: string, reason?: string) =>
    request<{ order: import('./types').Order }>(`/store/orders/${orderId}/remake`, {
      method: 'POST',
      body: { reason }
    }),
  storeRefund: (orderId: string, body: { items?: Array<{ itemId: string; qty: number }>; reason?: string } = {}) =>
    request<{
      mode: 'refunded' | 'approval';
      refundedCents?: number;
      approval?: import('./types').Approval;
      order?: import('./types').Order;
      quote?: unknown;
    }>(`/store/orders/${orderId}/refund`, { method: 'POST', body }),
  storeRetailLookup: (code: string) =>
    request<{ order: import('./types').Order }>('/store/retail/lookup', { method: 'POST', body: { code } }),
  storeDeliver: (orderId: string, storeId: string, code: string) =>
    request<{ order: import('./types').Order }>(`/store/retail/${orderId}/deliver`, {
      method: 'POST',
      body: { storeId, code }
    }),
  storeInventory: (storeId: string) =>
    request<{ items: import('./types').StockItem[] }>('/store/inventory', { query: { storeId } }),
  storeUpdateInventory: (storeId: string, items: Array<{ productId: string; grams?: number; soldOut?: boolean }>) =>
    request<{ items: import('./types').StockItem[] }>('/store/inventory', {
      method: 'PUT',
      body: { storeId, items }
    }),
  /** 本店茶单顺序：同系列同分类内整体提交，仅覆盖本店。 */
  storeReorderInventory: (storeId: string, productIds: string[]) =>
    request<{ items: import('./types').StockItem[] }>('/store/inventory/order', {
      method: 'PUT',
      body: { storeId, productIds }
    }),
  /** 恢复总部茶单顺序。 */
  storeResetInventoryOrder: (storeId: string) =>
    request<{ items: import('./types').StockItem[] }>('/store/inventory/order', {
      method: 'DELETE',
      query: { storeId }
    }),
  storeLosses: (storeId: string, status?: string) =>
    request<{
      losses: import('./types').Loss[];
      policy: import('./types').LossPolicy;
      summary: import('./types').LossSummary;
    }>('/store/losses', { query: { storeId, status } }),
  storeReportLoss: (body: { storeId: string; productId: string; qty: number; reason: string; note?: string }) =>
    request<{ loss: import('./types').Loss }>('/store/losses', { method: 'POST', body }),
  storeDevices: () =>
    request<{ devices: import('./types').DevicePayload }>('/store/devices'),
  storeLogs: (storeId: string, q?: string) =>
    request<{ logs: import('./types').LogEntry[] }>('/store/logs', { query: { storeId, q } }),

  adminOverview: (range: RangeQuery) =>
    request<{ overview: import('./types').Overview }>('/admin/overview', { query: range }),
  adminFinance: (query: RangeQuery & { type?: string; q?: string; storeId?: string }) =>
    request<{
      entries: import('./types').FinanceEntry[];
      summary: import('./types').FinanceSummary;
      range: { from: string; to: string };
    }>('/admin/finance', { query }),
  adminProfit: (range: RangeQuery) =>
    request<import('./types').ProfitReport>('/admin/profit', { query: range }),
  adminExpenses: (range: RangeQuery & { category?: string; includeVoided?: boolean }) =>
    request<{
      expenses: import('./types').Expense[];
      summary: import('./types').ExpenseSummary;
      range: { from: string; to: string };
    }>('/admin/expenses', { query: range }),
  adminExpenseSample: () => request<{ text: string }>('/admin/expenses/sample'),
  adminAddExpense: (body: { storeId: string; date: string; category: string; amount: string | number; memo?: string }) =>
    request<{ expense: import('./types').Expense }>('/admin/expenses', { method: 'POST', body }),
  adminPreviewExpenses: (text: string) =>
    request<{
      rows: Array<{
        line: number;
        date: string;
        storeId: string;
        storeName: string;
        category: string;
        categoryName: string;
        amountCents: number;
        memo: string;
      }>;
      errors: Array<{ line: number; message: string }>;
      duplicates: number;
      lineCount: number;
      totalCents: number;
      storeCount: number;
    }>('/admin/expenses/preview', { method: 'POST', body: { text } }),
  adminImportExpenses: (text: string) =>
    request<{ created: number; duplicates: number; totalCents: number; storeCount: number; batchId: string }>(
      '/admin/expenses/import',
      { method: 'POST', body: { text } }
    ),
  adminVoidExpense: (id: string) =>
    request<{ expense: import('./types').Expense }>(`/admin/expenses/${id}/void`, { method: 'POST' }),

  adminApprovals: (query: { status?: string; kind?: string }) =>
    request<{
      approvals: import('./types').Approval[];
      counts: { pending: number; approved: number; rejected: number };
    }>('/admin/approvals', { query }),
  adminDecide: (id: string, decision: 'approve' | 'reject', comment?: string) =>
    request<{ approval: import('./types').Approval }>(`/admin/approvals/${id}/decide`, {
      method: 'POST',
      body: { decision, comment }
    }),

  adminLosses: (query: RangeQuery & { status?: string }) =>
    request<{
      losses: import('./types').Loss[];
      summary: import('./types').LossSummary;
      policy: import('./types').LossPolicy;
      range: { from: string; to: string };
    }>('/admin/losses', { query }),
  adminLossPolicy: () => request<{ policy: import('./types').LossPolicy }>('/admin/loss-policy'),
  adminSaveLossPolicy: (body: Partial<import('./types').LossPolicy>) =>
    request<{ policy: import('./types').LossPolicy }>('/admin/loss-policy', { method: 'PUT', body }),
  adminRefundFlow: () => request<{ flow: { enabled: boolean; thresholdCents: number; approvers: string[] } }>('/admin/refund-flow'),
  adminSaveRefundFlow: (body: { enabled?: boolean; thresholdCents?: number }) =>
    request<{ flow: { enabled: boolean; thresholdCents: number; approvers: string[] } }>('/admin/refund-flow', {
      method: 'PUT',
      body
    }),

  adminProducts: () =>
    request<{ products: import('./types').Product[]; categories: import('./types').Category[] }>('/admin/products'),
  adminCreateProduct: (body: unknown) =>
    request<{ product: import('./types').Product }>('/admin/products', { method: 'POST', body }),
  adminUpdateProduct: (id: string, body: unknown) =>
    request<{ product: import('./types').Product }>(`/admin/products/${id}`, { method: 'PATCH', body }),
  /** 总部茶单顺序：同系列同分类内整体提交。 */
  adminReorderProducts: (ids: string[]) =>
    request<{ products: import('./types').Product[] }>('/admin/products/order', { method: 'PATCH', body: { ids } }),
  adminUploadProductImage: (id: string, body: { base64: string; contentType: string }) =>
    request<{ product: import('./types').Product }>(`/admin/products/${id}/image`, { method: 'POST', body }),
  adminRemoveProductImage: (id: string) =>
    request<{ product: import('./types').Product }>(`/admin/products/${id}/image`, { method: 'DELETE' }),
  adminSaveCategory: (body: { id?: string; name: string; nameEn?: string; kind?: string }) =>
    request<{ category: import('./types').Category }>('/admin/categories', { method: 'POST', body }),

  adminStores: () => request<{ stores: import('./types').Store[] }>('/admin/stores'),
  adminCreateStore: (body: unknown) =>
    request<{ store: import('./types').Store }>('/admin/stores', { method: 'POST', body }),
  adminUpdateStore: (id: string, body: unknown) =>
    request<{ store: import('./types').Store }>(`/admin/stores/${id}`, { method: 'PATCH', body }),
  adminSeatQr: () => request<{ baseUrl: string }>('/admin/seat-qr'),
  adminSaveSeatQr: (baseUrl: string) =>
    request<{ baseUrl: string }>('/admin/seat-qr', { method: 'PUT', body: { baseUrl } }),

  adminStaff: () =>
    request<{ staff: import('./types').StaffRow[]; roles: import('./types').Role[] }>('/admin/staff'),
  adminCreateStaff: (body: unknown) =>
    request<{ staff: import('./types').StaffRow }>('/admin/staff', { method: 'POST', body }),
  adminUpdateStaff: (id: string, body: unknown) =>
    request<{ staff: import('./types').StaffRow }>(`/admin/staff/${id}`, { method: 'PATCH', body }),

  adminRoles: () =>
    request<{
      roles: import('./types').Role[];
      catalog: { modules: import('./types').PermissionModule[]; permissions: import('./types').Permission[] };
    }>('/admin/roles'),
  adminSaveRole: (body: unknown) =>
    request<{ role: import('./types').Role }>('/admin/roles', { method: 'POST', body }),

  adminLogs: (query: RangeQuery & { q?: string; type?: string; limit?: number }) =>
    request<{ logs: import('./types').LogEntry[] }>('/admin/logs', { query }),

  adminMappings: () =>
    request<{ mappings: import('./types').Mapping[]; products: import('./types').Product[] }>('/admin/mappings'),
  adminSaveMapping: (body: { id?: string; externalId: string; productId: string; unit?: string; factor: number }) =>
    request<{ mapping: import('./types').Mapping }>('/admin/mappings', { method: 'POST', body }),
  adminCoupons: () => request<{ coupons: import('./types').Coupon[] }>('/admin/coupons'),
  adminCreateCoupon: (body: {
    title: string;
    scope: 'all' | 'category';
    categoryId?: string | null;
    amountCents: number;
    minSpendCents: number;
    validFrom: string;
    validTo: string;
    note?: string;
  }) => request<{ coupon: import('./types').Coupon }>('/admin/coupons', { method: 'POST', body }),
  adminUpdateCoupon: (id: string, body: { active?: boolean; note?: string }) =>
    request<{ coupon: import('./types').Coupon }>(`/admin/coupons/${id}`, { method: 'PATCH', body }),
  adminIssueCoupon: (id: string, phones: string[]) =>
    request<import('./types').CouponIssueResult>(`/admin/coupons/${id}/issue`, {
      method: 'POST',
      body: { phones }
    }),

  adminMe: () => request<{ permissions: string[]; hasProfit: boolean }>('/admin/me')
};

export type RangeQuery = { range?: string; from?: string; to?: string };

export type QueuePayload = {
  fresh: import('./types').Order[];
  retail: import('./types').Order[];
  counts: { pending: number; ready: number; retail: number };
};
