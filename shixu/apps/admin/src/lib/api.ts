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
      byoCup: { enabled: boolean; perCupCents: number };
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
      benefit: { code: string; tier: 'annual' | 'guest'; discountPerCupCents: number; name?: string; birthday?: string | null };
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

  adminApprovals: (query: { view?: 'todo' | 'done' | 'all'; kind?: string; status?: string }) =>
    request<{
      view: 'todo' | 'done' | 'all';
      approvals: import('./types').Approval[];
      counts: { pending: number; done: number; total: number; approved: number; rejected: number };
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
    scope: 'all' | 'category' | 'product';
    categoryId?: string | null;
    productId?: string | null;
    amountCents: number;
    minSpendCents: number;
    validFrom: string;
    validTo: string;
    validDays?: number;
    claimable?: boolean;
    claimLimit?: number;
    note?: string;
  }) => request<{ coupon: import('./types').Coupon }>('/admin/coupons', { method: 'POST', body }),
  adminUpdateCoupon: (
    id: string,
    body: { active?: boolean; note?: string; claimable?: boolean; claimLimit?: number }
  ) => request<{ coupon: import('./types').Coupon }>(`/admin/coupons/${id}`, { method: 'PATCH', body }),
  adminIssueCoupon: (id: string, phones: string[]) =>
    request<import('./types').CouponIssueResult>(`/admin/coupons/${id}/issue`, {
      method: 'POST',
      body: { phones }
    }),
  adminCouponRules: () => request<{ rules: import('./types').CouponRule[] }>('/admin/coupons/rules'),
  adminCreateCouponRule: (body: {
    couponId: string;
    kind: import('./types').CouponRuleKind;
    tier?: 'all' | 'standard' | 'annual';
    config: import('./types').CouponRule['config'];
    note?: string;
    enabled?: boolean;
  }) => request<{ rule: { id: string } }>('/admin/coupons/rules', { method: 'POST', body }),
  adminUpdateCouponRule: (
    id: string,
    body: { enabled?: boolean; tier?: 'all' | 'standard' | 'annual'; config?: import('./types').CouponRule['config']; note?: string }
  ) => request<{ rule: import('./types').CouponRule }>(`/admin/coupons/rules/${id}`, { method: 'PATCH', body }),
  adminDeleteCouponRule: (id: string) =>
    request<{ ok: boolean }>(`/admin/coupons/rules/${id}`, { method: 'DELETE' }),
  adminPreviewCouponRule: (id: string) =>
    request<import('./types').CouponRulePreview>(`/admin/coupons/rules/${id}/preview`, { method: 'POST' }),
  // 生日/新客/沉睡当场跑完返回 result；月度只排队，返回 run，进度靠轮询查询。
  adminRunCouponRule: (id: string) =>
    request<
      { result: import('./types').CouponRuleRunResult } | { run: import('./types').CouponRuleRun }
    >(`/admin/coupons/rules/${id}/run`, { method: 'POST' }),
  adminCouponRuns: (query: { ruleId?: string; limit?: number } = {}) =>
    request<{ runs: import('./types').CouponRuleRun[] }>('/admin/coupons/runs', { query }),
  adminCouponRun: (id: string) =>
    request<{ run: import('./types').CouponRuleRun }>(`/admin/coupons/runs/${id}`),
  adminContinueCouponRun: (id: string) =>
    request<{ run: import('./types').CouponRuleRun }>(`/admin/coupons/runs/${id}/continue`, {
      method: 'POST'
    }),

  adminMe: () => request<{ permissions: string[]; hasProfit: boolean }>('/admin/me'),

  /** 首页内容：轮播与系列图；权限沿用商品查看 / 编辑。 */
  adminHomeContent: () => request<import('./types').HomeContent>('/admin/content'),
  adminCreateBanner: (body: {
    title: string;
    base64: string;
    contentType: string;
    linkType: import('./types').BannerLinkType;
    linkValue?: string;
    active?: boolean;
  }) => request<{ banner: import('./types').Banner }>('/admin/banners', { method: 'POST', body }),
  adminUpdateBanner: (
    id: string,
    body: {
      title?: string;
      base64?: string;
      contentType?: string;
      linkType?: import('./types').BannerLinkType;
      linkValue?: string;
      active?: boolean;
    }
  ) => request<{ banner: import('./types').Banner }>(`/admin/banners/${id}`, { method: 'PUT', body }),
  adminDeleteBanner: (id: string) =>
    request<{ ok: boolean }>(`/admin/banners/${id}`, { method: 'DELETE' }),
  adminReorderBanners: (ids: string[]) =>
    request<{ banners: import('./types').Banner[] }>('/admin/banners/order', { method: 'PUT', body: { ids } }),
  adminUploadSeriesImage: (key: string, body: { base64: string; contentType: string }) =>
    request<{ series: import('./types').HomeSeriesSlot[] }>(`/admin/content/series/${key}`, { method: 'PUT', body }),
  adminResetSeriesImage: (key: string) =>
    request<{ series: import('./types').HomeSeriesSlot[] }>(`/admin/content/series/${key}`, {
      method: 'DELETE'
    }),

  /* ------------------------- 考勤：到店确认与补签 ------------------------- */

  /** 带上定位读数时，服务端会把围栏预判（preview）一起返回，前端不自己算距离。 */
  attendanceMine: (storeId?: string, fix?: { lat: number; lng: number; accuracyM: number | null } | null) =>
    request<import('./types').AttendanceMine>('/attendance/mine', {
      query: { storeId, lat: fix?.lat, lng: fix?.lng, accuracyM: fix?.accuracyM }
    }),
  /** 只上报原始定位读数；是否放行由服务端重算距离后决定。 */
  attendanceClockIn: (body: { storeId: string; lat: number; lng: number; accuracyM: number | null }) =>
    request<{
      session: import('./types').WorkSession;
      gate: { ok: boolean; reason: string; distanceM: number | null; limitM: number };
      replay: boolean;
    }>('/attendance/clock-in', { method: 'POST', body }),
  attendanceClockOut: (body: { lat?: number | null; lng?: number | null; accuracyM?: number | null }) =>
    request<{ session: import('./types').WorkSession; minutes: number; voided: boolean }>(
      '/attendance/clock-out',
      { method: 'POST', body }
    ),
  attendanceRequestClose: (body: { sessionId: string; clockOutAt: number; reason?: string }) =>
    request<{ approvalId: string; session: import('./types').WorkSession }>('/attendance/requests/close', {
      method: 'POST',
      body
    }),
  attendanceRequestBackfill: (body: {
    storeId: string;
    clockInAt: number;
    clockOutAt: number;
    reason?: string;
  }) =>
    request<{ approvalId: string; minutes: number }>('/attendance/requests/backfill', {
      method: 'POST',
      body
    }),
  attendanceCancelRequest: (id: string) =>
    request<{ ok: boolean }>(`/attendance/requests/${id}/cancel`, { method: 'POST' }),
  /** storeId 省略 = 本人可见的全部门店 */
  attendanceBoard: (storeId?: string, date?: string) =>
    request<import('./types').AttendanceBoard>('/attendance/board', { query: { storeId, date } }),

  /* ------------------------- 考勤：排班（班表） ------------------------- */

  /** 人 × 天的矩阵；不传 from/to 默认本周（周一起算）。 */
  attendanceShifts: (query: { storeId?: string; from?: string; to?: string }) =>
    request<import('./types').ShiftMatrix>('/attendance/shifts', { query }),
  /** 同一人同一天同店只有一条班：重复提交即覆盖。 */
  attendanceSaveShift: (body: {
    storeId: string;
    userId: string;
    businessDate: string;
    startMin: number;
    endMin: number;
    note?: string;
  }) => request<{ shift: { id: string; startMin: number; endMin: number; note: string }; plannedMinutes: number }>(
    '/attendance/shifts',
    { method: 'PUT', body }
  ),
  /** 按 (门店, 员工, 日期) 清空，前端不必先拿 id。 */
  attendanceClearShift: (query: { storeId: string; userId: string; businessDate: string }) =>
    request<{ ok: boolean }>('/attendance/shifts', { method: 'DELETE', query }),
  /** 月度核对：一人一行 + 人×天明细，不含金额（金额在劳务结算）。 */
  attendanceReport: (query: { storeId?: string; month?: string }) =>
    request<import('./types').AttendanceReport>('/attendance/report', { query }),

  /* ------------------------- 考勤：劳务结算 ------------------------- */

  attendanceLaborRates: () => request<import('./types').LaborRateList>('/attendance/labor-rates'),
  /** 单价只有「保存」一种语义：挂在门店上，不需要新增/删除。 */
  attendanceSaveLaborRate: (storeId: string, body: { laborRatePerMinCents: number; note?: string }) =>
    request<import('./types').LaborRateRow>(`/attendance/labor-rates/${storeId}`, { method: 'PUT', body }),
  attendanceSettlements: (query: { month?: string; storeId?: string }) =>
    request<import('./types').SettlementList>('/attendance/settlements', { query }),
  /** 出单/重算：草稿刷新，已入账跳过，返回本次新建/重算/跳过张数。 */
  attendanceGenerateSettlements: (body: { month?: string; storeId?: string }) =>
    request<import('./types').SettlementList & { created: number; updated: number; skipped: number }>(
      '/attendance/settlements/generate',
      { method: 'POST', body }
    ),
  attendanceConfirmSettlement: (
    id: string,
    body: { adjustmentCents?: number; adjustmentNote?: string; note?: string }
  ) =>
    request<{ settlement: import('./types').WorkSettlement | null; expenseId: string | null }>(
      `/attendance/settlements/${id}/confirm`,
      { method: 'POST', body }
    )
};

export type RangeQuery = { range?: string; from?: string; to?: string };

export type QueuePayload = {
  fresh: import('./types').Order[];
  retail: import('./types').Order[];
  counts: { pending: number; ready: number; retail: number };
};
