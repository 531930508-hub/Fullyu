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
  lat: number;
  lng: number;
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
  /** 后台上传的商品图；空字符串表示使用内置系列插画。 */
  imageUrl: string;
  /** 总部默认排序（同系列同分类内）。 */
  sortOrder?: number;
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
  /** 本行参与自带杯减免的杯数（按加入顺序分配）。 */
  byoCupQty?: number;
  byoCupDiscountCents?: number;
  /** 本行年卡会员每杯立减金额。 */
  memberDiscountCents?: number;
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
  /** 自带杯：杯数与按杯减免金额，退款时按实付口径分摊。 */
  byoCupCups?: number;
  byoCupDiscountCents?: number;
  /** 年卡会员：每杯立减标准、享受杯数与减免总额。 */
  memberDiscountPerCupCents?: number;
  memberDiscountCups?: number;
  memberDiscountCents?: number;
  couponDiscountCents?: number;
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
  kind: 'REFUND' | 'LOSS' | 'ATTENDANCE';
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
  series?: string;
  categoryId?: string;
  kind: string;
  doseGrams: number;
  unit: string;
  unitEn: string;
  grams: number;
  soldOut: boolean;
  /** 本店是否覆盖过茶单顺序；false 时跟随总部。 */
  customOrder?: boolean;
  sortOrder?: number;
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

/** 优惠券模板：总部按通用 / 指定品类 / 指定单品创建，限定有效期，按手机号或规则发放给会员。 */
export type Coupon = {
  id: string;
  title: string;
  scope: 'all' | 'category' | 'product';
  categoryId: string | null;
  productId: string | null;
  amountCents: number;
  minSpendCents: number;
  validFrom: number;
  validTo: number;
  /** 发放后 N 天有效；0 表示只用固定区间。 */
  validDays: number;
  /** 是否在顾客端「可领券」列表中开放自助领取。 */
  claimable: boolean;
  /** 每位会员自助领取的上限张数。 */
  claimLimit: number;
  active: boolean;
  note: string;
  createdBy: string;
  createdAt: number;
  issued?: number;
  used?: number;
  available?: number;
  revoked?: number;
  claimed?: number;
};

export type CouponRuleKind = 'birthday' | 'welcome' | 'winback' | 'monthly';

/** 月度定向发放的执行状态：failed 保留断点，可点「继续执行」续跑。 */
export type CouponRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/** 一条规则一个自然月只有一条执行记录；进度条与断点都读它。 */
export type CouponRuleRun = {
  id: string;
  ruleId: string;
  couponId: string;
  period: string;
  trigger: 'manual' | 'auto';
  status: CouponRunStatus;
  targetCount: number;
  issued: number;
  skipped: number;
  processed: number;
  progress: number;
  batchId: string | null;
  attempts: number;
  lastError: string;
  operatorName: string;
  claimedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
};

/** 自动发券规则：命中人群后按天幂等发放，执行记录落在发券批次上。 */
export type CouponRule = {
  id: string;
  couponId: string;
  couponTitle: string;
  couponActive: boolean;
  couponValidTo: number;
  amountCents: number;
  kind: CouponRuleKind;
  kindLabel: string;
  enabled: boolean;
  tier: 'all' | 'standard' | 'annual';
  tierLabel: string;
  config: {
    daysBefore?: number;
    inactiveDays?: number;
    minOrders?: number;
    withinDays?: number;
    /** 月度：每月几号执行（1~28）。 */
    dayOfMonth?: number;
  };
  note: string;
  lastRunAt: number | null;
  lastRunIssued: number;
  lastRunSkipped: number;
  totalIssued: number;
  /** 月度规则的本月执行记录；其他规则为 null。 */
  currentRun: CouponRuleRun | null;
  /** 历史执行记录条数：大于 0 时只能停用、不能删除。 */
  runCount: number;
  createdAt: number;
};

export type CouponRulePreview = {
  count: number;
  willIssue: number;
  held: number;
  alreadyThisPeriod: number;
  period: string;
  kindLabel?: string;
  /** 月度规则额外返回：无手机号人数与预计耗时（秒）。 */
  targetCount?: number;
  noPhone?: number;
  estimatedSeconds?: number;
};

export type CouponRuleRunResult = {
  ruleId: string;
  kind: CouponRuleKind;
  couponTitle: string;
  targetCount: number;
  issued: number;
  skipped: number;
  period: string;
  replayed: boolean;
  batchId: string;
  error?: string;
};

export type CouponIssueResult = {
  issued: Array<{ phone: string; couponId: string }>;
  skipped: Array<{ phone: string; reason: string }>;
  template: Coupon;
};

/** 首页轮播：图片是整张成品图，跳转只支持站内。 */
export type BannerLinkType = 'none' | 'menu' | 'series' | 'retail' | 'orders' | 'profile' | 'product';

export type Banner = {
  id: string;
  title: string;
  imageUrl: string;
  linkType: BannerLinkType;
  linkValue: string;
  sortOrder: number;
  active: boolean;
  updatedAt: number;
};

/** 首页系列图槽位：key 为 xing-zh 等固定 8 位；imageUrl 为空表示使用内置图。 */
export type HomeSeriesSlot = {
  key: string;
  series: Exclude<Series, 'retail'>;
  locale: 'zh' | 'en';
  imageUrl: string;
  updatedAt: number | null;
};

export type HomeContent = {
  banners: Banner[];
  series: HomeSeriesSlot[];
  products: Array<Pick<Product, 'id' | 'name' | 'nameEn' | 'series' | 'kind' | 'status'>>;
};

/* ------------------------------ 考勤（在店时段） ------------------------------ */

export type WorkSessionStatus = 'open' | 'pending_close' | 'closed' | 'lapsed' | 'voided';

/** 一段在店时间。minutes 只有 closed 才有值——进行中和待补签都不计入工时。 */
export type WorkSession = {
  id: string;
  storeId: string;
  userId: string;
  businessDate: string;
  clockInAt: number;
  clockOutAt: number | null;
  minutes: number;
  liveMinutes: number;
  status: WorkSessionStatus;
  inDistanceM: number | null;
  inAccuracyM: number | null;
  outDistanceM: number | null;
  pendingApprovalId: string | null;
  adjustable: boolean;
  note: string;
};

export type AttendanceStoreOption = {
  id: string;
  name: string;
  short: string;
  address: string;
  lat: number;
  lng: number;
};

export type AttendanceMine = {
  today: string;
  now: number;
  open: WorkSession | null;
  sessions: WorkSession[];
  pendingCount: number;
  unresolvedCount: number;
  /** 全部未闭合时段（含往天的），页面上要能逐条补离店/撤回 */
  unresolved: WorkSession[];
  month: { label: string; minutes: number; days: number };
  stores: AttendanceStoreOption[];
  policy: {
    radiusM: number;
    accuracyCeilingM: number;
    accuracyAllowanceM: number;
    maxSegmentMinutes: number;
  };
  /** 带上定位读数请求时的围栏预判；服务端与 clock-in 共用同一份判定 */
  preview: {
    ok: boolean;
    reason: 'ok' | 'no_location' | 'untrusted_accuracy' | 'out_of_range';
    distanceM: number | null;
    limitM: number;
  } | null;
  /** 今日计划班次；没排班为 null。只作提示，不参与到店判定 */
  shift: {
    storeId: string;
    startMin: number;
    endMin: number;
    note: string;
  } | null;
};

export type AttendanceBoardPerson = {
  userId: string;
  name: string;
  /** 跨店看板时这段属于哪家店；单店时只有一项 */
  storeNames: string[];
  sessions: WorkSession[];
  minutes: number;
  liveMinutes: number;
  unresolved: number;
  /** 当天计划工时（班表），用于「计划 vs 实际」对照；不参与工时合计 */
  plannedMinutes: number;
};

export type AttendanceBoard = {
  /** 单店口径时为该店；「全部门店」时为 null */
  storeId: string | null;
  storeName: string;
  stores: Array<{ id: string; name: string }>;
  date: string;
  now: number;
  policy: { radiusM: number };
  rows: AttendanceBoardPerson[];
  onDuty: Array<{ userId: string; name: string; storeName: string; clockInAt: number; liveMinutes: number }>;
  unresolved: Array<{
    sessionId: string;
    userId: string;
    name: string;
    storeName: string;
    status: WorkSessionStatus;
    businessDate: string;
    clockInAt: number;
    liveMinutes: number;
  }>;
  summary: {
    peopleCount: number;
    totalMinutes: number;
    liveMinutes: number;
    plannedMinutes: number;
    /** 往天排了班却没有任何计时的人数 */
    notClockedCount: number;
    unresolvedCount: number;
    pendingApprovals: number;
  };
  /** 往天排了班但没打卡的人：只提示，不阻断（人可能临时请假） */
  notClocked: Array<{
    userId: string;
    name: string;
    storeNames: string[];
    plannedMinutes: number;
  }>;
};

/* ------------------------------ 排班（班表） ------------------------------ */

export type ShiftState = 'none' | 'planned' | 'done' | 'short' | 'absent';

export type ShiftCell = {
  businessDate: string;
  shift: { id: string; startMin: number; endMin: number; note: string } | null;
  plannedMinutes: number;
  /** 当天已计入的实际工时（已闭合时段） */
  actualMinutes: number;
  /** 服务端算好的对照结论：今天一律不算缺勤 */
  state: ShiftState;
};

export type ShiftRow = {
  userId: string;
  name: string;
  cells: ShiftCell[];
  plannedMinutes: number;
  actualMinutes: number;
};

export type ShiftMatrix = {
  storeId: string;
  storeName: string;
  stores: Array<{ id: string; name: string }>;
  from: string;
  to: string;
  today: string;
  days: string[];
  rows: ShiftRow[];
  summary: { people: number; plannedMinutes: number; actualMinutes: number; absentDays: number };
  limits: { maxRangeDays: number; pastEditDays: number; futureEditDays: number };
};

/* ------------------------------ 考勤月报 ------------------------------ */

export type AttendanceReportDay = {
  businessDate: string;
  shift: { id: string; startMin: number; endMin: number; note: string } | null;
  plannedMinutes: number;
  actualMinutes: number;
  /** 当天未闭合的时段数：>0 说明这天的工时还没算完 */
  unresolvedCount: number;
  state: ShiftState;
};

export type AttendanceReportRow = {
  userId: string;
  name: string;
  presentDays: number;
  plannedMinutes: number;
  actualMinutes: number;
  absentDays: number;
  shortDays: number;
  unresolvedCount: number;
  days: AttendanceReportDay[];
};

export type AttendanceReport = {
  storeId: string;
  storeName: string;
  stores: Array<{ id: string; name: string }>;
  month: string;
  from: string;
  to: string;
  today: string;
  rows: AttendanceReportRow[];
  summary: {
    people: number;
    presentPeople: number;
    attendanceDays: number;
    plannedMinutes: number;
    actualMinutes: number;
    absentDays: number;
    shortDays: number;
    unresolvedCount: number;
  };
};

/* ------------------------------ 劳务结算 ------------------------------ */

/** 门店劳务单价：库里存「分/分钟」，小时价只是 *60 的展示口径。 */
export type LaborRateRow = {
  storeId: string;
  name: string;
  city: string;
  laborRatePerMinCents: number;
  hourlyCents: number;
};

export type LaborRateList = { maxRatePerMinCents: number; rows: LaborRateRow[] };

export type SettlementLine = {
  sessionId: string;
  businessDate: string;
  from: string;
  to: string;
  minutes: number;
};

export type SettlementStatus = 'draft' | 'posted' | 'voided';

export type WorkSettlement = {
  id: string;
  storeId: string;
  storeName: string;
  userId: string;
  userName: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  /** 实际记工分钟（含不足 1 小时的零头） */
  minutes: number;
  /** 计价分钟：按小时向下取整后的整点分钟 */
  billableMinutes: number;
  hours: number;
  ratePerMinCents: number;
  hourlyCents: number;
  baseAmountCents: number;
  adjustmentCents: number;
  adjustmentNote: string;
  amountCents: number;
  status: SettlementStatus;
  /** 未闭合段数（含待补签）：大于 0 时不能确认入账 */
  unclosedCount: number;
  pendingApprovals: number;
  lines: SettlementLine[];
  postedExpenseId: string | null;
  confirmedBy: string | null;
  confirmedAt: number | null;
  confirmedNote: string;
};

export type SettlementList = {
  month: string;
  periodStart: string;
  periodEnd: string;
  rows: WorkSettlement[];
  summary: {
    count: number;
    draftCount: number;
    postedCount: number;
    minutes: number;
    baseAmountCents: number;
    amountCents: number;
    unclosedCount: number;
  };
};
