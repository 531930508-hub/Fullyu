import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, type RangeQuery } from '../lib/api';
import { useApi, useNow, useStoredJsonState, useStoredState } from '../lib/hooks';
import { useStaffAuth } from '../lib/auth';
import { StaffShell } from '../components/StaffShell';
import { visibleNav } from '../lib/nav';
import { refreshApprovalCount } from '../lib/approvalBadge';
import { downloadSeatTagPng, downloadSeatTagsPng, printSeatTags, qrDataUrl, seatCode, seatQrValue } from '../lib/qr';
import { Icon, type IconName } from '../components/Icons';
import {
  Badge,
  Drawer,
  EmptyState,
  Field,
  InlineError,
  Modal,
  PageHead,
  Panel,
  Segmented,
  Spinner,
  Stat,
  StatusPill,
  Switch,
  Tabs,
  useConfirm,
  useToast
} from '../components/ui';
import {
  EXPENSE_CATEGORIES,
  SERIES,
  csvCell,
  dateText,
  dateTimeText,
  downloadText,
  fullDateTimeText,
  money,
  percent,
  todayText
} from '../lib/format';
import {
  SESSION_LABEL,
  SHIFT_STATE_LABEL,
  addDaysText,
  clockToMinutes,
  elapsedText,
  minutesText as durationText,
  sessionTone,
  shiftClock,
  shiftStateTone,
  shiftText,
  weekdayText,
  weekStartText
} from '../lib/attendance';
import { HOME_IMAGE_HEIGHT, HOME_IMAGE_WIDTH, MAX_UPLOAD_BYTES, prepareHomeImage, prepareProductImage } from '../lib/image';
import type {
  Approval,
  Banner,
  BannerLinkType,
  Category,
  Coupon,
  CouponIssueResult,
  CouponRule,
  CouponRuleKind,
  CouponRulePreview,
  CouponRuleRun,
  Expense,
  FinanceEntry,
  HomeContent,
  HomeSeriesSlot,
  LaborRateRow,
  LogEntry,
  Loss,
  LossPolicy,
  Mapping,
  Order,
  Overview,
  Permission,
  PermissionModule,
  Product,
  ProfitReport,
  Role,
  Series,
  ShiftCell,
  StaffRow,
  Store,
  WorkSettlement
} from '../lib/types';

/* ------------------------------- shared ------------------------------- */

type Section =
  | 'overview'
  | 'finance'
  | 'profit'
  | 'expenses'
  | 'approvals'
  | 'schedule'
  | 'attendance'
  | 'report'
  | 'settlements'
  | 'losses'
  | 'coupons'
  | 'content'
  | 'products'
  | 'mappings'
  | 'stores'
  | 'staff'
  | 'roles'
  | 'logs';

const SECTION_TITLE: Record<Section, string> = {
  overview: '经营概览',
  finance: '财务流水',
  profit: '门店利润',
  expenses: '运营费用',
  approvals: '审批中心',
  schedule: '排班表',
  attendance: '在店看板',
  report: '考勤月报',
  settlements: '劳务结算',
  losses: '报损与损耗',
  coupons: '优惠券',
  content: '首页内容',
  products: '商品目录',
  mappings: '原料映射',
  stores: '门店配置',
  staff: '账号管理',
  roles: '角色权限',
  logs: '操作记录'
};

/** 后台页面的权限映射；菜单本身来自 lib/nav.ts 的统一导航。 */
const SECTION_PERM: Record<Section, string> = {
  overview: 'dashboard:view',
  finance: 'finance:view',
  profit: 'dashboard:profit',
  expenses: 'finance:view',
  approvals: 'approval:view',
  schedule: 'attendance:view',
  attendance: 'attendance:view',
  report: 'attendance:view',
  settlements: 'attendance:settle',
  losses: 'loss:view',
  coupons: 'coupon:view',
  content: 'product:view',
  products: 'product:view',
  mappings: 'mapping:view',
  stores: 'store:config',
  staff: 'rbac:view',
  roles: 'rbac:view',
  logs: 'log:view'
};

const SECTION_ORDER: Section[] = [
  'overview',
  'finance',
  'profit',
  'expenses',
  'approvals',
  'schedule',
  'attendance',
  'report',
  'settlements',
  'losses',
  'coupons',
  'content',
  'products',
  'mappings',
  'stores',
  'staff',
  'roles',
  'logs'
];

/* 三类审批的展示与判定权限：金额为 0 的补签按「时长」呈现，避免出现 ¥0.00 的卡面。 */
const APPROVAL_PERM: Record<Approval['kind'], string> = {
  REFUND: 'order:refund:approve',
  LOSS: 'loss:approve',
  ATTENDANCE: 'attendance:approve'
};
const APPROVAL_LABEL: Record<Approval['kind'], string> = {
  REFUND: '退款审批',
  LOSS: '报损审批',
  ATTENDANCE: '补签审批'
};
const APPROVAL_TONE: Record<Approval['kind'], 'accent' | 'warn' | 'dark'> = {
  REFUND: 'accent',
  LOSS: 'warn',
  ATTENDANCE: 'dark'
};

function attendanceMinutes(payload: Record<string, unknown>): number {
  const from = Number(payload.clockInAt);
  const to = Number(payload.clockOutAt);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.round((to - from) / 60000);
}

type RangeKind = 'today' | '7' | '30' | 'custom';
type RangeState = { kind: RangeKind; from: string; to: string };

function makeRange(kind: RangeKind): RangeState {
  const now = Date.now();
  const to = todayText();
  const from =
    kind === '7' ? dateText(now - 6 * 86400000) : kind === '30' ? dateText(now - 29 * 86400000) : to;
  return { kind, from, to };
}

function rangeQuery(state: RangeState): RangeQuery {
  if (state.kind === 'custom') return { range: 'custom', from: state.from, to: state.to };
  return { range: state.kind };
}

/** 只接受合法结构；相对区间（今天/7 天/30 天）每次读取都按当天重新计算，避免隔夜过期。 */
function parseRange(raw: unknown): RangeState | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<RangeState>;
  if (row.kind === 'today' || row.kind === '7' || row.kind === '30') return makeRange(row.kind);
  if (row.kind !== 'custom') return null;
  const from = typeof row.from === 'string' ? row.from : '';
  const to = typeof row.to === 'string' ? row.to : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
  return { kind: 'custom', from, to };
}

function useStoredRange(page: string, initial: RangeKind) {
  return useStoredJsonState<RangeState>(`teahour.admin.range.${page}`, makeRange(initial), parseRange);
}

function RangeBar({
  value,
  onChange,
  busy,
  children
}: {
  value: RangeState;
  onChange: (next: RangeState) => void;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="toolbar">
      <Segmented
        value={value.kind}
        ariaLabel="统计周期"
        options={[
          { value: 'today' as RangeKind, label: '今天' },
          { value: '7' as RangeKind, label: '近 7 天' },
          { value: '30' as RangeKind, label: '近 30 天' },
          { value: 'custom' as RangeKind, label: '自定义' }
        ]}
        onChange={(kind) => onChange(kind === 'custom' ? { ...value, kind } : makeRange(kind))}
      />
      {value.kind === 'custom' ? (
        <>
          <input
            type="date"
            value={value.from}
            max={value.to}
            aria-label="开始日期"
            onChange={(event) => {
              // 清空日期时不发查询，避免后端回落到今天造成「区间显示为空但结果是今天」。
              if (event.target.value) onChange({ ...value, from: event.target.value });
            }}
          />
          <span className="faint small">至</span>
          <input
            type="date"
            value={value.to}
            min={value.from}
            aria-label="结束日期"
            onChange={(event) => {
              if (event.target.value) onChange({ ...value, to: event.target.value });
            }}
          />
        </>
      ) : null}
      {busy ? (
        <span className="range-busy" role="status">
          <span className="spinner" />
          正在按区间统计
        </span>
      ) : null}
      {children}
    </div>
  );
}

function rangeLabel(range: { from: string; to: string }) {
  return range.from === range.to ? range.from : `${range.from} — ${range.to}`;
}

function exportCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
  const text = [header.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
  downloadText(filename, text);
}

const EXPENSE_SOURCE: Record<string, string> = { manual: '手动录入', import: '批量导入', seed: '初始数据' };

/* ------------------------------- shell ------------------------------- */

export function AdminApp() {
  const { staff, can } = useStaffAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const nav = visibleNav(can);
  const segment = (location.pathname.replace(/^\/admin\/?/, '').split('/')[0] || 'overview') as Section;
  const section: Section | undefined =
    SECTION_PERM[segment] && can(SECTION_PERM[segment])
      ? segment
      : SECTION_ORDER.find((key) => can(SECTION_PERM[key]));
  const allowed = Boolean(section);

  useEffect(() => {
    // 无权限的深链回落到第一个可用页面，并把地址栏一起纠正，避免 URL 与内容不一致。
    if (section && section !== segment) navigate(`/admin/${section}`, { replace: true });
    // 完全没有后台权限（例如门店店员直接输入 /admin/...）时交回 /staff 重新分派。
    else if (!section && nav.length) navigate('/staff', { replace: true });
  }, [section, segment, nav.length, navigate]);

  if (!staff) return null;

  if (!nav.length) {
    return (
      <div className="console-content">
        <EmptyState icon="user" title="当前账号没有可用菜单" description="请联系超级管理员在「账号与角色」中分配角色。" />
      </div>
    );
  }

  return (
    <StaffShell
      nav={nav}
      active={`admin/${section || 'overview'}`}
      onNavigate={(key) => navigate(`/${key}`)}
    >
      {!allowed ? <EmptyState icon="user" title="暂无可用页面" /> : null}
      {allowed && section === 'overview' ? <OverviewPage /> : null}
      {allowed && section === 'finance' ? <FinancePage /> : null}
      {allowed && section === 'profit' ? <ProfitPage /> : null}
      {allowed && section === 'expenses' ? <ExpensesPage /> : null}
      {allowed && section === 'approvals' ? <ApprovalsPage onChanged={refreshApprovalCount} /> : null}
      {allowed && section === 'schedule' ? <SchedulePage /> : null}
      {allowed && section === 'attendance' ? <AttendancePage /> : null}
      {allowed && section === 'report' ? <AttendanceReportPage /> : null}
      {allowed && section === 'settlements' ? <SettlementsPage /> : null}
      {allowed && section === 'losses' ? <LossesPage /> : null}
      {allowed && section === 'coupons' ? <CouponsPage /> : null}
      {allowed && section === 'content' ? <ContentPage /> : null}
      {allowed && section === 'products' ? <ProductsPage /> : null}
      {allowed && section === 'mappings' ? <MappingsPage /> : null}
      {allowed && section === 'stores' ? <StoresPage /> : null}
      {allowed && section === 'staff' ? <StaffPage /> : null}
      {allowed && section === 'roles' ? <RolesPage /> : null}
      {allowed && section === 'logs' ? <LogsPage /> : null}
    </StaffShell>
  );
}

/* ------------------------------- overview ------------------------------- */

/**
 * 每日营业额柱状图。
 * 柱高只表达趋势，具体金额必须可见：鼠标悬停或键盘聚焦任意一天，
 * 显示当天日期、销售额、净收与流水笔数；首尾两天的提示向内侧对齐，避免溢出面板。
 */
function DailyBars({ daily, labelStep }: { daily: Overview['daily']; labelStep: number }) {
  const [active, setActive] = useState<number | null>(null);
  const maxDaily = Math.max(...daily.map((item) => item.gross), 1);
  const pick = active == null ? null : daily[active];
  const edge = active === 0 ? 'start' : active === daily.length - 1 ? 'end' : 'mid';
  return (
    <div className="bar-chart-wrap" onMouseLeave={() => setActive(null)}>
      <div className="bar-chart" aria-label="每日营业额">
        {daily.map((day, index) => {
          const empty = day.entries === 0;
          return (
            <div
              key={day.day}
              className={`bar-col${active === index ? ' active' : ''}`}
              tabIndex={0}
              role="group"
              aria-label={`${day.day}，销售额 ${money(day.gross)}，净收 ${money(day.net)}，${day.entries} 笔流水`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive((current) => (current === index ? null : current))}
            >
              <div className="bar-track">
                {empty ? (
                  <div className="bar-empty" />
                ) : (
                  <div className="bar-fill" style={{ height: `${Math.max(3, (day.gross / maxDaily) * 100)}%` }} />
                )}
              </div>
              <span className="bar-label">
                {index % labelStep === 0 || index === daily.length - 1 ? day.day.slice(5) : '\u00a0'}
              </span>
            </div>
          );
        })}
      </div>
      {pick && active != null ? (
        <div
          className={`bar-tip bar-tip-${edge}`}
          role="tooltip"
          style={{ left: `${((active + 0.5) / daily.length) * 100}%` }}
        >
          <strong>{pick.day}</strong>
          <span>
            <i>销售额</i>
            <b>{money(pick.gross)}</b>
          </span>
          <span>
            <i>净收</i>
            <b>{money(pick.net)}</b>
          </span>
          <span>
            <i>流水</i>
            <b>{pick.entries} 笔</b>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function OverviewPage() {
  const [range, setRange] = useStoredRange('overview', 'today');
  const [series, setSeries] = useState<Series | null>(null);
  const query = useApi(() => api.adminOverview(rangeQuery(range)), [range]);

  if (query.loading && !query.data) return <Spinner label="正在汇总经营数据" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const overview = query.data?.overview;
  if (!overview) return null;

  const activeDays = overview.daily.filter((day) => day.entries > 0).length;
  // 超过两周时稀疏显示日期，避免 30 根柱子的标签挤在一起。
  const labelStep = Math.max(1, Math.ceil(overview.daily.length / 7));
  const selected = overview.bySeries.find((item) => item.id === series);

  return (
    <>
      {query.error && query.data ? (
        <div style={{ marginBottom: 14 }}>
          <InlineError message={`${query.error}（展示的是最近一次成功读取的数据）`} />
        </div>
      ) : null}
      <PageHead
        eyebrow="品牌总部 · 经营"
        title="经营概览"
        description="按财务流水口径统计，退款以负向记账，杯数来自已完成支付的订单。"
        meta={<span>统计区间：{rangeLabel(overview.range)}</span>}
        actions={<RangeBar value={range} onChange={setRange} busy={query.loading} />}
      />

      <div className="stat-grid">
        <Stat label="净收" value={money(overview.revenueCents)} hint={`财务流水 ${overview.financeEntries} 笔`} tone="dark" icon="coin" />
        <Stat label="销售额" value={money(overview.grossCents)} hint={`退款 ${money(overview.refundsCents)}`} icon="chart" />
        <Stat label="已支付订单" value={overview.orderCount} hint={`客单价 ${money(overview.averageOrderCents)}`} icon="receipt" />
        <Stat label="出杯数" value={overview.cups} hint={`鲜酿 ${money(overview.freshSalesCents)} · 零售 ${money(overview.retailSalesCents)}`} icon="cup" />
      </div>

      <div className="overview-grid">
        <Panel
          title="系列表现"
          description="点击任意系列查看该系列的商品明细。"
          actions={<span className="faint tiny">醒 / 松 / 庆 / 眠 / 零售</span>}
        >
          <div className="series-grid-admin">
            {overview.bySeries.map((item) => {
              const meta = SERIES[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`series-tile series-${meta?.className || 'retail'}`}
                  onClick={() => setSeries(item.id)}
                >
                  <span className="t-char">{meta?.char || '零'}</span>
                  <span className="t-en">{meta?.nameEn || 'RETAIL'}</span>
                  <span className="t-amount">{money(item.amountCents)}</span>
                  <span className="t-qty">{item.qty} 件售出</span>
                </button>
              );
            })}
          </div>

          <div className="section-title">
            <h2>每日营业额</h2>
            <span className="faint tiny">
              区间 {overview.daily.length} 天 · 有流水 {activeDays} 天 · 悬停柱子看当天金额
            </span>
          </div>
          {overview.daily.length ? (
            <>
              <DailyBars daily={overview.daily} labelStep={labelStep} />
              {activeDays < overview.daily.length ? (
                <p className="faint tiny chart-note">灰色短柱表示当天没有流水，统计区间仍包含这些日期。</p>
              ) : null}
            </>
          ) : (
            <EmptyState icon="chart" title="所选区间还没有流水" description="调整时间范围或先在门店完成一笔订单。" />
          )}

          <div className="section-title">
            <h2>热销商品</h2>
            <span className="faint tiny">按销售额排序</span>
          </div>
          <div className="table-wrap">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>商品</th>
                  <th>系列</th>
                  <th className="num">销量</th>
                  <th className="num">销售额</th>
                </tr>
              </thead>
              <tbody>
                {overview.topProducts.map((product) => (
                  <tr key={`${product.series}-${product.name}`}>
                    <td className="cell-title">{product.name}</td>
                    <td>{SERIES[product.series]?.name || product.series}</td>
                    <td className="num">{product.qty}</td>
                    <td className="num">{money(product.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!overview.topProducts.length ? (
              <p className="muted small" style={{ padding: '12px 2px' }}>
                区间内暂无商品销售。
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title="门店净收" description="含品牌零售与退款冲减。">
          <div className="stack-sm">
            {overview.byStore.map((row) => (
              <div key={row.storeId} className="kv">
                <span>{row.store}</span>
                <strong>{money(row.amountCents)}</strong>
              </div>
            ))}
            {!overview.byStore.length ? <p className="muted small">区间内暂无门店流水。</p> : null}
          </div>
          <div className="notice" style={{ marginTop: 14 }}>
            <Icon name="info" size={15} />
            <span>
              净收 = 销售额 − 退款。成本、报损与运营费用在「门店利润」中核算，不在此页冲减。
            </span>
          </div>
        </Panel>
      </div>

      <Modal
        open={!!series}
        title={selected ? `${SERIES[selected.id]?.char || ''} · ${SERIES[selected.id]?.nameEn || ''} 系列` : ''}
        description={selected ? `${selected.qty} 件售出 · ${money(selected.amountCents)}` : undefined}
        onClose={() => setSeries(null)}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setSeries(null)}>
            关闭
          </button>
        }
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>商品</th>
                <th className="num">销量</th>
                <th className="num">销售额</th>
              </tr>
            </thead>
            <tbody>
              {overview.topProducts
                .filter((product) => product.series === series)
                .map((product) => (
                  <tr key={product.name}>
                    <td>{product.name}</td>
                    <td className="num">{product.qty}</td>
                    <td className="num">{money(product.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!overview.topProducts.some((product) => product.series === series) ? (
            <p className="muted small" style={{ padding: 12 }}>
              该系列在所选区间暂无销售明细。
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------- finance ------------------------------- */

function FinancePage() {
  const { can } = useStaffAuth();
  const [range, setRange] = useStoredRange('finance', 'today');
  const [type, setType] = useStoredState<'all' | 'SALE' | 'REFUND'>('teahour.admin.finance.type', 'all', ['all', 'SALE', 'REFUND']);
  const [storeId, setStoreId] = useStoredState<string>('teahour.admin.finance.store', '');
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState('');
  const storesQ = useApi(() => api.customerStores(), []);
  // 门店被删除或账号可见范围变化后回到「全部门店」，避免一直查空。
  useEffect(() => {
    if (!storeId) return;
    const list = storesQ.data?.stores || [];
    if (list.length && !list.some((store) => store.id === storeId)) setStoreId('');
  }, [storeId, storesQ.data, setStoreId]);
  const query = useApi(
    () => api.adminFinance({ ...rangeQuery(range), type: type === 'all' ? undefined : type, storeId: storeId || undefined, q: keyword || undefined }),
    [range, type, storeId, keyword]
  );

  if (query.loading && !query.data) return <Spinner label="正在读取财务流水" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;
  // 读取失败但仍有旧数据（UI-09）：保留旧结果但明确标注区间与失效，禁止当作当前筛选导出。
  const stale = Boolean(query.error);

  const entries = data.entries;
  const exportRows = () =>
    exportCsv(
      `时叙财务流水_${data.range.from}_${data.range.to}.csv`,
      ['时间', '订单号', '门店', '类型', '收款方式', '结算', '金额(元)', '成本(元)', '备注'],
      entries.map((entry) => [
        fullDateTimeText(entry.at),
        entry.orderNumber || '',
        entry.storeName,
        entry.type === 'SALE' ? '销售' : '退款',
        entry.method,
        entry.settlement,
        (entry.amountCents / 100).toFixed(2),
        (entry.costCents / 100).toFixed(2),
        entry.memo
      ])
    );

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 财务"
        title="财务流水"
        description="只读台账：每一笔销售与退款按实际支付时间记账，退款以负数冲减。"
        meta={<span>统计区间：{rangeLabel(data.range)} · {entries.length} 笔</span>}
        actions={
          <RangeBar value={range} onChange={setRange} busy={query.loading}>
            {can('finance:export') ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={exportRows} disabled={!entries.length || stale}>
                <Icon name="download" size={14} /> 导出 CSV
              </button>
            ) : null}
          </RangeBar>
        }
      />

      {stale ? (
        <InlineError
          message={`财务数据读取失败：${query.error}。以下为 ${rangeLabel(data.range)} 的上次结果，可能与当前筛选不符；已暂停导出，刷新成功后恢复。`}
        />
      ) : null}

      <div className="stat-grid">
        <Stat label="净收" value={money(data.summary.netCents)} hint={`${data.summary.entries} 笔流水`} tone="dark" icon="coin" />
        <Stat label="销售额" value={money(data.summary.grossSalesCents)} hint={`${data.summary.saleCount} 笔销售`} />
        <Stat label="退款" value={money(data.summary.refundsCents)} hint={`${data.summary.refundCount} 笔退款`} />
        <Stat
          label="结算构成"
          value={money(data.summary.settledCents)}
          hint={`待结算 ${money(data.summary.pendingCents)} · 现金 ${money(data.summary.cashCents)} / 微信 ${money(data.summary.wechatCents)}`}
        />
      </div>

      <Panel
        title="流水明细"
        description="成本来自订单商品的配方成本；退款记录保留原始收款方式。"
        actions={
          <div className="ledger-filter">
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)} aria-label="筛选门店">
              <option value="">全部门店</option>
              {(storesQ.data?.stores || []).map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <Segmented
              value={type}
              ariaLabel="流水类型"
              options={[
                { value: 'all', label: '全部' },
                { value: 'SALE', label: '销售' },
                { value: 'REFUND', label: '退款' }
              ]}
              onChange={setType}
            />
            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault();
                setKeyword(draft.trim());
              }}
            >
              <Icon name="search" size={15} />
              <input
                value={draft}
                placeholder="搜索订单号 / 门店"
                aria-label="搜索流水"
                onChange={(event) => setDraft(event.target.value)}
              />
            </form>
          </div>
        }
        flush
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>时间</th>
                <th>订单号</th>
                <th>门店</th>
                <th>类型</th>
                <th>方式</th>
                <th>结算</th>
                <th className="num">金额</th>
                <th className="num">成本</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="nowrap">{dateTimeText(entry.at)}</td>
                  <td className="mono">{entry.orderNumber || '—'}</td>
                  <td>{entry.storeName}</td>
                  <td>
                    <Badge tone={entry.type === 'SALE' ? 'ok' : 'danger'}>{entry.type === 'SALE' ? '销售' : '退款'}</Badge>
                  </td>
                  <td>{entry.method}</td>
                  <td className="faint">{entry.settlement}</td>
                  <td className={`num ${entry.amountCents < 0 ? 'money-neg' : ''}`}>{money(entry.amountCents, { sign: true })}</td>
                  <td className="num faint">{money(entry.costCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!entries.length ? (
            <EmptyState icon="coin" title="没有符合筛选条件的流水" description="调整周期、门店或关键词后再试。" />
          ) : null}
        </div>
      </Panel>
      <p className="page-foot-note">
        财务数据为追加式台账：退款不删除原销售记录，而是新增反向记录，便于审计。导出仅在具备「导出流水」权限时可用。
      </p>
    </>
  );
}

/* ------------------------------- expenses ------------------------------- */

function ExpensesPage() {
  const { can, staff } = useStaffAuth();
  const notify = useToast();
  const confirm = useConfirm();
  const [range, setRange] = useStoredRange('expenses', 'today');
  const [category, setCategory] = useState('all');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const storesQ = useApi(() => api.customerStores(), []);
  const query = useApi(
    () => api.adminExpenses({ ...rangeQuery(range), category: category === 'all' ? undefined : category, includeVoided }),
    [range, category, includeVoided]
  );

  if (query.loading && !query.data) return <Spinner label="正在读取运营费用" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  const stores = (storesQ.data?.stores || []).filter((store) => staff?.allStores || staff?.storeIds.includes(store.id));

  const exportRows = () =>
    exportCsv(
      `时叙运营费用_${data.range.from}_${data.range.to}.csv`,
      ['日期', '门店', '类别', '金额(元)', '备注', '来源', '状态'],
      data.expenses.map((expense) => [
        expense.date,
        expense.storeName,
        expense.categoryName,
        (expense.amountCents / 100).toFixed(2),
        expense.memo,
        EXPENSE_SOURCE[expense.source] || expense.source,
        expense.voidedAt ? '已作废' : '有效'
      ])
    );

  const voidOne = async (expense: Expense) => {
    const ok = await confirm({
      title: '作废这笔费用？',
      message: `${expense.storeName} · ${expense.categoryName} · ${money(expense.amountCents)}。作废后不再计入利润报表，但记录会保留。`,
      confirmText: '作废',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await api.adminVoidExpense(expense.id);
      notify('费用已作废', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '作废失败', 'danger');
    }
  };

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 财务"
        title="运营费用"
        description="人力、租金、总部管理费等门店运营成本。支持单笔录入与多门店同批导入，作废后不计入利润。"
        meta={<span>统计区间：{rangeLabel(data.range)} · 有效 {data.summary.count} 笔</span>}
        actions={
          <RangeBar value={range} onChange={setRange} busy={query.loading}>
            {can('finance:export') ? (
              <button type="button" className="btn btn-sm btn-outline" onClick={exportRows} disabled={!data.expenses.length}>
                <Icon name="download" size={14} /> 导出
              </button>
            ) : null}
          </RangeBar>
        }
      />

      <div className="stat-grid">
        <Stat label="费用合计" value={money(data.summary.totalCents)} hint={`${data.summary.count} 笔有效费用`} tone="dark" icon="coin" />
        <Stat label="覆盖门店" value={data.summary.byStore.length} hint="含品牌零售 / 总部" />
        <Stat
          label="最大类别"
          value={
            data.summary.byCategory.slice().sort((a, b) => b.amountCents - a.amountCents)[0]?.name || '—'
          }
          hint={money(data.summary.byCategory.slice().sort((a, b) => b.amountCents - a.amountCents)[0]?.amountCents || 0)}
        />
        <Stat
          label="日均费用"
          value={money(Math.round(data.summary.totalCents / Math.max(1, daysBetween(data.range.from, data.range.to))))}
          hint="按所选区间自然日折算"
        />
      </div>

      <Panel
        title="费用台账"
        description="费用按发生日期计入对应门店利润，不改变财务流水的销售额。"
        actions={
          <div className="row-gap">
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="费用类别">
              <option value="all">全部类别</option>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <label className="check-line tiny">
              <input type="checkbox" checked={includeVoided} onChange={(event) => setIncludeVoided(event.target.checked)} />
              含已作废
            </label>
            {can('finance:expense') ? (
              <>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setImportOpen(true)}>
                  <Icon name="upload" size={14} /> 批量导入
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setManualOpen(true)}>
                  <Icon name="plus" size={14} /> 手动录入
                </button>
              </>
            ) : null}
          </div>
        }
      >
        <div className="opex-strip" style={{ marginBottom: 14 }}>
          {data.summary.byCategory.map((item) => (
            <div className="opex-chip" key={item.id}>
              <span>{item.name}</span>
              <strong>{money(item.amountCents)}</strong>
              <span className="faint tiny">{item.count} 笔</span>
            </div>
          ))}
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>日期</th>
                <th>门店</th>
                <th>类别</th>
                <th className="num">金额</th>
                <th>备注</th>
                <th>来源</th>
                <th className="actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((expense) => (
                <tr key={expense.id} style={{ opacity: expense.voidedAt ? 0.55 : 1 }}>
                  <td className="nowrap">{expense.date}</td>
                  <td>{expense.storeName}</td>
                  <td>
                    <span className="tag">{expense.categoryName}</span>
                  </td>
                  <td className="num">{money(expense.amountCents)}</td>
                  <td className="faint">{expense.memo || '—'}</td>
                  <td>
                    <span className="faint tiny">{EXPENSE_SOURCE[expense.source] || expense.source}</span>
                    {expense.batchId ? <span className="sub-cell mono">{expense.batchId}</span> : null}
                  </td>
                  <td className="actions">
                    {expense.voidedAt ? (
                      <Badge tone="danger">已作废</Badge>
                    ) : can('finance:expense') ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => voidOne(expense)}>
                        作废
                      </button>
                    ) : (
                      <span className="faint tiny">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.expenses.length ? (
            <EmptyState
              icon="receipt"
              title="所选区间还没有运营费用"
              description="可以手动录入一笔，或按门店批量导入人力、租金、总部管理费。"
              action={
                can('finance:expense') ? (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setManualOpen(true)}>
                    录入第一笔
                  </button>
                ) : undefined
              }
            />
          ) : null}
        </div>
      </Panel>

      <ManualExpenseModal
        open={manualOpen}
        stores={stores}
        includeBrand={!!staff?.allStores}
        onClose={() => setManualOpen(false)}
        onSaved={() => {
          setManualOpen(false);
          notify('费用已录入', 'ok');
          query.reload({ silent: true });
        }}
      />
      <ImportExpenseModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={(message) => {
          setImportOpen(false);
          notify(message, 'ok');
          query.reload({ silent: true });
        }}
      />
      <p className="page-foot-note">
        导入采用「日期, 门店, 类别, 金额, 备注」五列；同一门店、同一日期、同一类别、同一金额与备注视为重复，自动跳过。品牌 / 总部费用仅总部全门店账号可录入。
      </p>
    </>
  );
}

function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function ManualExpenseModal({
  open,
  stores,
  includeBrand,
  onClose,
  onSaved
}: {
  open: boolean;
  stores: Store[];
  includeBrand: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [storeId, setStoreId] = useState('');
  const [date, setDate] = useState(todayText());
  const [category, setCategory] = useState('labor');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStoreId(stores[0]?.id || (includeBrand ? 'brand' : ''));
    setDate(todayText());
    setCategory('labor');
    setAmount('');
    setMemo('');
    setError(null);
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminAddExpense({ storeId, date, category, amount, memo });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '录入失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="手动录入运营费用"
      description="用于人力、租金、总部管理费等单笔成本。金额按元录入，可含两位小数。"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !storeId || !amount} onClick={submit}>
            {busy ? '保存中…' : '保存费用'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="门店">
          <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
            {includeBrand ? <option value="brand">品牌零售 / 总部</option> : null}
          </select>
        </Field>
        <Field label="发生日期">
          <input type="date" value={date} max={todayText()} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="费用类别">
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {EXPENSE_CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="金额（元）" hint="例如 68、1250.50">
          <input inputMode="decimal" value={amount} placeholder="0.00" onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="备注" className="span-2" hint="选填，最多 120 字。">
          <input value={memo} maxLength={120} placeholder="例如 10 月门店人力结算" onChange={(event) => setMemo(event.target.value)} />
        </Field>
      </div>
      <InlineError message={error} />
    </Modal>
  );
}

type ImportPreview = Awaited<ReturnType<typeof api.adminPreviewExpenses>>;

function ImportExpenseModal({
  open,
  onClose,
  onDone
}: {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setPreview(null);
    setError(null);
  }, [open]);

  const loadSample = async () => {
    setLoadingSample(true);
    setError(null);
    try {
      const sample = await api.adminExpenseSample();
      setText(sample.text);
      setPreview(await api.adminPreviewExpenses(sample.text));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '读取模板失败');
    } finally {
      setLoadingSample(false);
    }
  };

  const doPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.adminPreviewExpenses(text));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '解析失败');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.adminImportExpenses(text);
      onDone(`已导入 ${result.created} 笔，覆盖 ${result.storeCount} 个门店，合计 ${money(result.totalCents)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  const canCommit = !!preview && !preview.errors.length && preview.rows.length > 0;

  return (
    <Modal
      open={open}
      size="lg"
      title="批量导入运营费用"
      description="多个门店可写在同一个文件里，按门店名自动匹配。支持粘贴 CSV 或选择本地文件。"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-outline" disabled={busy || !text.trim()} onClick={doPreview}>
            预览校验
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !canCommit} onClick={commit}>
            {busy ? '处理中…' : preview ? `确认导入 ${preview.rows.length} 笔` : '确认导入'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row-gap">
          <button type="button" className="btn btn-sm btn-outline" disabled={loadingSample} onClick={loadSample}>
            <Icon name="sparkle" size={14} /> {loadingSample ? '载入中…' : '载入填写模板'}
          </button>
          <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={14} /> 选择 CSV
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="visually-hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const value = String(reader.result || '');
                  setText(value);
                  setPreview(null);
                };
                reader.readAsText(file, 'utf-8');
              }}
            />
          </label>
          <span className="faint tiny">模板按今天日期为每个授权门店各列出人力、租金、总部管理费与水电物业四行，金额请按实际填写。</span>
        </div>

        <Field label="CSV 内容" hint="列顺序：日期, 门店, 类别, 金额, 备注。第一行可以是表头。">
          <textarea
            value={text}
            rows={8}
            spellCheck={false}
            className="mono"
            style={{ fontSize: 12 }}
            placeholder={`日期,门店,类别,金额,备注\n${todayText()},上海·城市中心店,人力,68,当日人力`}
            onChange={(event) => {
              setText(event.target.value);
              setPreview(null);
            }}
          />
        </Field>

        <InlineError message={error} />

        {preview ? (
          <>
            <div className="import-stat">
              <div>
                有效行<strong>{preview.rows.length}</strong>
              </div>
              <div>
                合计金额<strong>{money(preview.totalCents)}</strong>
              </div>
              <div>
                覆盖门店<strong>{preview.storeCount}</strong>
              </div>
              <div>
                重复跳过<strong>{preview.duplicates}</strong>
              </div>
              <div>
                共解析<strong>{preview.lineCount} 行</strong>
              </div>
            </div>
            {preview.errors.length ? (
              <div className="inline-error" role="alert">
                <Icon name="alert" size={16} />
                <span>
                  {preview.errors.length} 个问题需要修正：
                  <br />
                  {preview.errors.slice(0, 6).map((item, index) => (
                    <span key={index}>
                      {item.line ? `第 ${item.line} 行：` : ''}
                      {item.message}
                      <br />
                    </span>
                  ))}
                  {preview.errors.length > 6 ? `…另有 ${preview.errors.length - 6} 条` : null}
                </span>
              </div>
            ) : null}
            <div className="import-preview">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>行</th>
                    <th>日期</th>
                    <th>门店</th>
                    <th>类别</th>
                    <th className="num">金额</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 60).map((row, index) => (
                    <tr key={index}>
                      <td className="faint">{row.line}</td>
                      <td className="nowrap">{row.date}</td>
                      <td>{row.storeName}</td>
                      <td>{row.categoryName}</td>
                      <td className="num">{money(row.amountCents)}</td>
                      <td className="faint">{row.memo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 60 ? <p className="faint tiny">预览仅显示前 60 行，导入时会处理全部有效行。</p> : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------- profit ------------------------------- */

function ProfitPage() {
  const [range, setRange] = useStoredRange('profit', 'today');
  const [selected, setSelected] = useState<string | null>(null);
  const query = useApi(() => api.adminProfit(rangeQuery(range)), [range]);

  if (query.loading && !query.data) return <Spinner label="正在核算门店利润" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const report = query.data;
  if (!report) return null;

  const row = report.rows.find((item) => item.storeId === selected) || null;
  const opex = row ? row.opexByCategory : report.totals.opexByCategory;
  const opexTotal = row ? row.opexCents : report.totals.opexCents;

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 财务"
        title="门店利润"
        description="门店净利 = 收入 − 原料成本（含重做）− 已审批报损 − 运营费用。报损须审批通过后计入。"
        meta={<span>统计区间：{rangeLabel(report.range)} · 全门店口径</span>}
        actions={<RangeBar value={range} onChange={setRange} busy={query.loading} />}
      />

      <div className="profit-grid">
        <div className="profit-cell dark">
          <span>净利</span>
          <strong>{money(report.totals.netCents)}</strong>
          <span>净利率 {percent(report.totals.netMargin)}</span>
        </div>
        <div className="profit-cell">
          <span>收入</span>
          <strong>{money(report.totals.revenueCents)}</strong>
        </div>
        <div className="profit-cell">
          <span>原料成本</span>
          <strong>{money(report.totals.ingredientCostCents)}</strong>
          <span className="faint tiny">含重做 {money(report.totals.remakeCostCents)}</span>
        </div>
        <div className="profit-cell">
          <span>已审批报损</span>
          <strong>{money(report.totals.lossCents)}</strong>
          <span className="faint tiny">待审批 {money(report.totals.pendingLossCents)}</span>
        </div>
        <div className="profit-cell">
          <span>运营费用</span>
          <strong>{money(report.totals.opexCents)}</strong>
          <span className="faint tiny">{report.totals.opexCount} 笔</span>
        </div>
      </div>

      <Panel
        title="门店明细"
        description="点击行查看该门店的费用构成。品牌零售作为独立利润单元列示。"
        flush
        actions={<span className="faint tiny">{report.rows.length} 个核算单元</span>}
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>门店</th>
                <th className="num">收入</th>
                <th className="num">原料成本</th>
                <th className="num">报损</th>
                <th className="num">毛利</th>
                <th className="num">运营费用</th>
                <th className="num">净利</th>
                <th className="num">净利率</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((item) => (
                <tr
                  key={item.storeId}
                  onClick={() => setSelected(item.storeId === selected ? null : item.storeId)}
                  style={{ cursor: 'pointer', background: item.storeId === selected ? '#fbf9f4' : undefined }}
                >
                  <td className="cell-title">
                    {item.store}
                    {item.pendingLossCents ? <span className="sub-cell">待审批报损 {money(item.pendingLossCents)}</span> : null}
                  </td>
                  <td className="num">{money(item.revenueCents)}</td>
                  <td className="num">{money(item.ingredientCostCents)}</td>
                  <td className="num">{money(item.lossCents)}</td>
                  <td className="num">{money(item.grossCents)}</td>
                  <td className="num">{money(item.opexCents)}</td>
                  <td className={`num ${item.netCents < 0 ? 'money-neg' : 'money-pos'}`}>{money(item.netCents)}</td>
                  <td className="num">{percent(item.netMargin)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>合计</td>
                <td className="num">{money(report.totals.revenueCents)}</td>
                <td className="num">{money(report.totals.ingredientCostCents)}</td>
                <td className="num">{money(report.totals.lossCents)}</td>
                <td className="num">{money(report.totals.grossCents)}</td>
                <td className="num">{money(report.totals.opexCents)}</td>
                <td className="num">{money(report.totals.netCents)}</td>
                <td className="num">{percent(report.totals.netMargin)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <Panel
        title={row ? `${row.store} · 费用构成` : '费用构成'}
        description={row ? `口径：${rangeLabel(report.range)}，仅计入有效费用。` : '全门店合计，点击上方任意门店可切换明细。'}
        actions={<strong>{money(opexTotal)}</strong>}
      >
        <div className="opex-strip">
          {opex.map((item) => (
            <div className="opex-chip" key={item.id}>
              <span>{item.name}</span>
              <strong>{money(item.amountCents)}</strong>
            </div>
          ))}
        </div>
        <div className="notice" style={{ marginTop: 12 }}>
          <Icon name="info" size={15} />
          <span>
            报损需总部审批通过后才扣减利润；待审批报损仅作风险提示。重做按实际发生的原料成本计入，不重复计收入。
          </span>
        </div>
      </Panel>
      <p className="page-foot-note">
        利润口径与财务流水分离：流水反映收款，利润在此基础上叠加商品成本、审批报损与运营费用。需要「利润与成本（敏感）」权限才能查看。
      </p>
    </>
  );
}

/* ------------------------------- approvals ------------------------------- */

function ApprovalsPage({ onChanged }: { onChanged: () => void }) {
  const { can } = useStaffAuth();
  const notify = useToast();
  const [view, setView] = useStoredState<'todo' | 'done' | 'all'>(
    'teahour.admin.approvals.view',
    'todo',
    ['todo', 'done', 'all']
  );
  const [kind, setKind] = useStoredState<'all' | 'REFUND' | 'LOSS' | 'ATTENDANCE'>(
    'teahour.admin.approvals.kind',
    'all',
    ['all', 'REFUND', 'LOSS', 'ATTENDANCE']
  );
  const query = useApi(() => api.adminApprovals({ view, kind }), [view, kind]);
  const [decision, setDecision] = useState<{ approval: Approval; action: 'approve' | 'reject' } | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDecision = (approval: Approval, action: 'approve' | 'reject') => {
    setDecision({ approval, action });
    setComment('');
    setError(null);
  };

  const submit = async () => {
    if (!decision) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.adminDecide(decision.approval.id, decision.action, comment || undefined);
      notify(decision.action === 'approve' ? '已通过审批' : '已驳回申请', 'ok');
      setDecision(null);
      query.reload({ silent: true });
      onChanged();
      if (result.approval.resultNote) notify(result.approval.resultNote, 'info');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '审批失败');
    } finally {
      setBusy(false);
    }
  };

  if (query.loading && !query.data) return <Spinner label="正在读取审批" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 风控"
        title="审批中心"
        description="退款、超限报损与补签都在这里处理：先看等待你审批的，再回看自己处理过的和全部留档。"
        actions={
          <Segmented
            value={kind}
            ariaLabel="审批类型"
            options={[
              { value: 'all', label: '全部' },
              { value: 'REFUND', label: '退款' },
              { value: 'LOSS', label: '报损' },
              // 补签只给有 attendance:approve 的岗位看，避免出现点了就被拒的筛选
              ...(can('attendance:approve') ? [{ value: 'ATTENDANCE' as const, label: '补签' }] : [])
            ]}
            onChange={setKind}
          />
        }
      />

      <Tabs
        value={view}
        onChange={setView}
        options={[
          { value: 'todo', label: '待我审批', count: data.counts.pending },
          { value: 'done', label: '我已处理', count: data.counts.done },
          { value: 'all', label: '全部记录', count: data.counts.total }
        ]}
      />

      <div style={{ marginTop: 14 }}>
        {data.approvals.map((approval) => {
          const permission = APPROVAL_PERM[approval.kind];
          const canDecide = view === 'todo' && approval.status === 'pending' && can(permission);
          return (
            <article className="approval-card" key={approval.id}>
              <div className="approval-head">
                <div>
                  <h3>
                    <Badge tone={APPROVAL_TONE[approval.kind]}>{APPROVAL_LABEL[approval.kind]}</Badge>{' '}
                    {approval.summary}
                  </h3>
                  <div className="approval-meta">
                    <span>{approval.storeName}</span>
                    {approval.orderNumber ? <span className="mono">{approval.orderNumber}</span> : null}
                    <span>申请人 {approval.requesterName}</span>
                    <span>{dateTimeText(approval.createdAt)}</span>
                    {approval.decidedAt ? <span>处理于 {dateTimeText(approval.decidedAt)}</span> : null}
                  </div>
                  {typeof approval.payload?.reason === 'string' && approval.payload.reason ? (
                    <p className="muted small" style={{ marginTop: 6 }}>
                      原因：{approval.payload.reason}
                    </p>
                  ) : null}
                  {approval.resultNote ? <p className="faint tiny" style={{ marginTop: 4 }}>{approval.resultNote}</p> : null}
                  {approval.comment ? <p className="faint tiny" style={{ marginTop: 4 }}>审批意见：{approval.comment}</p> : null}
                </div>
                <div className="approval-actions">
                  <span className="approval-amount">
                    {approval.kind === 'ATTENDANCE' ? durationText(attendanceMinutes(approval.payload)) : money(approval.amountCents)}
                  </span>
                  {view === 'todo' && approval.status === 'pending' ? (
                    canDecide ? (
                      <>
                        <button type="button" className="btn btn-sm btn-success-soft" onClick={() => openDecision(approval, 'approve')}>
                          通过
                        </button>
                        <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => openDecision(approval, 'reject')}>
                          驳回
                        </button>
                      </>
                    ) : (
                      <Badge tone="neutral">无审批权限</Badge>
                    )
                  ) : (
                    <StatusPill status={approval.status} />
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!data.approvals.length ? (
          <EmptyState
            icon="check"
            title={
              view === 'todo'
                ? '没有待你审批的申请'
                : view === 'done'
                  ? '还没有处理记录'
                  : '还没有审批记录'
            }
            description={
              view === 'todo'
                ? '新的退款或超限报损会自动出现在这里，审批后进入「我已处理」。'
                : view === 'done'
                  ? '通过或驳回过的退款、报损会保留在这里，金额与执行结果可回查。'
                  : '门店发起的退款、超限报损都会留档在这里，可按类型筛选回查。'
            }
          />
        ) : null}
      </div>

      <Modal
        open={!!decision}
        title={decision?.action === 'approve' ? '通过审批' : '驳回申请'}
        description={
          decision
            ? `${decision.approval.summary} · ${money(decision.approval.amountCents)}`
            : undefined
        }
        onClose={busy ? () => undefined : () => setDecision(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDecision(null)}>
              取消
            </button>
            <button
              type="button"
              className={`btn ${decision?.action === 'approve' ? 'btn-primary' : 'btn-danger'}`}
              disabled={busy}
              onClick={submit}
            >
              {busy ? '提交中…' : decision?.action === 'approve' ? '确认通过' : '确认驳回'}
            </button>
          </>
        }
      >
        <Field label="审批意见" hint="选填，最多 200 字，会写入审批记录与操作日志。">
          <textarea value={comment} rows={3} maxLength={200} onChange={(event) => setComment(event.target.value)} />
        </Field>
        {decision?.approval.kind === 'REFUND' ? (
          <div className="notice" style={{ marginTop: 12 }}>
            <Icon name="info" size={15} />
            <span>通过后将按申请的杯数执行退款：已制作杯数不计成本回冲，未制作部分退回原料库存。驳回不会产生退款。</span>
          </div>
        ) : (
          <div className="notice" style={{ marginTop: 12 }}>
            <Icon name="alert" size={15} />
            <span>通过后报损金额将计入该门店成本并扣减库存；驳回则保留原库存。此操作会出现在操作记录中。</span>
          </div>
        )}
        <InlineError message={error} />
      </Modal>
      <div style={{ marginTop: 16 }}>
        <RefundRulePanel />
      </div>
      <p className="page-foot-note">审批权限由角色控制：退款需「审批退款」，报损需「审批超限报损」，且门店范围必须覆盖申请门店。</p>
    </>
  );
}

/**
 * 退款审批规则。
 *
 * 以前只能读，现在总部可直接改：停用后所有退款即时执行；
 * 启用后，无「退款」权限的账号或金额达到门槛的退款会进入审批中心。
 */
function RefundRulePanel() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminRefundFlow(), []);
  const editable = can('approval:config');
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState('0.00');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    setEnabled(query.data.flow.enabled);
    setThreshold((query.data.flow.thresholdCents / 100).toFixed(2));
  }, [query.data]);

  const save = async () => {
    const amount = Number(threshold);
    if (!Number.isFinite(amount) || amount < 0) {
      notify('审批门槛应为不小于 0 的金额', 'danger');
      return;
    }
    setBusy(true);
    try {
      const result = await api.adminSaveRefundFlow({
        enabled,
        thresholdCents: Math.round(amount * 100)
      });
      setEnabled(result.flow.enabled);
      setThreshold((result.flow.thresholdCents / 100).toFixed(2));
      notify('退款审批规则已保存', 'ok');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '保存失败', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      eyebrow="审批流配置"
      title="退款审批规则"
      description="停用后所有退款即时执行；启用后，无「退款」权限的账号或金额达到门槛的退款会进入审批中心。"
    >
      {query.loading && !query.data ? (
        <Spinner label="正在读取退款规则" />
      ) : query.error && !query.data ? (
        <InlineError message={query.error} />
      ) : (
        <div className="form-grid">
          <Field label="审批开关">
            <div className="flex">
              {editable ? (
                <Switch checked={enabled} onChange={setEnabled} label="退款审批开关" />
              ) : (
                <Badge tone={enabled ? 'ok' : 'neutral'}>{enabled ? '已启用' : '已停用'}</Badge>
              )}
              <span className="small muted">{enabled ? '超出规则需要审批' : '所有退款即时执行'}</span>
            </div>
          </Field>
          <Field label="金额门槛（元）" hint="达到该金额的退款需要审批；填 0 表示所有退款都需要审批。">
            <input
              inputMode="decimal"
              value={threshold}
              disabled={!editable || !enabled}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </Field>
        </div>
      )}
      {query.data ? (
        editable ? (
          <div className="row-gap" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save}>
              {busy ? '保存中…' : '保存退款规则'}
            </button>
          </div>
        ) : (
          <p className="faint tiny" style={{ marginTop: 10 }}>当前账号只有查看权限，规则由总部超管或财务维护。</p>
        )
      ) : null}
    </Panel>
  );
}

/* ------------------------------- 排班表 ------------------------------- */

/** 30 分钟一档的选择项；已有班次不在整点半上时补进去，避免打开就丢值。 */
function timeOptions(from: number, to: number, extra: number[] = []) {
  const values = new Set<number>();
  for (let minute = from; minute <= to; minute += 30) values.add(minute);
  for (const minute of extra) if (minute >= from && minute <= to) values.add(minute);
  return [...values].sort((a, b) => a - b);
}

/**
 * 排班表：人 × 天的一格一段，点格子改。
 *
 * 故意不做「模板/批量复制」：门店一周只有几十格，逐格改反而不会错；
 * 班表也不参与打卡校验，它只在看板上提示计划 vs 实际，工资仍按实际工时结算。
 */
function SchedulePage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const confirm = useConfirm();
  const canManage = can('attendance:manage');

  const [storeId, setStoreId] = useState('');
  const [anchor, setAnchor] = useState(() => weekStartText(todayText()));
  const [editing, setEditing] = useState<{ userId: string; name: string; cell: ShiftCell } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const from = anchor;
  const to = addDaysText(anchor, 6);
  const query = useApi(() => api.attendanceShifts({ storeId: storeId || undefined, from, to }), [storeId, from, to]);

  if (query.loading && !query.data) return <Spinner label="正在读取班表" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  const currentWeek = weekStartText(data.today);
  const earliest = addDaysText(data.today, -data.limits.pastEditDays);
  const latest = addDaysText(data.today, data.limits.futureEditDays);
  const canEditDay = (day: string) => canManage && day >= earliest && day <= latest;
  const weekTag =
    from === currentWeek ? '本周' : from === addDaysText(currentWeek, 7) ? '下周' : from === addDaysText(currentWeek, -7) ? '上周' : '';
  // 短时只在「往天」成立，直接数格子，不额外让服务端算一个只用于文案的数字。
  const shortDays = data.rows.reduce(
    (sum, row) => sum + row.cells.filter((cell) => cell.state === 'short').length,
    0
  );

  const openEditor = (userId: string, name: string, cell: ShiftCell) => {
    setSaveError(null);
    setEditing({ userId, name, cell });
  };

  const saveShift = async (start: string, end: string, note: string) => {
    if (!editing) return;
    const startMin = clockToMinutes(start);
    const endMin = clockToMinutes(end);
    if (startMin == null || endMin == null) {
      setSaveError('请选择开始和结束时间');
      return;
    }
    if (endMin <= startMin) {
      setSaveError('结束时间要晚于开始时间（跨零点请拆成两天）');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api.attendanceSaveShift({
        storeId: data.storeId,
        userId: editing.userId,
        businessDate: editing.cell.businessDate,
        startMin,
        endMin,
        note
      });
      setEditing(null);
      notify(`${editing.name} ${editing.cell.businessDate} 的班次已保存`);
      await query.reload({ silent: true });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const clearShift = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: '清空这一天的班',
      message: `${editing.name} · ${editing.cell.businessDate} 的计划会删除；已经记录的实际工时不受影响。`,
      confirmText: '清空',
      tone: 'danger'
    });
    if (!ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.attendanceClearShift({
        storeId: data.storeId,
        userId: editing.userId,
        businessDate: editing.cell.businessDate
      });
      setEditing(null);
      notify('已清空这一天的班');
      await query.reload({ silent: true });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : '清空失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const cellView = (name: string, userId: string, cell: ShiftCell) => {
    const editable = canEditDay(cell.businessDate);
    const reason = !canManage
      ? '当前账号只能查看班表'
      : editable
        ? ''
        : `只能修改 ${earliest} 之后、${latest} 之前的班`;
    const stateText =
      cell.shift && (cell.state === 'done' || cell.state === 'short' || cell.state === 'absent')
        ? SHIFT_STATE_LABEL[cell.state]
        : '';
    const body = (
      <>
        {cell.shift ? (
          <span className="mono">{shiftText(cell.shift.startMin, cell.shift.endMin)}</span>
        ) : (
          <span className="shift-empty">{canManage ? '＋' : '—'}</span>
        )}
        {stateText ? <small className={`shift-state tone-${shiftStateTone(cell.state)}`}>{stateText}</small> : null}
      </>
    );
    if (!editable) {
      return (
        <div className="shift-cell is-static" title={reason}>
          {body}
        </div>
      );
    }
    return (
      <button
        type="button"
        className="shift-cell"
        title={cell.shift ? '点击修改这一天的班' : '点击排班'}
        aria-label={
          cell.shift
            ? `${name} ${cell.businessDate} ${shiftText(cell.shift.startMin, cell.shift.endMin)}，点击修改`
            : `${name} ${cell.businessDate} 未排班，点击排班`
        }
        onClick={() => openEditor(userId, name, cell)}
      >
        {body}
      </button>
    );
  };

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 门店"
        title="排班表"
        description="按门店排「几点该来」。周一起算，一次改一格；班表只作计划 vs 实际的对照，不拦打卡、不参与工资计算。"
        actions={
          <div className="row-gap">
            <select
              value={storeId || data.storeId}
              onChange={(event) => setStoreId(event.target.value)}
              aria-label="门店"
            >
              {data.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnchor(addDaysText(from, -7))}>
              上一周
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnchor(currentWeek)}>
              本周
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnchor(addDaysText(from, 7))}>
              下一周
            </button>
          </div>
        }
        meta={
          <>
            <span>
              {data.storeName} · {from} — {to}
            </span>
            {weekTag ? <Badge tone="accent">{weekTag}</Badge> : null}
            <span>
              {canManage ? `可修改 ${earliest} 起、${latest} 前的班` : '只读：修改班表需要「维护计划班次」权限'}
            </span>
          </>
        }
      />

      <div className="stat-grid">
        <Stat
          label="计划工时"
          value={durationText(data.summary.plannedMinutes)}
          hint={`${data.summary.people} 人排了班`}
          icon="calendar"
        />
        <Stat
          label="已记实际工时"
          value={durationText(data.summary.actualMinutes)}
          hint="只算已闭合的计时时段"
          icon="clock"
        />
        <Stat
          label="缺勤天数"
          value={data.summary.absentDays}
          hint={
            data.summary.absentDays
              ? `往天排了班却没计时，先确认是否请假${shortDays ? ` · ${shortDays} 天短时` : ''}`
              : shortDays
                ? `往天都来了 · ${shortDays} 天短时`
                : '往天没有排了班却没来的情况'
          }
          tone={data.summary.absentDays ? 'soft' : 'plain'}
          icon="alert"
        />
        <Stat
          label="计划人天"
          value={data.summary.plannedMinutes ? `${Math.round((data.summary.plannedMinutes / 480) * 10) / 10}` : '—'}
          hint="按 8 小时一天折算，只用于估人力"
          icon="users"
        />
      </div>

      <Panel
        title="一周班表"
        description={canManage ? '点任意格子填时间，再点一次就是改。同一个人同一天只排一段。' : '当前账号可查看班表。'}
        flush
      >
        {query.error ? <InlineError message={`${query.error}（展示的是最近一次成功读取的班表）`} /> : null}
        {!data.rows.length ? (
          <EmptyState
            icon="users"
            title="这家店还没有可排班的员工"
            description="先到「账号管理」把员工挂到这家店，再回来排班。"
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl shift-grid">
              <thead>
                <tr>
                  <th className="shift-name">员工</th>
                  {data.days.map((day) => (
                    <th key={day} className={`shift-day ${day === data.today ? 'is-today' : ''}`}>
                      <span>{weekdayText(day)}</span>
                      <small>
                        {day.slice(5)}
                        {day === data.today ? ' · 今天' : ''}
                      </small>
                    </th>
                  ))}
                  <th className="num">计划合计</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.userId}>
                    <td className="shift-name">
                      <strong>{row.name}</strong>
                      <small className="sub-cell">
                        {row.plannedMinutes ? `计划 ${durationText(row.plannedMinutes)}` : '未排班'}
                      </small>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.businessDate} className={cell.businessDate === data.today ? 'is-today' : ''}>
                        {cellView(row.name, row.userId, cell)}
                      </td>
                    ))}
                    <td className="num">{row.plannedMinutes ? durationText(row.plannedMinutes) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="notice">
        <Icon name="info" size={15} />
        <span>
          班表是「计划」，只用来对照：迟到、早走、临时来帮忙都不会被拦，缺勤/短时也只在看板上提示。
          工资按实际计时结算，月底出工时结算单时不会用到这一页。
        </span>
      </div>

      <ShiftEditor
        open={Boolean(editing)}
        storeName={data.storeName}
        editing={editing}
        saving={saving}
        error={saveError}
        onClose={() => setEditing(null)}
        onSave={saveShift}
        onClear={clearShift}
      />
    </>
  );
}

/** 单格编辑器：只改这一人这一天的开始/结束与备注。 */
function ShiftEditor({
  open,
  storeName,
  editing,
  saving,
  error,
  onClose,
  onSave,
  onClear
}: {
  open: boolean;
  storeName: string;
  editing: { userId: string; name: string; cell: ShiftCell } | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (start: string, end: string, note: string) => void;
  onClear: () => void;
}) {
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [note, setNote] = useState('');

  const shift = editing?.cell.shift || null;
  const startExtra = shift ? shift.startMin : null;
  const endExtra = shift ? shift.endMin : null;

  useEffect(() => {
    if (!open || !editing) return;
    setStart(editing.cell.shift ? shiftClock(editing.cell.shift.startMin) : '09:00');
    setEnd(editing.cell.shift ? shiftClock(editing.cell.shift.endMin) : '18:00');
    setNote(editing.cell.shift?.note || '');
  }, [open, editing]);

  if (!editing) return null;
  const cell = editing.cell;
  const startMin = clockToMinutes(start);
  const endMin = clockToMinutes(end);
  const planMinutes = startMin != null && endMin != null && endMin > startMin ? endMin - startMin : 0;
  const presets: Array<{ label: string; start: string; end: string }> = [
    { label: '早班 09:00–18:00', start: '09:00', end: '18:00' },
    { label: '晚班 12:00–21:00', start: '12:00', end: '21:00' },
    { label: '半天 10:00–14:00', start: '10:00', end: '14:00' }
  ];

  return (
    <Modal
      open={open}
      title={`排班 · ${editing.name}`}
      description={`${cell.businessDate} ${weekdayText(cell.businessDate)} · ${storeName}｜同一个人同一天只排一段`}
      onClose={onClose}
      footer={
        <>
          {cell.shift ? (
            <button type="button" className="btn btn-ghost" onClick={onClear} disabled={saving}>
              清空这一天
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(start, end, note)}
            disabled={saving || !planMinutes}
          >
            {saving ? '保存中…' : '保存班次'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="开始时间">
          <select value={start} onChange={(event) => setStart(event.target.value)} aria-label="开始时间">
            {timeOptions(0, 1439, startExtra == null ? [] : [startExtra]).map((minute) => (
              <option key={minute} value={shiftClock(minute)}>
                {shiftClock(minute)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="结束时间" hint="跨零点请拆成两天，各排一段。">
          <select value={end} onChange={(event) => setEnd(event.target.value)} aria-label="结束时间">
            {timeOptions(30, 1440, endExtra == null ? [] : [endExtra]).map((minute) => (
              <option key={minute} value={shiftClock(minute)}>
                {shiftClock(minute)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="备注（可选）" className="span-2" hint="如「早班」「临时顶班」，只给排班的人看。">
          <input
            value={note}
            maxLength={80}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：早班 / 顶班"
          />
        </Field>
      </div>

      <div className="row-gap shift-presets">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setStart(preset.start);
              setEnd(preset.end);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="shift-plan-preview">
        这段计划 {planMinutes ? durationText(planMinutes) : '—'}
        {cell.actualMinutes ? ` · 当天已记 ${durationText(cell.actualMinutes)}` : ''}
      </div>

      {error ? <InlineError message={error} /> : null}
    </Modal>
  );
}

/* ------------------------------- losses ------------------------------- */

/* ------------------------------ 在店看板 ------------------------------ */

/**
 * 在店看板：今天谁在店里、各人记了多少、哪些时段没闭合。
 *
 * 落在「运营管理」而不是「经营分析」，因为它回答的是「现在要不要打电话叫人」，
 * 不是月底算账——所以默认是今天，且只在店与未闭合两类会变色。
 */
function AttendancePage() {
  const [storeId, setStoreId] = useState('');
  const [date, setDate] = useState(todayText());
  const query = useApi(() => api.attendanceBoard(storeId || undefined, date), [storeId, date]);
  const now = useNow(1000);

  if (query.loading && !query.data) return <Spinner label="正在读取在店情况" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;
  // 回看往天时「正在店里」这个词不成立：那天的段要么已闭合，要么还挂在那里等人处理
  const isToday = data.date === todayText();

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 门店"
        title="在店看板"
        description="按天看在店情况：谁正在店里计时、谁已经下班、哪些时段忘了点离店。补签的审批在「审批中心 · 补签」。"
        actions={
          <div className="row-gap">
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)} aria-label="门店">
              <option value="">全部门店</option>
              {data.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              max={todayText()}
              onChange={(event) => setDate(event.target.value)}
              aria-label="日期"
            />
          </div>
        }
      />

      <div className="stat-grid">
        <Stat
          label={isToday ? '在店人数' : '仍在校时'}
          value={data.onDuty.length}
          hint={`统计范围：${data.storeName}`}
          icon="users"
        />
        <Stat
          label="已计入工时"
          value={durationText(data.summary.totalMinutes)}
          hint={
            data.summary.plannedMinutes
              ? `计划 ${durationText(data.summary.plannedMinutes)} · ${data.summary.peopleCount} 人`
              : `${data.summary.peopleCount} 人有记录`
          }
          icon="clock"
        />
        <Stat
          label="进行中"
          value={durationText(data.summary.liveMinutes)}
          hint="离店确认后才会转为已计入"
          tone={data.summary.liveMinutes ? 'soft' : 'plain'}
        />
        <Stat
          label="未闭合时段"
          value={data.summary.unresolvedCount}
          hint={data.summary.pendingApprovals ? `${data.summary.pendingApprovals} 段在等审批` : '没有待审批的补签'}
          tone={data.summary.unresolvedCount ? 'soft' : 'plain'}
          icon="alert"
        />
      </div>

      <Panel
        title={isToday ? '正在店里' : '当天仍在计时'}
        description="从到店确认开始实时计时。超过 16 小时未离店会自动转为待补签。"
        flush
      >
        {!data.onDuty.length ? (
          <EmptyState
            icon="clock"
            title={isToday ? '此刻没有人在店里计时' : '这一天没有仍在计时的时段'}
            description={`${data.date} 的到店记录会出现在下面；如果人明明在店里却没有记录，多半是忘了点到店确认。`}
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>员工</th>
                  <th>门店</th>
                  <th>到店</th>
                  <th className="num">已计时</th>
                </tr>
              </thead>
              <tbody>
                {data.onDuty.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.name}</td>
                    <td className="tiny muted">{row.storeName}</td>
                    <td className="tiny">{dateTimeText(row.clockInAt)}</td>
                    <td className="num mono">{elapsedText(row.clockInAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="未闭合的时段"
        description="待补签的时段不计工时；员工提交补签后进入审批中心，通过的才会补记。"
        flush
      >
        {!data.unresolved.length ? (
          <EmptyState icon="check" title="全部时段都闭合了" description="今天没有忘记离店的情况。" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>员工</th>
                  <th>门店</th>
                  <th>到店</th>
                  <th>状态</th>
                  <th className="num">已过时长</th>
                </tr>
              </thead>
              <tbody>
                {data.unresolved.map((row) => (
                  <tr key={row.sessionId}>
                    <td>{row.name}</td>
                    <td className="tiny muted">{row.storeName}</td>
                    <td className="tiny">{dateTimeText(row.clockInAt)}</td>
                    <td>
                      <Badge tone={sessionTone(row.status)}>{SESSION_LABEL[row.status] || row.status}</Badge>
                    </td>
                    <td className="num">
                      {row.status === 'open' ? (
                        <span className="mono">{elapsedText(row.clockInAt, now)}</span>
                      ) : (
                        <span className="muted">{durationText(row.liveMinutes || 0)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {data.notClocked.length ? (
        <Panel
          title="排了班没打卡"
          description="这一天在班表里有计划，却一条计时记录都没有。先确认是不是请假或临时调店，别直接当缺勤。"
          flush
        >
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>员工</th>
                  <th>门店</th>
                  <th className="num">计划工时</th>
                </tr>
              </thead>
              <tbody>
                {data.notClocked.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.name}</td>
                    <td className="tiny muted">{row.storeNames.join('、') || '—'}</td>
                    <td className="num">{durationText(row.plannedMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel
        title={`按人汇总 · ${data.date}`}
        description="同一人当天多段会累加；「计划」来自班表，只作对照，工资按实际工时结算。"
        flush
      >
        {!data.rows.length ? (
          <EmptyState icon="users" title="这一天没有在店记录" description="换一天或换门店看看。" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>员工</th>
                  <th>门店</th>
                  <th className="num">段数</th>
                  <th className="num">计划</th>
                  <th className="num">已计入</th>
                  <th className="num">进行中</th>
                  <th className="num">未闭合</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.name}</td>
                    <td className="tiny muted">{row.storeNames.join('、') || '—'}</td>
                    <td className="num">{row.sessions.length}</td>
                    <td className="num muted">{row.plannedMinutes ? durationText(row.plannedMinutes) : '—'}</td>
                    <td className="num">{durationText(row.minutes)}</td>
                    <td className="num muted">{row.liveMinutes ? durationText(row.liveMinutes) : '—'}</td>
                    <td className="num">
                      {row.unresolved ? (
                        <Badge tone="warn">{row.unresolved}</Badge>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="notice">
        <Icon name="info" size={15} />
        <span>
          工时按「已结束」的时段累加，跨零点会拆到两天。看板只反映计时情况，
          工资结算以月底的工时结算单为准。
        </span>
      </div>
    </>
  );
}

/* ------------------------------ 考勤月报 ------------------------------ */

const REPORT_TARGET: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  planned: { label: '未开始', tone: 'neutral' },
  done: { label: '已对上', tone: 'ok' },
  short: { label: '短时', tone: 'warn' },
  absent: { label: '缺勤', tone: 'danger' },
  none: { label: '计划外', tone: 'neutral' }
};

/** 差异带符号：+ 是多记的，− 是少记的；0 不写「0m」而写破折号，扫表更快。 */
function signedMinutesText(minutes: number) {
  if (!minutes) return '—';
  return `${minutes > 0 ? '+' : '−'}${durationText(Math.abs(minutes))}`;
}

/**
 * 考勤月报：一个月、一家店、一人一行，月底核对用。
 *
 * 数据和班表同一套口径（服务端算好），页面只负责「按月看汇总 + 按人下钻到天」。
 * 这里不出现金额：工资在「劳务结算」按门店单价出单，混在一起容易把计划工时当成应付工时。
 */
function AttendanceReportPage() {
  const [storeId, setStoreId] = useState('');
  const [month, setMonth] = useState(() => currentMonthText());
  const [personId, setPersonId] = useState('');
  const query = useApi(() => api.attendanceReport({ storeId: storeId || undefined, month }), [storeId, month]);

  if (query.loading && !query.data) return <Spinner label="正在汇总月度考勤" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  // 全员 × 整月会有很多「没班也没工时」的空行，汇总只留有内容的员工
  const active = data.rows.filter(
    (row) => row.plannedMinutes > 0 || row.actualMinutes > 0 || row.unresolvedCount > 0
  );
  const picked = active.find((row) => row.userId === personId) ?? null;
  const detail = (picked ? [picked] : active)
    .flatMap((row) =>
      row.days
        .filter((day) => day.shift || day.actualMinutes > 0 || day.unresolvedCount > 0)
        .map((day) => ({ row, day }))
    )
    .sort((a, b) => (a.day.businessDate === b.day.businessDate ? 0 : a.day.businessDate < b.day.businessDate ? 1 : -1));

  const diffMinutes = data.summary.actualMinutes - data.summary.plannedMinutes;
  const fileStem = `考勤月报-${data.storeName}-${data.month}`;

  const exportSummary = () =>
    exportCsv(
      `${fileStem}-汇总.csv`,
      ['门店', '月份', '员工', '出勤天数', '计划工时(分钟)', '实际工时(分钟)', '差异(分钟)', '缺勤天数', '短时天数', '未闭合段数'],
      active.map((row) => [
        data.storeName,
        data.month,
        row.name,
        row.presentDays,
        row.plannedMinutes,
        row.actualMinutes,
        row.actualMinutes - row.plannedMinutes,
        row.absentDays,
        row.shortDays,
        row.unresolvedCount
      ])
    );

  const exportDetail = () =>
    exportCsv(
      `${fileStem}-明细.csv`,
      ['门店', '月份', '日期', '员工', '班次', '计划(分钟)', '实际(分钟)', '结论', '未闭合段数'],
      detail.map(({ row, day }) => [
        data.storeName,
        data.month,
        day.businessDate,
        row.name,
        day.shift ? shiftText(day.shift.startMin, day.shift.endMin) : '',
        day.plannedMinutes,
        day.actualMinutes,
        REPORT_TARGET[day.state]?.label ?? day.state,
        day.unresolvedCount
      ])
    );

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 门店"
        title="考勤月报"
        description="按月核对工时：谁出勤了几天、计划与实际差多少、哪天缺勤或短时、还有哪些时段没闭合。工资请到「劳务结算」出单。"
        actions={
          <div className="row-gap">
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)} aria-label="门店">
              {data.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <input
              type="month"
              value={month}
              max={currentMonthText()}
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value);
              }}
              aria-label="月份"
            />
          </div>
        }
      />

      <div className="stat-grid">
        <Stat
          label="出勤人天"
          value={data.summary.attendanceDays}
          hint={`${data.summary.presentPeople} 人有工时 · ${data.summary.people} 人有排班或工时`}
          icon="users"
        />
        <Stat
          label="实际工时"
          value={durationText(data.summary.actualMinutes)}
          hint={data.summary.plannedMinutes ? `计划 ${durationText(data.summary.plannedMinutes)}` : '本月还没有排班'}
          icon="clock"
        />
        <Stat
          label="实际 − 计划"
          value={signedMinutesText(diffMinutes)}
          hint="计划只作对照，工资按实际工时结算"
          tone={diffMinutes ? 'soft' : 'plain'}
        />
        <Stat
          label="缺勤 / 短时"
          value={`${data.summary.absentDays} / ${data.summary.shortDays}`}
          hint={
            data.summary.unresolvedCount
              ? `${data.summary.unresolvedCount} 段未闭合，工时未计入`
              : '没有未闭合的时段'
          }
          tone={data.summary.unresolvedCount ? 'soft' : 'plain'}
          icon="alert"
        />
      </div>

      <Panel
        title="按人汇总"
        description="只列本月有排班、有工时或有未闭合时段的员工；点一行可下钻到这个人的人×天明细。"
        actions={
          <button type="button" className="btn btn-sm btn-ghost" disabled={!active.length} onClick={exportSummary}>
            <Icon name="download" size={14} /> 导出汇总
          </button>
        }
        flush
      >
        {!active.length ? (
          <EmptyState
            icon="chart"
            title="这个月还没有工时记录"
            description={`${data.month} 的到店记录会在这里按月汇总；排班只是计划，员工到店确认后才产生实际工时。`}
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>员工</th>
                  <th className="num">出勤</th>
                  <th className="num">计划</th>
                  <th className="num">实际</th>
                  <th className="num">差异</th>
                  <th className="num">缺勤</th>
                  <th className="num">短时</th>
                  <th className="num">未闭合</th>
                </tr>
              </thead>
              <tbody>
                {active.map((row) => {
                  const rowDiff = row.actualMinutes - row.plannedMinutes;
                  return (
                    <tr key={row.userId}>
                      <td>
                        {row.name}
                        {!row.plannedMinutes ? <span className="tiny muted"> · 未排班</span> : null}
                      </td>
                      <td className="num">{row.presentDays} 天</td>
                      <td className="num muted">{row.plannedMinutes ? durationText(row.plannedMinutes) : '—'}</td>
                      <td className="num">{row.actualMinutes ? durationText(row.actualMinutes) : '—'}</td>
                      <td className={`num${rowDiff ? '' : ' muted'}`}>
                        {row.plannedMinutes ? signedMinutesText(rowDiff) : '—'}
                      </td>
                      <td className="num">
                        {row.absentDays ? <Badge tone="danger">{row.absentDays}</Badge> : <span className="muted">—</span>}
                      </td>
                      <td className="num">
                        {row.shortDays ? <Badge tone="warn">{row.shortDays}</Badge> : <span className="muted">—</span>}
                      </td>
                      <td className="num">
                        {row.unresolvedCount ? (
                          <Badge tone="warn">{row.unresolvedCount}</Badge>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setPersonId(picked?.userId === row.userId ? '' : row.userId)}
                        >
                          {picked?.userId === row.userId ? '收起明细' : '看明细'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="人 × 天明细"
        description="只列有班、有工时或有未闭合时段的日期；今天不判缺勤，短时/缺勤只看往天。"
        actions={
          <div className="row-gap">
            <select value={personId} onChange={(event) => setPersonId(event.target.value)} aria-label="员工">
              <option value="">全部员工</option>
              {active.map((row) => (
                <option key={row.userId} value={row.userId}>
                  {row.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm btn-ghost" disabled={!detail.length} onClick={exportDetail}>
              <Icon name="download" size={14} /> 导出明细
            </button>
          </div>
        }
        flush
      >
        {!detail.length ? (
          <EmptyState
            icon="calendar"
            title="没有可展开的明细"
            description="这个人本月既没有排班也没有工时；换个人或换个月份再看看。"
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>员工</th>
                  <th>班次</th>
                  <th className="num">计划</th>
                  <th className="num">实际</th>
                  <th>结论</th>
                  <th className="num">未闭合</th>
                </tr>
              </thead>
              <tbody>
                {detail.map(({ row, day }) => {
                  const target = REPORT_TARGET[day.state] ?? { label: day.state, tone: 'neutral' as const };
                  return (
                    <tr key={`${row.userId}|${day.businessDate}`}>
                      <td>
                        {day.businessDate}
                        <span className="tiny muted"> {weekdayText(day.businessDate)}</span>
                      </td>
                      <td>{row.name}</td>
                      <td className="muted">{day.shift ? shiftText(day.shift.startMin, day.shift.endMin) : '—'}</td>
                      <td className="num muted">{day.plannedMinutes ? durationText(day.plannedMinutes) : '—'}</td>
                      <td className="num">{day.actualMinutes ? durationText(day.actualMinutes) : '—'}</td>
                      <td>
                        <Badge tone={target.tone}>{target.label}</Badge>
                      </td>
                      <td className="num">
                        {day.unresolvedCount ? <Badge tone="warn">{day.unresolvedCount}</Badge> : <span className="muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="notice">
        <Icon name="info" size={15} />
        <span>
          实际工时只累加「已结束」的时段，跨零点会拆到两天；未闭合时段（忘了点离店、等审批的补签）先不计入、
          在这里单独计数。金额与单价不在这页，请看「劳务结算」。
        </span>
      </div>
    </>
  );
}

/* ------------------------------ 劳务结算 ------------------------------ */

function currentMonthText() {
  return todayText().slice(0, 7);
}

/** 只做「年月」加减；用本地日历而不是 UTC，避免月初/月末换算后差一个月。 */
function monthShift(month: string, delta: number) {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return month;
  const date = new Date(year, mon - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const SETTLEMENT_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  draft: { label: '待确认', tone: 'warn' },
  posted: { label: '已入账', tone: 'ok' },
  voided: { label: '已作废', tone: 'neutral' }
};

/**
 * 劳务结算：一个月一批，按「门店 × 员工」出单。
 *
 * 页面上三件事按顺序做：先定单价（门店维度），再出单/重算（草稿可反复算），
 * 最后逐张确认入账（写人力费用，金额从此不可变）。阻断项（未闭合时段、审批中的补签）
 * 只拦「确认」，不拦「出单」——先出单看清差多少，再去补签，比一个都出不来有用。
 */
function SettlementsPage() {
  const notify = useToast();
  const [month, setMonth] = useState(() => monthShift(currentMonthText(), -1));
  const [storeId, setStoreId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState<WorkSettlement | null>(null);
  const [detail, setDetail] = useState<WorkSettlement | null>(null);
  const query = useApi(() => api.attendanceSettlements({ month, storeId: storeId || undefined }), [month, storeId]);
  const rates = useApi(() => api.attendanceLaborRates(), []);

  const data = query.data;
  const monthClosed = !!data && data.periodEnd < todayText();

  if (query.loading && !data) return <Spinner label="正在读取结算单" />;
  if (query.error && !data) return <InlineError message={query.error} />;
  if (!data) return null;

  // 门店下拉以单价列表为准（含还没出过单的门店），再并上当期有单的店，避免切月份后选项跳动。
  const storeOptions = new Map<string, string>((rates.data?.rows ?? []).map((row) => [row.storeId, row.name]));
  data.rows.forEach((row) => storeOptions.set(row.storeId, row.storeName));

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await api.attendanceGenerateSettlements({ month, storeId: storeId || undefined });
      query.setData(result);
      notify(
        `出单完成：新建 ${result.created} 张，重算 ${result.updated} 张，跳过已入账 ${result.skipped} 张`,
        'ok'
      );
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '出单失败', 'danger');
    } finally {
      setGenerating(false);
    }
  };

  const exportCurrent = () => {
    exportCsv(
      `劳务结算-${data.month}.csv`,
      ['门店', '员工', '月份', '计价小时', '计时分钟', '单价（元/小时）', '基础（元）', '调整（元）', '合计（元）', '状态', '未闭合段', '待审批', '调整备注', '入账备注'],
      data.rows.map((row) => [
        row.storeName,
        row.userName,
        row.month,
        row.hours,
        row.minutes,
        (row.hourlyCents / 100).toFixed(2),
        (row.baseAmountCents / 100).toFixed(2),
        (row.adjustmentCents / 100).toFixed(2),
        (row.amountCents / 100).toFixed(2),
        SETTLEMENT_STATUS[row.status]?.label || row.status,
        row.unclosedCount,
        row.pendingApprovals,
        row.adjustmentNote,
        row.confirmedNote
      ])
    );
    notify(`已导出 ${data.month} 的 ${data.rows.length} 张结算单`, 'ok');
  };

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 运营"
        title="劳务结算"
        description="按「门店 × 员工 × 月」出单：先把门店劳务单价定好，再出单看金额；确认入账会写入一笔人力费用，金额从此不可改。未闭合的时段与审批中的补签只拦确认，不拦出单。"
        meta={
          <span>
            {data.month} · {data.rows.length} 张 · 已入账 {data.summary.postedCount} 张
          </span>
        }
        actions={
          <div className="row-gap">
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)} aria-label="门店">
              <option value="">全部门店</option>
              {[...storeOptions.entries()].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <input
              type="month"
              value={month}
              max={currentMonthText()}
              onChange={(event) => setMonth(event.target.value || currentMonthText())}
              aria-label="结算月份"
            />
            <button type="button" className="btn btn-primary" disabled={generating} onClick={generate}>
              {generating ? '出单中…' : '出单 / 重算'}
            </button>
          </div>
        }
      />

      <div className="stat-grid">
        <Stat
          label="应结总额"
          value={money(data.summary.amountCents)}
          hint={`基础 ${money(data.summary.baseAmountCents)}${data.summary.postedCount ? `，含已入账 ${data.summary.postedCount} 张` : ''}`}
          icon="coin"
        />
        <Stat
          label="待确认"
          value={data.summary.draftCount}
          hint="草稿可重算，入账后不可改"
          tone={data.summary.draftCount ? 'soft' : 'plain'}
        />
        <Stat label="已入账" value={data.summary.postedCount} hint="已写入人力费用" icon="check" />
        <Stat
          label="未闭合时段"
          value={data.summary.unclosedCount}
          hint={data.summary.unclosedCount ? '补完离店或补签后才能确认' : '没有待补的时段'}
          tone={data.summary.unclosedCount ? 'soft' : 'plain'}
          icon="alert"
        />
      </div>

      <Panel
        title="结算单"
        description={
          monthClosed
            ? '确认入账后金额锁定；要改只能作废重出。'
            : '本月还没结束，可以先出单预览；月末结束后才能确认入账。'
        }
        actions={
          <button type="button" className="btn btn-sm btn-ghost" disabled={!data.rows.length} onClick={exportCurrent}>
            导出 CSV
          </button>
        }
      >
        {data.rows.length ? (
          <div className="table-wrap">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>门店 / 员工</th>
                  <th className="num">计价工时</th>
                  <th className="num">单价</th>
                  <th className="num">基础</th>
                  <th className="num">调整</th>
                  <th className="num">合计</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const blocked = row.unclosedCount > 0 || row.pendingApprovals > 0;
                  const status = SETTLEMENT_STATUS[row.status] ?? { label: row.status, tone: 'neutral' as const };
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="cell-title">{row.userName}</div>
                        <div className="faint tiny">
                          {row.storeName} · {row.periodStart.slice(5)}—{row.periodEnd.slice(5)}
                        </div>
                      </td>
                      <td className="num">
                        {row.hours} 小时
                        {row.minutes !== row.billableMinutes ? (
                          <div className="faint tiny">计 {durationText(row.minutes)}，满点计</div>
                        ) : null}
                      </td>
                      <td className="num">
                        {money(row.hourlyCents)}
                        <div className="faint tiny">{row.ratePerMinCents} 分/分钟</div>
                      </td>
                      <td className="num">{money(row.baseAmountCents)}</td>
                      <td className="num">
                        {row.adjustmentCents ? money(row.adjustmentCents, { sign: true }) : <span className="muted">—</span>}
                        {row.adjustmentNote ? <div className="faint tiny">{row.adjustmentNote}</div> : null}
                      </td>
                      <td className="num">
                        <strong>{money(row.amountCents)}</strong>
                      </td>
                      <td>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {row.status === 'draft' && blocked ? (
                          <div className="faint tiny" style={{ marginTop: 4 }}>
                            {row.unclosedCount ? `${row.unclosedCount} 段未闭合` : ''}
                            {row.unclosedCount && row.pendingApprovals ? ' · ' : ''}
                            {row.pendingApprovals ? `${row.pendingApprovals} 条补签待审批` : ''}
                          </div>
                        ) : null}
                        {row.status === 'posted' ? (
                          <div className="faint tiny" style={{ marginTop: 4 }}>
                            {row.confirmedAt ? `${dateTimeText(row.confirmedAt)} 入账` : '已入账'}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="row-gap">
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={!monthClosed || blocked}
                              title={
                                !monthClosed
                                  ? '本月还没结束，结束后才能入账'
                                  : blocked
                                    ? '还有未闭合时段或待审批补签，先处理完再入账'
                                    : undefined
                              }
                              onClick={() => setConfirming(row)}
                            >
                              确认入账
                            </button>
                          ) : null}
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDetail(row)}>
                            明细
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="coin"
            title={`${data.month} 还没有结算单`}
            description="先在上面点「出单 / 重算」，系统会按当期已结束的时段，为每家店的每位员工生成一张草稿。"
          />
        )}
      </Panel>

      <LaborRatePanel
        maxRatePerMinCents={rates.data?.maxRatePerMinCents ?? 0}
        rows={rates.data?.rows ?? null}
        loading={rates.loading && !rates.data}
        error={rates.error}
        onSaved={() => {
          rates.reload({ silent: true }).catch(() => undefined);
          // 单价变了，草稿金额也会变：顺手重算一遍再刷新，省得用户手动点两次。
          query.reload({ silent: true }).catch(() => undefined);
        }}
      />

      <div className="notice">
        <Icon name="info" size={15} />
        <span>
          计价按小时向下取整：不足 1 小时的零头不计，整点分钟 × 门店单价。未设置单价的门店按 0 元计，
          出单后金额为 0 的草稿不会产生费用行；调整额需要写明原因，入账后可以按来源「劳务结算」在财务流水里找到。
        </span>
      </div>

      <ConfirmSettlementModal
        row={confirming}
        onClose={() => setConfirming(null)}
        onDone={() => {
          setConfirming(null);
          notify('结算单已入账，人力费用已记入财务流水', 'ok');
          query.reload({ silent: true });
        }}
      />

      <Modal
        open={!!detail}
        title={detail ? `${detail.storeName} · ${detail.userName} · ${detail.month}` : '结算明细'}
        description={detail ? `计价 ${detail.hours} 小时 × ${money(detail.hourlyCents)}/小时，合计 ${money(detail.amountCents)}` : undefined}
        onClose={() => setDetail(null)}
        size="md"
        footer={
          <button type="button" className="btn btn-ghost" onClick={() => setDetail(null)}>
            关闭
          </button>
        }
      >
        {detail ? (
          <div className="table-wrap">
            <table className="tbl tbl-compact">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>时段</th>
                  <th className="num">分钟</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.sessionId}>
                    <td>{line.businessDate}</td>
                    <td>
                      {line.from} — {line.to}
                    </td>
                    <td className="num">{line.minutes}</td>
                  </tr>
                ))}
                {!detail.lines.length ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      这张单只有未闭合的时段，没有可计价的行。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {detail.confirmedNote ? (
              <p className="faint tiny" style={{ marginTop: 8 }}>
                入账备注：{detail.confirmedNote}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/** 门店劳务单价：单位是「元/小时」，落库换算成整数「分/分钟」，换算误差在保存后立刻回显。 */
function LaborRatePanel({
  rows,
  maxRatePerMinCents,
  loading,
  error,
  onSaved
}: {
  rows: LaborRateRow[] | null;
  maxRatePerMinCents: number;
  loading: boolean;
  error: string | null;
  onSaved: () => void;
}) {
  const notify = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!rows) return;
    // 只补齐还没进入草稿的门店：保存某一行会触发整表刷新，不能把别行还没保存的输入冲掉。
    setDraft((current) => {
      const next = { ...current };
      rows.forEach((row) => {
        if (next[row.storeId] === undefined) next[row.storeId] = (row.hourlyCents / 100).toFixed(2);
      });
      return next;
    });
  }, [rows]);

  const save = async (row: LaborRateRow) => {
    const yuan = Number(draft[row.storeId] ?? '');
    if (!Number.isFinite(yuan) || yuan < 0) return notify('单价请填不小于 0 的数字', 'danger');
    const cents = Math.round((yuan * 100) / 60);
    if (maxRatePerMinCents && cents > maxRatePerMinCents) {
      return notify(`单价不能超过 ${money(maxRatePerMinCents * 60)}/小时，请确认填的是时薪`, 'danger');
    }
    setBusyId(row.storeId);
    try {
      const saved = await api.attendanceSaveLaborRate(row.storeId, { laborRatePerMinCents: cents });
      setDraft((current) => ({ ...current, [row.storeId]: (saved.hourlyCents / 100).toFixed(2) }));
      notify(`${row.name} 单价已更新为 ${money(saved.hourlyCents)}/小时`, 'ok');
      onSaved();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '保存单价失败', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel
      title="门店劳务单价"
      description="结算金额 = 计价小时 × 单价。这里改的是门店级默认单价，已入账的结算单不受影响；重新出单才会用新价。"
    >
      {loading ? (
        <Spinner label="正在读取单价" />
      ) : error && !rows ? (
        <InlineError message={error} />
      ) : rows && rows.length ? (
        <div className="table-wrap">
          <table className="tbl tbl-compact">
            <thead>
              <tr>
                <th>门店</th>
                <th className="num">当前（元/小时）</th>
                <th className="num">等价单价</th>
                <th>新单价（元/小时）</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const value = draft[row.storeId] ?? '';
                const dirty = value !== (row.hourlyCents / 100).toFixed(2);
                return (
                  <tr key={row.storeId}>
                    <td>
                      <div className="cell-title">{row.name}</div>
                      <div className="faint tiny">{row.city || '—'}</div>
                    </td>
                    <td className="num">{money(row.hourlyCents)}</td>
                    <td className="num faint tiny">{row.laborRatePerMinCents} 分/分钟</td>
                    <td>
                      <input
                        inputMode="decimal"
                        value={value}
                        aria-label={`${row.name} 劳务单价`}
                        style={{ maxWidth: 130 }}
                        onChange={(event) => setDraft({ ...draft, [row.storeId]: event.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn btn-sm ${dirty ? 'btn-primary' : 'btn-ghost'}`}
                        disabled={busyId === row.storeId || !dirty}
                        onClick={() => save(row)}
                      >
                        {busyId === row.storeId ? '保存中…' : '保存'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="store" title="还没有可维护的门店" description="先在「门店配置」里创建门店。" />
      )}
    </Panel>
  );
}

function ConfirmSettlementModal({
  row,
  onClose,
  onDone
}: {
  row: WorkSettlement | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [adjust, setAdjust] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setAdjust('');
    setAdjustNote('');
    setNote('');
    setError(null);
    setBusy(false);
  }, [row]);

  const parsed = Number(adjust.trim() === '' ? '0' : adjust);
  const adjustmentCents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  const preview = (row?.baseAmountCents ?? 0) + adjustmentCents;

  const submit = async () => {
    if (!row) return;
    if (!Number.isFinite(parsed)) {
      setError('调整额请填数字，正数为补发、负数为扣减');
      return;
    }
    if (adjustmentCents !== 0 && !adjustNote.trim()) {
      setError('填写了调整金额必须写调整原因');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.attendanceConfirmSettlement(row.id, {
        adjustmentCents,
        adjustmentNote: adjustNote.trim() || undefined,
        note: note.trim() || undefined
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '确认入账失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!row}
      title="确认劳务结算"
      description={row ? `${row.storeName} · ${row.userName} · ${row.month}，入账后金额不可修改。` : undefined}
      onClose={busy ? () => undefined : onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || preview < 0} onClick={submit}>
            {busy ? '入账中…' : '确认入账'}
          </button>
        </>
      }
    >
      {row ? (
        <>
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table className="tbl tbl-compact">
              <tbody>
                <tr>
                  <td>计价工时</td>
                  <td className="num">{row.hours} 小时</td>
                </tr>
                <tr>
                  <td>基础劳务</td>
                  <td className="num">{money(row.baseAmountCents)}</td>
                </tr>
                <tr>
                  <td>调整后合计</td>
                  <td className="num">
                    <strong>{money(preview)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="form-grid">
            <Field label="调整额（元）" hint="正数补发、负数扣减；0 表示不调整。">
              <input
                inputMode="decimal"
                value={adjust}
                placeholder="0.00"
                onChange={(event) => setAdjust(event.target.value)}
              />
            </Field>
            <Field label="调整原因" hint="调整不为 0 时必填，会写进财务流水与操作记录。">
              <input
                value={adjustNote}
                maxLength={200}
                onChange={(event) => setAdjustNote(event.target.value)}
              />
            </Field>
            <div className="span-2">
              <Field label="入账备注" hint="选填，记录这张单的特殊说明。">
                <input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
              </Field>
            </div>
          </div>
          {error ? <InlineError message={error} /> : null}
        </>
      ) : null}
    </Modal>
  );
}

function LossesPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const [range, setRange] = useStoredRange('losses', '30');
  const [status, setStatus] = useStoredState<'all' | 'pending' | 'approved' | 'rejected'>(
    'teahour.admin.losses.status',
    'all',
    ['all', 'pending', 'approved', 'rejected']
  );
  const query = useApi(() => api.adminLosses({ ...rangeQuery(range), status }), [range, status]);
  const [policy, setPolicy] = useState<LossPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data?.policy) setPolicy(query.data.policy);
  }, [query.data?.policy]);

  if (query.loading && !query.data) return <Spinner label="正在读取报损数据" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  const savePolicy = async () => {
    if (!policy) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.adminSaveLossPolicy({
        enabled: policy.enabled,
        monthlyRatio: policy.monthlyRatio,
        approvalThresholdCents: policy.approvalThresholdCents
      });
      setPolicy(result.policy);
      notify('报损规则已保存', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 风控"
        title="报损与损耗"
        description="按门店跟踪报损金额占销售额比例，超过预警线时提示。审批通过后自动计入利润成本。"
        meta={<span>统计区间：{rangeLabel(data.range)} · 合计 {money(data.summary.totalCents)}</span>}
        actions={
          <RangeBar value={range} onChange={setRange} busy={query.loading}>
            <Segmented
              value={status}
              ariaLabel="报损状态"
              options={[
                { value: 'all', label: '全部' },
                { value: 'pending', label: '待审批' },
                { value: 'approved', label: '已通过' },
                { value: 'rejected', label: '已驳回' }
              ]}
              onChange={setStatus}
            />
          </RangeBar>
        }
      />

      <div className="stat-grid">
        <Stat label="报损金额" value={money(data.summary.totalCents)} hint={`${data.losses.length} 笔记录`} tone="dark" icon="alert" />
        <Stat label="待审批金额" value={money(data.summary.pendingTotalCents)} hint="通过后计入门店成本" />
        <Stat label="预警线" value={`${data.policy.monthlyRatio}%`} hint="报损 / 销售额" />
        <Stat label="审批门槛" value={money(data.policy.approvalThresholdCents)} hint="超过需总部审批" />
      </div>

      {can('loss:config') && policy ? (
        <Panel
          title="规则与预警"
          description="调整后立即生效；审批人仍按角色权限与门店范围判断。"
          actions={
            <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={savePolicy}>
              {saving ? '保存中…' : '保存规则'}
            </button>
          }
        >
          <div className="loss-policy">
            <Field label="启用报损规则">
              <div className="flex">
                <Switch checked={policy.enabled} onChange={(next) => setPolicy({ ...policy, enabled: next })} label="启用报损规则" />
                <span className="small muted">{policy.enabled ? '启用中' : '已停用'}</span>
              </div>
            </Field>
            <Field label="月度报损预警线（%）">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={policy.monthlyRatio}
                onChange={(event) => setPolicy({ ...policy, monthlyRatio: Number(event.target.value) })}
              />
            </Field>
            <Field label="审批门槛（元）" hint="超过该金额的报损需要总部审批。">
              <input
                type="number"
                min={0}
                step={1}
                value={policy.approvalThresholdCents / 100}
                onChange={(event) =>
                  setPolicy({ ...policy, approvalThresholdCents: Math.round(Number(event.target.value) * 100) })
                }
              />
            </Field>
            <Field label="审批人范围">
              <input value={(policy.approvers || []).length ? `${policy.approvers.length} 个账号` : '按角色权限自动匹配'} readOnly />
            </Field>
          </div>
          <InlineError message={error} />
        </Panel>
      ) : null}

      <Panel title="门店损耗" description="比例为所选区间内报损金额 ÷ 销售额。" flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>门店</th>
                <th className="num">销售额</th>
                <th className="num">报损</th>
                <th className="num">待审批</th>
                <th>比例</th>
                <th className="num">笔数</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.rows.map((row) => {
                const tone = row.warning ? 'danger' : row.ratio > data.policy.monthlyRatio * 0.7 ? 'warn' : 'ok';
                return (
                  <tr key={row.storeId}>
                    <td className="cell-title">{row.store}</td>
                    <td className="num">{money(row.salesCents)}</td>
                    <td className="num">{money(row.amountCents)}</td>
                    <td className="num faint">{money(row.pendingCents)}</td>
                    <td style={{ minWidth: 150 }}>
                      <div className="flex">
                        <div className={`meter ${tone}`} style={{ flex: 1 }}>
                          <span style={{ width: `${Math.min(100, (row.ratio / Math.max(1, data.policy.monthlyRatio)) * 100)}%` }} />
                        </div>
                        <span className="tiny num">{percent(row.ratio)}</span>
                      </div>
                      {row.warning ? <span className="sub-cell" style={{ color: 'var(--danger)' }}>超过预警线</span> : null}
                    </td>
                    <td className="num">
                      {row.count}
                      {row.pending ? <span className="sub-cell">{row.pending} 待审批</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!data.summary.rows.length ? <EmptyState icon="alert" title="区间内没有报损记录" /> : null}
        </div>
      </Panel>

      <Panel title="报损记录" description="门店现场登记，总部按门槛审批。" flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>时间</th>
                <th>门店</th>
                <th>商品</th>
                <th className="num">数量</th>
                <th className="num">金额</th>
                <th>原因</th>
                <th>状态</th>
                <th>审批</th>
              </tr>
            </thead>
            <tbody>
              {data.losses.map((loss) => (
                <tr key={loss.id}>
                  <td className="nowrap">{dateTimeText(loss.at)}</td>
                  <td>{loss.storeName}</td>
                  <td className="cell-title">{loss.name}</td>
                  <td className="num">
                    {loss.qty}
                    {loss.unit}
                  </td>
                  <td className="num">{money(loss.amountCents)}</td>
                  <td className="faint">{loss.reason}{loss.note ? ` · ${loss.note}` : ''}</td>
                  <td>
                    <StatusPill status={loss.status} />
                  </td>
                  <td className="faint tiny">
                    {loss.decidedAt ? `${dateTimeText(loss.decidedAt)}${loss.decisionNote ? ` · ${loss.decisionNote}` : ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.losses.length ? <EmptyState icon="alert" title="没有符合筛选的报损记录" /> : null}
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------- products ------------------------------- */

const CATEGORY_KIND_LABEL: Record<string, string> = {
  tea: '鲜酿',
  fresh: '鲜酿',
  retail: '零售',
  bottle: '瓶装'
};

function categoryKindLabel(kind?: string) {
  return CATEGORY_KIND_LABEL[kind || ''] || kind || '';
}

function ProductsPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminProducts(), []);
  const [search, setSearch] = useState('');
  const [series, setSeries] = useState<'all' | Series>('all');
  const [kind, setKind] = useState<'all' | 'tea' | 'retail' | 'bottle'>('all');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [reordering, setReordering] = useState(false);

  if (query.loading && !query.data) return <Spinner label="正在读取商品目录" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  const list = data.products.filter((product) => {
    if (series !== 'all' && product.series !== series) return false;
    if (kind !== 'all' && product.kind !== kind) return false;
    if (search && !`${product.name}${product.nameEn}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // 茶单按「系列 → 分类」分组展示，顺序只在同系列同分类内调整；筛选隐藏了同组商品时先收起排序按钮，避免误操作。
  const reorderBlocked = Boolean(search.trim()) || kind !== 'all';
  const moveProduct = async (product: Product, direction: -1 | 1) => {
    const group = data.products.filter((item) => item.series === product.series && item.categoryId === product.categoryId);
    const index = group.findIndex((item) => item.id === product.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= group.length) return;
    const ids = group.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setReordering(true);
    try {
      await api.adminReorderProducts(ids);
      notify('茶单顺序已更新', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '调整顺序失败', 'danger');
    } finally {
      setReordering(false);
    }
  };

  const togglePublish = async (product: Product) => {
    try {
      await api.adminUpdateProduct(product.id, { status: product.status === 'published' ? 'archived' : 'published' });
      notify(product.status === 'published' ? '已下架' : '已上架', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '操作失败', 'danger');
    }
  };

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 商品"
        title="商品目录"
        description="全部门店共用统一商品与配方。茶单顺序默认由总部维护，门店可在「本店在售」中覆盖本店顺序；售价与上下架由总部管理。"
        meta={<span>{data.products.length} 个商品 · {data.categories.length} 个分类</span>}
        actions={
          can('product:edit') ? (
            <>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setCategoryOpen(true)}>
                <Icon name="grid" size={14} /> 分类管理
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
                <Icon name="plus" size={14} /> 新建商品
              </button>
            </>
          ) : null
        }
      />

      <Panel
        title="全部商品"
        actions={
          <div className="toolbar">
            <div className="search">
              <Icon name="search" size={15} />
              <input value={search} placeholder="搜索商品" aria-label="搜索商品" onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select value={series} onChange={(event) => setSeries(event.target.value as 'all' | Series)} aria-label="筛选系列">
              <option value="all">全部系列</option>
              {(['xing', 'song', 'qing', 'mian'] as Series[]).map((key) => (
                <option key={key} value={key}>
                  {SERIES[key].char} · {SERIES[key].nameEn}
                </option>
              ))}
            </select>
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} aria-label="筛选类型">
              <option value="all">全部类型</option>
              <option value="tea">现制茶饮</option>
              <option value="retail">零售</option>
              <option value="bottle">瓶装</option>
            </select>
          </div>
        }
        flush
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>顺序</th>
                <th>商品</th>
                <th>系列</th>
                <th>分类</th>
                <th>类型</th>
                {can('product:price') ? <th className="num">售价</th> : null}
                {can('product:price') ? <th className="num">成本</th> : null}
                <th className="num">投茶量</th>
                <th className="num">全部门店库存</th>
                <th>状态</th>
                <th className="actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((product) => {
                const category = data.categories.find((item) => item.id === product.categoryId);
                const group = data.products.filter(
                  (item) => item.series === product.series && item.categoryId === product.categoryId
                );
                const index = group.findIndex((item) => item.id === product.id);
                const canReorder = can('product:edit') && !reorderBlocked;
                return (
                  <tr key={product.id}>
                    <td>
                      {canReorder ? (
                        <div className="order-actions">
                          <button
                            type="button"
                            className="order-btn"
                            aria-label={`${product.name} 上移`}
                            title="在同系列同分类内上移"
                            disabled={reordering || index <= 0}
                            onClick={() => moveProduct(product, -1)}
                          >
                            <Icon name="arrowUp" size={13} />
                          </button>
                          <button
                            type="button"
                            className="order-btn"
                            aria-label={`${product.name} 下移`}
                            title="在同系列同分类内下移"
                            disabled={reordering || index < 0 || index >= group.length - 1}
                            onClick={() => moveProduct(product, 1)}
                          >
                            <Icon name="arrowDown" size={13} />
                          </button>
                        </div>
                      ) : (
                        <span className="tiny muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-main">
                        {product.imageUrl ? (
                          <img className="product-thumb-img" src={product.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <span className={`product-thumb series-${SERIES[product.series]?.className || 'retail'}`} style={{ width: 30, height: 38, fontSize: 13 }}>
                            {SERIES[product.series]?.char || '零'}
                          </span>
                        )}
                        <div>
                          <span className="cell-title">{product.name}</span>
                          <span className="sub-cell">{product.nameEn}</span>
                        </div>
                      </div>
                    </td>
                    <td>{SERIES[product.series]?.name || product.series}</td>
                    <td>{category?.name || product.categoryId}</td>
                    <td>{product.kind === 'tea' ? '鲜酿' : product.kind === 'bottle' ? '瓶装' : '零售'}</td>
                    {can('product:price') ? <td className="num">{money(product.priceCents)}</td> : null}
                    {can('product:price') ? <td className="num faint">{money(product.costCents)}</td> : null}
                    <td className="num">{product.doseGrams}g</td>
                    <td className="num">
                      {Math.round(product.totalGrams || 0)}g
                      {product.soldOutStores ? <span className="sub-cell">{product.soldOutStores} 店售罄</span> : null}
                    </td>
                    <td>
                      <Badge tone={product.status === 'published' ? 'ok' : product.status === 'draft' ? 'warn' : 'neutral'}>
                        {product.status === 'published' ? '销售中' : product.status === 'draft' ? '草稿' : '已归档'}
                      </Badge>
                    </td>
                    <td className="actions">
                      {can('product:edit') ? (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(product)}>
                          编辑
                        </button>
                      ) : null}
                      {can('product:publish') ? (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => togglePublish(product)}>
                          {product.status === 'published' ? '下架' : '上架'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length ? <EmptyState icon="tray" title="没有匹配的商品" description="调整搜索或筛选条件。" /> : null}
        </div>
      </Panel>

      <ProductDrawer
        editing={editing}
        categories={data.categories}
        canPrice={can('product:price')}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          notify('商品已保存', 'ok');
          query.reload({ silent: true });
        }}
      />
      <CategoryModal
        open={categoryOpen}
        categories={data.categories}
        onClose={() => setCategoryOpen(false)}
        onSaved={() => {
          notify('分类已保存', 'ok');
          query.reload({ silent: true });
        }}
      />
      <p className="page-foot-note">
        售价与成本属于敏感字段，需要「查看与调整售价」权限。新建商品会在全部门店自动建立库存记录（初始 0g），门店补货后即可售卖。
        顺序只在同系列同分类内调整；门店覆盖后以门店顺序为准，未覆盖的门店继续跟随总部。清除搜索和「类型」筛选后可看到排序按钮。
      </p>
    </>
  );
}

function ProductDrawer({
  editing,
  categories,
  canPrice,
  onClose,
  onSaved
}: {
  editing: Product | 'new' | null;
  categories: Category[];
  canPrice: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === 'new';
  const product = editing && editing !== 'new' ? editing : null;
  const [form, setForm] = useState({
    name: '',
    nameEn: '',
    categoryId: '',
    series: 'xing',
    kind: 'tea',
    price: '0',
    cost: '0',
    dose: '3.5',
    status: 'published',
    tempHot: true,
    tempIced: true,
    ice: true,
    memberEligible: true,
    desc: '',
    descEn: '',
    spec: '',
    specEn: '',
    tag: '',
    tagEn: '',
    unit: '杯',
    unitEn: 'Cup'
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<{ base64: string; contentType: string; preview: string } | null>(null);
  const [imageCleared, setImageCleared] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setError(null);
    setImageFile(null);
    setImageCleared(false);
    setImageUrl(editing === 'new' ? '' : editing.imageUrl || '');
    if (editing === 'new') {
      setForm({
        name: '',
        nameEn: '',
        categoryId:
          categories.find((item) => item.kind === 'tea' || item.kind === 'fresh')?.id || categories[0]?.id || '',
        series: 'xing',
        kind: 'tea',
        price: '0',
        cost: '0',
        dose: '3.5',
        status: 'published',
        tempHot: true,
        tempIced: true,
        ice: true,
        memberEligible: true,
        desc: '',
        descEn: '',
        spec: '',
        specEn: '',
        tag: '',
        tagEn: '',
        unit: '杯',
        unitEn: 'Cup'
      });
      return;
    }
    setForm({
      name: editing.name,
      nameEn: editing.nameEn,
      categoryId: editing.categoryId,
      series: editing.series,
      kind: editing.kind,
      price: (editing.priceCents / 100).toFixed(2),
      cost: (editing.costCents / 100).toFixed(2),
      dose: String(editing.doseGrams),
      status: editing.status,
      tempHot: editing.temps.includes('热'),
      tempIced: editing.temps.includes('冰'),
      ice: editing.ice,
      memberEligible: editing.memberEligible,
      desc: editing.desc,
      descEn: editing.descEn || '',
      spec: editing.spec,
      specEn: editing.specEn || '',
      tag: editing.tag,
      tagEn: editing.tagEn || '',
      unit: editing.unit,
      unitEn: editing.unitEn || ''
    });
  }, [editing]);

  const pickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 清空 input，允许连续选择同一个文件重新上传。
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('仅支持 JPG、PNG 或 WebP 图片');
      return;
    }
    // 手机拍的原图常有 3–8MB，上传前统一压到长边 1600px；这里只挡明显异常的巨型文件。
    if (file.size > 12 * 1024 * 1024) {
      setError('图片超过 12MB，请换一张更小的图片');
      return;
    }
    try {
      const prepared = await prepareProductImage(file);
      if (prepared.base64.length * 0.75 > MAX_UPLOAD_BYTES) {
        setError('图片压缩后仍超过 2MB，请换一张更小的图片');
        return;
      }
      setError(null);
      setImageFile(prepared);
      setImageCleared(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取图片失败，请重新选择');
    }
  };

  const resetImage = () => {
    setImageFile(null);
    setImageUrl('');
    setImageCleared(true);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const temps = [form.tempHot ? '热' : null, form.tempIced ? '冰' : null].filter(Boolean) as string[];
      const body: Record<string, unknown> = {
        name: form.name,
        nameEn: form.nameEn,
        categoryId: form.categoryId,
        series: form.series,
        kind: form.kind,
        doseGrams: Number(form.dose),
        status: form.status,
        temps,
        ice: form.ice,
        memberEligible: form.memberEligible,
        desc: form.desc,
        descEn: form.descEn,
        spec: form.spec,
        specEn: form.specEn,
        tag: form.tag,
        tagEn: form.tagEn,
        unit: form.unit,
        unitEn: form.unitEn
      };
      if (canPrice && (isNew || product)) {
        body.priceCents = Math.round(Number(form.price) * 100);
        body.costCents = Math.round(Number(form.cost) * 100);
      }
      let savedId = product?.id || '';
      if (isNew) {
        const created = await api.adminCreateProduct(body);
        savedId = created.product.id;
      } else if (product) {
        await api.adminUpdateProduct(product.id, body);
      }
      if (savedId) {
        // 图片单独走上传接口：先保存商品拿到 id，再上传；删除与上传互斥，避免新图被清掉。
        if (imageFile) {
          await api.adminUploadProductImage(savedId, {
            base64: imageFile.base64,
            contentType: imageFile.contentType
          });
        } else if (imageCleared) {
          await api.adminRemoveProductImage(savedId);
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!editing}
      title={isNew ? '新建商品' : `编辑商品 · ${product?.name || ''}`}
      subtitle={isNew ? '商品会在全部门店建立库存记录' : '修改售价需要价格权限，操作会写入日志'}
      width="lg"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={submit}>
            {busy ? '保存中…' : '保存商品'}
          </button>
        </>
      }
    >
      <div className="product-image-field">
        <div className="cust-sheet-label">商品图片</div>
        <div className="product-image-editor">
          <div className="product-image-preview">
            {imageFile || imageUrl ? (
              <img src={imageFile ? imageFile.preview : imageUrl} alt="商品图预览" />
            ) : (
              <span>{SERIES[form.series as Series]?.char || '图'}</span>
            )}
          </div>
          <div className="product-image-actions">
            <div className="row-gap">
              <label className="btn btn-sm btn-ghost">
                <Icon name="upload" size={14} /> 上传图片
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickImage} />
              </label>
              {imageFile || imageUrl ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={resetImage}>
                  恢复默认插画
                </button>
              ) : null}
            </div>
            <span className="tiny muted">
              JPG / PNG / WebP，单张不超过 12MB，上传前会自动压到长边 1600px，便于小程序快速加载。上传后小程序商品卡与详情优先显示这张图；未上传时使用系列插画。
            </span>
          </div>
        </div>
      </div>
      <div className="form-grid">
        <Field label="商品名称">
          <input value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field label="英文名称">
          <input value={form.nameEn} maxLength={80} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
        </Field>
        <Field label="分类" hint="现制茶饮的分类名称会作为小程序茶单的二级标题。">
          <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} · {categoryKindLabel(category.kind)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="系列">
          <select value={form.series} onChange={(event) => setForm({ ...form, series: event.target.value })}>
            {(['xing', 'song', 'qing', 'mian'] as Series[]).map((key) => (
              <option key={key} value={key}>
                {SERIES[key].char} · {SERIES[key].nameEn}
              </option>
            ))}
          </select>
        </Field>
        <Field label="商品类型">
          <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
            <option value="tea">现制茶饮</option>
            <option value="retail">零售</option>
            <option value="bottle">瓶装</option>
          </select>
        </Field>
        <Field label="状态">
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="published">销售中</option>
            <option value="draft">草稿</option>
            <option value="archived">已归档</option>
          </select>
        </Field>
        {canPrice ? (
          <>
            <Field label="售价（元）">
              <input inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
            </Field>
            <Field label="成本（元）">
              <input inputMode="decimal" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} />
            </Field>
          </>
        ) : (
          <div className="span-2">
            <div className="notice">
              <Icon name="info" size={15} />
              <span>当前账号没有价格权限，保存时不会修改售价与成本。</span>
            </div>
          </div>
        )}
        <Field label="每杯投茶量（g）">
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={form.dose}
            onChange={(event) => setForm({ ...form, dose: event.target.value })}
          />
        </Field>
        <Field label="单位">
          <input value={form.unit} maxLength={20} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
        </Field>
        <div className="span-2">
          <div className="cust-sheet-label">温度 / 冰量</div>
          <div className="row-gap">
            <label className="check-line">
              <input type="checkbox" checked={form.tempHot} onChange={(event) => setForm({ ...form, tempHot: event.target.checked })} />
              支持热饮
            </label>
            <label className="check-line">
              <input type="checkbox" checked={form.tempIced} onChange={(event) => setForm({ ...form, tempIced: event.target.checked })} />
              支持冰饮
            </label>
            <label className="check-line">
              <input type="checkbox" checked={form.ice} onChange={(event) => setForm({ ...form, ice: event.target.checked })} />
              支持冰量选择
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={form.memberEligible}
                onChange={(event) => setForm({ ...form, memberEligible: event.target.checked })}
              />
              参与会员每杯优惠
            </label>
          </div>
        </div>
        <Field label="中文描述" className="span-2">
          <textarea value={form.desc} rows={3} maxLength={2000} onChange={(event) => setForm({ ...form, desc: event.target.value })} />
        </Field>
        <Field label="英文描述" className="span-2" hint="用于英文模式下的小程序商品详情。">
          <textarea value={form.descEn} rows={3} maxLength={2000} onChange={(event) => setForm({ ...form, descEn: event.target.value })} />
        </Field>
        <Field label="中文规格">
          <input value={form.spec} maxLength={300} onChange={(event) => setForm({ ...form, spec: event.target.value })} />
        </Field>
        <Field label="英文规格">
          <input value={form.specEn} maxLength={300} onChange={(event) => setForm({ ...form, specEn: event.target.value })} />
        </Field>
        <Field label="中文标签">
          <input value={form.tag} maxLength={100} onChange={(event) => setForm({ ...form, tag: event.target.value })} />
        </Field>
        <Field label="英文标签">
          <input value={form.tagEn} maxLength={100} onChange={(event) => setForm({ ...form, tagEn: event.target.value })} />
        </Field>
        <Field label="中文单位">
          <input value={form.unit} maxLength={20} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
        </Field>
        <Field label="英文单位">
          <input value={form.unitEn} maxLength={20} onChange={(event) => setForm({ ...form, unitEn: event.target.value })} />
        </Field>
      </div>
      <InlineError message={error} />
    </Drawer>
  );
}

function CategoryModal({
  open,
  categories,
  onClose,
  onSaved
}: {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ id: '', name: '', nameEn: '', kind: 'tea' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open]);

  const reset = () => {
    setForm({ id: '', name: '', nameEn: '', kind: 'tea' });
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminSaveCategory({ id: form.id || undefined, name: form.name, nameEn: form.nameEn, kind: form.kind });
      reset();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      size="lg"
      title="分类管理"
      description="现制茶饮的分类名称会作为小程序茶单的二级标题（如鲜酿茶、康普茶、气泡茶），在这里改名即可同步菜单。分类不删除，以保留历史商品。"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={save}>
            {busy ? '保存中…' : form.id ? '保存修改' : '创建分类'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <Field label="分类名称">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="英文名称">
            <input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
          </Field>
          <Field label="归属">
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
              <option value="tea">鲜酿</option>
              <option value="retail">零售</option>
              <option value="bottle">瓶装</option>
            </select>
          </Field>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <span className="field-label">&nbsp;</span>
            <button type="button" className="btn btn-outline" onClick={reset}>
              清空 / 新建
            </button>
          </div>
        </div>
        <InlineError message={error} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>分类</th>
                <th>英文</th>
                <th>归属</th>
                <th className="actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td className="cell-title">{category.name}</td>
                  <td className="faint">{category.nameEn}</td>
                  <td>{categoryKindLabel(category.kind)}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() =>
                        setForm({
                          id: category.id,
                          name: category.name,
                          nameEn: category.nameEn,
                          kind: category.kind === 'fresh' ? 'tea' : category.kind
                        })
                      }
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------- mappings ------------------------------- */

function MappingsPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminMappings(), []);
  const [editing, setEditing] = useState<Mapping | 'new' | null>(null);

  if (query.loading && !query.data) return <Spinner label="正在读取原料映射" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 商品"
        title="原料 SKU 映射"
        description="把外部原料系统或供应商的 SKU 对应到时叙商品，供库存折算与对账使用。"
        meta={<span>{data.mappings.length} 条映射</span>}
        actions={
          can('mapping:edit') ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={14} /> 新建映射
            </button>
          ) : null
        }
      />
      <Panel title="映射列表" description="换算系数表示 1 个外部单位折算为多少克 / 件。" flush>
        <div className="mapping-list" style={{ padding: '4px 20px 12px' }}>
          {data.mappings.map((mapping) => (
            <div className="mapping-row" key={mapping.id}>
              <span className="mapping-ext">{mapping.externalId}</span>
              <span className="grow">{mapping.productName}</span>
              <span className="faint tiny">
                {mapping.factor} {mapping.unit} → 1 单位
              </span>
              {can('mapping:edit') ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(mapping)}>
                  编辑
                </button>
              ) : null}
            </div>
          ))}
          {!data.mappings.length ? <EmptyState icon="box" title="还没有原料映射" description="为主力商品配置外部 SKU，后续库存对账更准确。" /> : null}
        </div>
      </Panel>
      <MappingModal
        editing={editing}
        products={data.products}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          notify('映射已保存', 'ok');
          query.reload({ silent: true });
        }}
      />
      <p className="page-foot-note">
        映射由总部统一维护，门店不单独修改。真实接入供应商系统时，可在此扩展为自动同步的物料编码。
      </p>
    </>
  );
}

function MappingModal({
  editing,
  products,
  onClose,
  onSaved
}: {
  editing: Mapping | 'new' | null;
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const mapping = editing && editing !== 'new' ? editing : null;
  const [externalId, setExternalId] = useState('');
  const [productId, setProductId] = useState('');
  const [unit, setUnit] = useState('袋');
  const [factor, setFactor] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setError(null);
    if (editing === 'new') {
      setExternalId('');
      setProductId(products[0]?.id || '');
      setUnit('袋');
      setFactor('1');
    } else {
      setExternalId(editing.externalId);
      setProductId(editing.productId);
      setUnit(editing.unit);
      setFactor(String(editing.factor));
    }
  }, [editing]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminSaveMapping({
        id: mapping?.id,
        externalId,
        productId,
        unit,
        factor: Number(factor)
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!editing}
      title={mapping ? '编辑原料映射' : '新建原料映射'}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !externalId || !productId} onClick={save}>
            {busy ? '保存中…' : '保存映射'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="外部 SKU 编号">
          <input value={externalId} placeholder="例如 RAW-TEA-001" onChange={(event) => setExternalId(event.target.value)} />
        </Field>
        <Field label="对应商品">
          <select value={productId} onChange={(event) => setProductId(event.target.value)}>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="外部单位">
          <input value={unit} maxLength={20} onChange={(event) => setUnit(event.target.value)} />
        </Field>
        <Field label="换算系数" hint="1 个外部单位折算的克数或件数。">
          <input inputMode="decimal" value={factor} onChange={(event) => setFactor(event.target.value)} />
        </Field>
      </div>
      <InlineError message={error} />
    </Modal>
  );
}

/* ------------------------------- coupons ------------------------------- */

function CouponsPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminCoupons(), []);
  const catalog = useApi(() => api.adminProducts(), []);
  const [creating, setCreating] = useState(false);
  const [issuing, setIssuing] = useState<Coupon | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const managed = can('coupon:manage');

  if (query.loading && !query.data) return <Spinner label="正在读取优惠券" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  const categories = catalog.data?.categories || [];
  const products = catalog.data?.products || [];
  const categoryName = (id: string | null) =>
    categories.find((item) => item.id === id)?.name || '指定品类';
  const productName = (id: string | null) => products.find((item) => item.id === id)?.name || '指定单品';
  const scopeText = (coupon: Coupon) =>
    coupon.scope === 'product'
      ? `单品券 · ${productName(coupon.productId)}`
      : coupon.scope === 'category'
        ? `品类券 · ${categoryName(coupon.categoryId)}`
        : '全场通用';
  const validityText = (coupon: Coupon) =>
    coupon.validDays > 0
      ? `领取后 ${coupon.validDays} 天有效 · 活动截止 ${dateText(coupon.validTo)}`
      : `固定有效期 ${dateText(coupon.validFrom)} 至 ${dateText(coupon.validTo)}`;
  const totals = data.coupons.reduce(
    (acc, row) => ({
      issued: acc.issued + (row.issued || 0),
      used: acc.used + (row.used || 0),
      available: acc.available + (row.available || 0),
      claimed: acc.claimed + (row.claimed || 0)
    }),
    { issued: 0, used: 0, available: 0, claimed: 0 }
  );

  const toggle = async (coupon: Coupon) => {
    setToggling(coupon.id);
    try {
      await api.adminUpdateCoupon(coupon.id, { active: !coupon.active });
      notify(coupon.active ? '优惠券已停用' : '优惠券已启用', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '操作失败', 'danger');
    } finally {
      setToggling(null);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 会员权益"
        title="优惠券"
        description="按全场、品类或单品创建券，可选固定有效期或领取后 N 天有效；发放时按手机号定位会员，也可开放会员自助领取，或交给自动化规则按人群发放。"
        meta={<span>{data.coupons.length} 个券模板</span>}
        actions={
          managed ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={14} /> 新建优惠券
            </button>
          ) : null
        }
      />
      <div className="stat-grid">
        <Stat label="券模板" value={data.coupons.length} hint="含已停用" tone="dark" icon="megaphone" />
        <Stat label="已发放" value={totals.issued} hint={`其中自助领取 ${totals.claimed}`} />
        <Stat label="已使用" value={totals.used} hint="支付成功后才核销" />
        <Stat label="可再用" value={totals.available} hint="未使用的券张数" />
      </div>
      <Panel
        title="券模板"
        description="手机号是会员唯一身份；同一会员对同一模板只保留一张未使用的券，避免重复发放叠加。"
        flush
      >
        <div className="mapping-list" style={{ padding: '4px 20px 12px' }}>
          {data.coupons.map((coupon) => (
            <div className="mapping-row" key={coupon.id}>
              <span className="mapping-ext">{money(coupon.amountCents)}</span>
              <span className="grow">
                <strong>
                  {coupon.title}
                  {coupon.claimable ? (
                    <span className="faint tiny" style={{ marginLeft: 8 }}>
                      可自助领取 · 每人限 {coupon.claimLimit} 张
                    </span>
                  ) : null}
                </strong>
                <span className="faint tiny" style={{ display: 'block', marginTop: 2 }}>
                  {scopeText(coupon)}
                  {coupon.minSpendCents > 0 ? ` · 满 ${money(coupon.minSpendCents)} 可用` : ' · 无门槛'}
                  {` · ${validityText(coupon)}`}
                </span>
              </span>
              <Badge tone={coupon.active ? 'ok' : 'danger'}>{coupon.active ? '生效中' : '已停用'}</Badge>
              <span className="faint tiny">
                发 {coupon.issued || 0} · 用 {coupon.used || 0}
                {coupon.revoked ? ` · 作废 ${coupon.revoked}` : ''}
              </span>
              {managed ? (
                <div className="row-gap">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={!coupon.active}
                    onClick={() => setIssuing(coupon)}
                  >
                    发放
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={toggling === coupon.id}
                    onClick={() => toggle(coupon)}
                  >
                    {coupon.active ? '停用' : '启用'}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {!data.coupons.length ? (
            <EmptyState
              icon="megaphone"
              title="还没有优惠券"
              description="创建第一张券后，可按手机号发给已注册的会员。"
            />
          ) : null}
        </div>
      </Panel>
      <CouponRulesPanel coupons={data.coupons} />
      <p className="page-foot-note">
        券的面额、门槛、范围与有效期由服务端在下单时再次核验；领取后 N 天的券在发放那一刻固化到期时间，后续改动模板不会延长已发出去的券。停用后未使用的券立即失效，已使用的记录保留。
      </p>
      <CouponCreateModal
        open={creating}
        categories={categories}
        products={products}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          notify('优惠券已创建', 'ok');
          query.reload({ silent: true });
        }}
      />
      <CouponIssueModal
        coupon={issuing}
        onClose={() => setIssuing(null)}
        onDone={() => query.reload({ silent: true })}
      />
    </>
  );
}

const RUN_STATUS_LABEL: Record<CouponRuleRun['status'], string> = {
  pending: '排队中',
  running: '发放中',
  succeeded: '已发完',
  failed: '发放失败'
};

const RULE_TIER_LABEL: Record<CouponRule['tier'], string> = {
  all: '全部会员',
  standard: '普通会员',
  annual: 'Full愈大会员'
};

function ruleConfigText(rule: CouponRule): string {
  if (rule.kind === 'monthly') {
    return `每月 ${rule.config.dayOfMonth ?? 1} 号给符合人群的会员各发一张，同一个月不会重复发`;
  }
  if (rule.kind === 'birthday') {
    const days = rule.config.daysBefore ?? 0;
    return days > 0 ? `生日前 ${days} 天发放，一年一张` : '生日当天发放，一年一张';
  }
  if (rule.kind === 'welcome') {
    return `注册后 ${rule.config.withinDays ?? 7} 天内、尚无支付订单的会员，一次一张`;
  }
  return `${rule.config.inactiveDays ?? 60} 天没来消费、且至少有 ${rule.config.minOrders ?? 1} 笔已支付订单，${rule.config.inactiveDays ?? 60} 天一次`;
}

function CouponRulesPanel({ coupons }: { coupons: Coupon[] }) {
  const { can } = useStaffAuth();
  const notify = useToast();
  const confirm = useConfirm();
  const query = useApi(() => api.adminCouponRules(), []);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, CouponRulePreview>>({});
  const [historyRule, setHistoryRule] = useState<CouponRule | null>(null);
  const managed = can('coupon:manage');
  const reloadRules = query.reload;

  // 月度发放是后台分批写入：有进行中的执行就每 3 秒刷一次列表，进度条与计数自己往前走。
  const runningMonthly = (query.data?.rules || []).some(
    (rule) => rule.currentRun && (rule.currentRun.status === 'pending' || rule.currentRun.status === 'running')
  );
  useEffect(() => {
    if (!runningMonthly) return;
    const timer = setInterval(() => {
      reloadRules({ silent: true }).catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [runningMonthly, reloadRules]);

  if (query.loading && !query.data) return <Spinner label="正在读取自动发券规则" />;
  const rules = query.data?.rules || [];

  const preview = async (rule: CouponRule) => {
    setBusy(`preview:${rule.id}`);
    try {
      const result = await api.adminPreviewCouponRule(rule.id);
      setPreviews((current) => ({ ...current, [rule.id]: result }));
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '预览失败', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const run = async (rule: CouponRule) => {
    setBusy(`run:${rule.id}`);
    try {
      const response = await api.adminRunCouponRule(rule.id);
      if ('run' in response) {
        // 月度只排队，真正写库在后台按页推进，进度由上面的轮询刷新。
        notify(
          `已开始 ${response.run.period} 的发放，目标 ${response.run.targetCount} 人，进度会自动刷新`,
          'ok'
        );
        query.reload({ silent: true });
        return;
      }
      const { result } = response;
      notify(
        result.replayed
          ? `「${rule.couponTitle}」今天已经跑过，不会重复发券`
          : `命中 ${result.targetCount} 人，实际发券 ${result.issued} 张` +
              (result.skipped ? `，跳过 ${result.skipped} 人` : ''),
        result.replayed ? 'info' : 'ok'
      );
      setPreviews((current) => {
        const next = { ...current };
        delete next[rule.id];
        return next;
      });
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '执行失败', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const resume = async (rule: CouponRule, run: CouponRuleRun) => {
    setBusy(`resume:${rule.id}`);
    try {
      await api.adminContinueCouponRun(run.id);
      notify('已从断点继续发放，不会重复发给已经发过的人', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '继续执行失败', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const toggleEnabled = async (rule: CouponRule, enabled: boolean) => {
    setBusy(`toggle:${rule.id}`);
    try {
      await api.adminUpdateCouponRule(rule.id, { enabled });
      notify(enabled ? '规则已启用' : '规则已暂停', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '操作失败', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (rule: CouponRule) => {
    const ok = await confirm({
      title: '删除这条发券规则？',
      message: `「${rule.kindLabel} · ${rule.couponTitle}」删除后不再自动发券，已发出去的券不受影响。`,
      confirmText: '删除规则',
      tone: 'danger'
    });
    if (!ok) return;
    setBusy(`delete:${rule.id}`);
    try {
      await api.adminDeleteCouponRule(rule.id);
      notify('规则已删除', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '删除失败', 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Panel
        eyebrow="自动化"
        title="自动发券规则"
        description="生日关怀、新客欢迎、沉睡唤回每天自动扫描；月度定向发放按执行日给全量会员（或仅 Full愈 会员）各发一张。同一会员同一个规则周期内只会发一张，手动执行也只补发缺的那部分。"
        flush
        actions={
          managed ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreating(true)}>
              <Icon name="plus" size={14} /> 新建规则
            </button>
          ) : null
        }
      >
        <div className="mapping-list" style={{ padding: '4px 20px 12px' }}>
          {rules.map((rule) => {
            const result = previews[rule.id];
            const current = rule.currentRun;
            const isMonthly = rule.kind === 'monthly';
            const running = Boolean(current && (current.status === 'pending' || current.status === 'running'));
            // 月度同一个月只发一次：本月已发完就不给按钮，避免点出 ALREADY_DONE。
            const doneThisMonth = current?.status === 'succeeded';
            const failed = current?.status === 'failed';
            return (
              <div className="mapping-row" key={rule.id}>
                <span className="mapping-ext">{rule.kindLabel}</span>
                <span className="grow">
                  <strong>{rule.couponTitle}</strong>
                  <span className="faint tiny" style={{ display: 'block', marginTop: 2 }}>
                    {ruleConfigText(rule)}
                    {` · ${rule.tierLabel}`}
                    {` · 已发 ${rule.totalIssued} 张`}
                    {isMonthly
                      ? current
                        ? ` · 本月 ${current.period} ${RUN_STATUS_LABEL[current.status]}`
                        : ' · 本月还没发'
                      : rule.lastRunAt
                        ? ` · 上次 ${dateText(rule.lastRunAt)} 发 ${rule.lastRunIssued}`
                        : ' · 还没跑过'}
                  </span>
                  {isMonthly && current ? (
                    <span className="run-progress">
                      <span className="run-progress-track">
                        <span className="run-progress-fill" style={{ width: `${current.progress}%` }} />
                      </span>
                      <span>
                        已处理 {current.processed} / {current.targetCount} 人（{current.progress}%）· 发出 {current.issued} 张 · 跳过{' '}
                        {current.skipped} 人
                      </span>
                    </span>
                  ) : null}
                  {isMonthly && current?.lastError ? (
                    <span className="faint tiny" style={{ display: 'block', marginTop: 2, color: 'var(--danger)' }}>
                      失败原因：{current.lastError}
                    </span>
                  ) : null}
                  {result ? (
                    <span className="faint tiny" style={{ display: 'block', marginTop: 2 }}>
                      {isMonthly
                        ? `${result.period} 目标 ${result.targetCount ?? result.count} 人：本月已发 ${
                            result.alreadyThisPeriod
                          } 人，本次将发 ${result.willIssue} 张；无手机号跳过 ${result.noPhone ?? 0} 人；预计 ${
                            result.estimatedSeconds ?? 1
                          } 秒发完。`
                        : `本期命中 ${result.count} 人：将发 ${result.willIssue} 张；本周期已发 ${
                            result.alreadyThisPeriod
                          } 人；手持同款券 ${result.held} 人。`}
                    </span>
                  ) : null}
                </span>
                <Badge
                  tone={
                    !rule.enabled
                      ? 'neutral'
                      : running
                        ? 'warn'
                        : doneThisMonth
                          ? 'ok'
                          : failed
                            ? 'danger'
                            : 'neutral'
                  }
                >
                  {!rule.enabled
                    ? '已暂停'
                    : isMonthly
                      ? running
                        ? RUN_STATUS_LABEL[current!.status]
                        : doneThisMonth
                          ? '本月已发'
                          : failed
                            ? '发放失败'
                            : '待执行'
                      : '每日执行'}
                </Badge>
                {managed ? (
                  <div className="row-gap">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busy === `preview:${rule.id}` || running}
                      onClick={() => preview(rule)}
                    >
                      预览
                    </button>
                    {failed && current ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy === `resume:${rule.id}`}
                        onClick={() => resume(rule, current)}
                      >
                        继续执行
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={busy === `run:${rule.id}` || !rule.enabled || running || doneThisMonth}
                        onClick={() => run(rule)}
                      >
                        立即执行
                      </button>
                    )}
                    {isMonthly ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHistoryRule(rule)}>
                        记录
                      </button>
                    ) : null}
                    <Switch
                      checked={rule.enabled}
                      label={`${rule.kindLabel}规则启用状态`}
                      onChange={(next) => toggleEnabled(rule, next)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busy === `delete:${rule.id}` || rule.runCount > 0}
                      title={rule.runCount > 0 ? '已有执行记录，只能停用不能删除' : undefined}
                      onClick={() => remove(rule)}
                    >
                      删除
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!rules.length ? (
            <EmptyState
              icon="megaphone"
              title="还没有自动规则"
              description="生日、新客、沉睡唤回都可以交给规则每天自动发放，不用再手动按手机号发券。"
            />
          ) : null}
        </div>
      </Panel>
      <CouponRunHistoryModal rule={historyRule} onClose={() => setHistoryRule(null)} />
      <CouponRuleModal
        open={creating}
        coupons={coupons.filter((coupon) => coupon.active)}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          notify('自动发券规则已创建', 'ok');
          query.reload({ silent: true });
        }}
      />
    </>
  );
}

/** 月度规则的历史执行记录：每月一条，失败的那条可以看到原因并续跑。 */
function CouponRunHistoryModal({ rule, onClose }: { rule: CouponRule | null; onClose: () => void }) {
  const [runs, setRuns] = useState<CouponRuleRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rule) return;
    setRuns(null);
    setError(null);
    api
      .adminCouponRuns({ ruleId: rule.id, limit: 24 })
      .then((data) => setRuns(data.runs))
      .catch((err) => setError(err instanceof ApiError ? err.message : '读取执行记录失败'));
  }, [rule]);

  return (
    <Modal
      open={Boolean(rule)}
      title="月度发放记录"
      description={rule ? `「${rule.couponTitle}」· 每月一条，失败可从断点继续。` : undefined}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          关闭
        </button>
      }
    >
      <InlineError message={error} />
      {runs === null && !error ? <Spinner label="正在读取执行记录" /> : null}
      {runs && !runs.length ? <p className="faint tiny">还没有执行记录。</p> : null}
      <div className="mapping-list">
        {(runs || []).map((run) => (
          <div className="mapping-row" key={run.id}>
            <span className="mapping-ext">{run.period}</span>
            <span className="grow">
              <strong>
                {RUN_STATUS_LABEL[run.status]} · 发出 {run.issued} 张，跳过 {run.skipped} 人
              </strong>
              <span className="faint tiny" style={{ display: 'block', marginTop: 2 }}>
                {run.trigger === 'auto' ? '系统按期执行' : `手动执行${run.operatorName ? ` · ${run.operatorName}` : ''}`}
                {` · 目标 ${run.targetCount} 人`}
                {run.finishedAt ? ` · 完成于 ${dateText(run.finishedAt)}` : ''}
                {run.attempts > 1 ? ` · 尝试 ${run.attempts} 次` : ''}
              </span>
              {run.lastError ? (
                <span className="faint tiny" style={{ display: 'block', marginTop: 2, color: 'var(--danger)' }}>
                  {run.lastError}
                </span>
              ) : null}
            </span>
            <Badge
              tone={
                run.status === 'succeeded'
                  ? 'ok'
                  : run.status === 'failed'
                    ? 'danger'
                    : run.status === 'running'
                      ? 'warn'
                      : 'neutral'
              }
            >
              {RUN_STATUS_LABEL[run.status]}
            </Badge>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function CouponRuleModal({
  open,
  coupons,
  onClose,
  onSaved
}: {
  open: boolean;
  coupons: Coupon[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [couponId, setCouponId] = useState('');
  const [kind, setKind] = useState<CouponRuleKind>('birthday');
  const [tier, setTier] = useState<CouponRule['tier']>('all');
  const [daysBefore, setDaysBefore] = useState('0');
  const [withinDays, setWithinDays] = useState('7');
  const [inactiveDays, setInactiveDays] = useState('60');
  const [minOrders, setMinOrders] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCouponId(coupons[0]?.id || '');
    setKind('birthday');
    setDayOfMonth('1');
    setTier('all');
    setDaysBefore('0');
    setWithinDays('7');
    setInactiveDays('60');
    setMinOrders('1');
    setNote('');
    setError(null);
  }, [open, coupons]);

  const save = async () => {
    if (!couponId) return setError('请选择要发放的券');
    const config =
      kind === 'birthday'
        ? { daysBefore: Math.round(Number(daysBefore || 0)) }
        : kind === 'welcome'
          ? { withinDays: Math.round(Number(withinDays || 0)) }
          : kind === 'monthly'
            ? { dayOfMonth: Math.round(Number(dayOfMonth || 1)) }
            : { inactiveDays: Math.round(Number(inactiveDays || 0)), minOrders: Math.round(Number(minOrders || 1)) };
    if (kind === 'welcome' && !(config as { withinDays: number }).withinDays) setError('新客窗口需大于 0 天');
    if (kind === 'winback' && !(config as { inactiveDays: number }).inactiveDays) setError('沉睡天数需大于 0');
    if (kind === 'monthly' && !((config as { dayOfMonth: number }).dayOfMonth >= 1 && (config as { dayOfMonth: number }).dayOfMonth <= 28)) {
      setError('执行日需在 1~28 之间');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminCreateCouponRule({ couponId, kind, tier, config, note: note.trim() || undefined });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="新建自动发券规则"
      description="规则创建后立即生效：日常规则每天自动扫描，月度规则在每月执行日自动发放；也可以随时手动执行一次。"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? '保存中…' : '创建规则'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="规则类型" className="span-2">
          <Segmented
            value={kind}
            ariaLabel="规则类型"
            options={[
              { value: 'birthday', label: '生日关怀' },
              { value: 'welcome', label: '新客欢迎' },
              { value: 'winback', label: '沉睡唤回' },
              { value: 'monthly', label: '月度定向发放' }
            ]}
            onChange={(next) => setKind(next)}
          />
        </Field>
        <Field label="发放的券" className="span-2" hint="只列出生效中的券模板。">
          <select value={couponId} onChange={(event) => setCouponId(event.target.value)}>
            {coupons.map((coupon) => (
              <option key={coupon.id} value={coupon.id}>
                {money(coupon.amountCents)} · {coupon.title}
              </option>
            ))}
          </select>
        </Field>
        {kind === 'birthday' ? (
          <Field label="提前天数" hint="0 表示生日当天发放。">
            <input inputMode="numeric" value={daysBefore} onChange={(event) => setDaysBefore(event.target.value)} />
          </Field>
        ) : null}
        {kind === 'welcome' ? (
          <Field label="注册后多少天内">
            <input inputMode="numeric" value={withinDays} onChange={(event) => setWithinDays(event.target.value)} />
          </Field>
        ) : null}
        {kind === 'winback' ? (
          <>
            <Field label="多少天没消费">
              <input inputMode="numeric" value={inactiveDays} onChange={(event) => setInactiveDays(event.target.value)} />
            </Field>
            <Field label="最少历史订单数">
              <input inputMode="numeric" value={minOrders} onChange={(event) => setMinOrders(event.target.value)} />
            </Field>
          </>
        ) : null}
        {kind === 'monthly' ? (
          <Field label="每月执行日" hint="1~28 号，保证每个月都有这一天；到日由系统自动发放。">
            <input inputMode="numeric" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} />
          </Field>
        ) : null}
        <Field label="会员层级" hint={kind === 'monthly' ? '月度只支持全部会员或仅 Full愈 会员。' : undefined}>
          <select
            value={kind === 'monthly' && tier === 'standard' ? 'all' : tier}
            onChange={(event) => setTier(event.target.value as CouponRule['tier'])}
          >
            <option value="all">全部会员</option>
            {kind === 'monthly' ? null : <option value="standard">普通会员</option>}
            <option value="annual">Full愈大会员</option>
          </select>
        </Field>
        <Field label="内部备注" hint="仅总部可见。">
          <input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
      <InlineError message={error} />
    </Modal>
  );
}

function CouponCreateModal({
  open,
  categories,
  products,
  onClose,
  onSaved
}: {
  open: boolean;
  categories: Category[];
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<'all' | 'category' | 'product'>('all');
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState('10');
  const [minSpend, setMinSpend] = useState('0');
  const [validityMode, setValidityMode] = useState<'fixed' | 'days'>('fixed');
  const [validFrom, setValidFrom] = useState(todayText());
  const [validTo, setValidTo] = useState(dateText(Date.now() + 29 * 86400000));
  const [validDays, setValidDays] = useState('7');
  const [claimable, setClaimable] = useState(false);
  const [claimLimit, setClaimLimit] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setScope('all');
    setCategoryId(categories[0]?.id || '');
    setProductId(products[0]?.id || '');
    setAmount('10');
    setMinSpend('0');
    setValidityMode('fixed');
    setValidFrom(todayText());
    setValidTo(dateText(Date.now() + 29 * 86400000));
    setValidDays('7');
    setClaimable(false);
    setClaimLimit('1');
    setNote('');
    setError(null);
  }, [open, categories, products]);

  const save = async () => {
    const amountCents = Math.round(Number(amount) * 100);
    const minSpendCents = Math.round(Number(minSpend || 0) * 100);
    const days = Math.round(Number(validDays || 0));
    if (!title.trim()) return setError('请填写券名称');
    if (!Number.isFinite(amountCents) || amountCents <= 0) return setError('券面额必须大于 0');
    if (!Number.isFinite(minSpendCents) || minSpendCents < 0) return setError('使用门槛不能为负数');
    if (scope === 'category' && !categoryId) return setError('指定品类券需要选择分类');
    if (scope === 'product' && !productId) return setError('指定单品券需要选择商品');
    if (validityMode === 'fixed' && (!validFrom || !validTo || validFrom > validTo)) {
      return setError('有效期结束需晚于开始');
    }
    if (validityMode === 'days' && (!Number.isFinite(days) || days < 1 || days > 365)) {
      return setError('领取后有效天数需在 1~365 之间');
    }
    if (claimable && !(Number(claimLimit) >= 1 && Number(claimLimit) <= 99)) {
      return setError('每人领取上限需在 1~99 之间');
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminCreateCoupon({
        title: title.trim(),
        scope,
        categoryId: scope === 'category' ? categoryId : null,
        productId: scope === 'product' ? productId : null,
        amountCents,
        minSpendCents,
        validFrom: validityMode === 'fixed' ? validFrom : todayText(),
        validTo,
        validDays: validityMode === 'days' ? days : 0,
        claimable,
        claimLimit: claimable ? Math.round(Number(claimLimit)) : 1,
        note: note.trim() || undefined
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="新建优惠券"
      description="创建后即可按手机号发放；顾客在小程序「带回家」页看到可用券。"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? '创建中…' : '创建优惠券'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="券名称" className="span-2">
          <input value={title} maxLength={40} placeholder="例如 秋日茶礼 10 元券" onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="适用范围" className="span-2">
          <Segmented
            value={scope}
            ariaLabel="适用范围"
            options={[
              { value: 'all', label: '全场通用' },
              { value: 'category', label: '指定品类' },
              { value: 'product', label: '指定单品' }
            ]}
            onChange={(next) => setScope(next)}
          />
        </Field>
        {scope === 'category' ? (
          <Field label="适用分类" className="span-2">
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {scope === 'product' ? (
          <Field label="适用单品" className="span-2" hint="只有这张券指定的商品才能抵扣；茶单和零售商品都可以选。">
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {money(item.priceCents)} · {item.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="券面额（元）">
          <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="使用门槛（元）" hint="填 0 表示无门槛。">
          <input inputMode="decimal" value={minSpend} onChange={(event) => setMinSpend(event.target.value)} />
        </Field>
        <Field label="有效期方式" className="span-2">
          <Segmented
            value={validityMode}
            ariaLabel="有效期方式"
            options={[
              { value: 'fixed', label: '固定日期区间' },
              { value: 'days', label: '领取后 N 天' }
            ]}
            onChange={(next) => setValidityMode(next)}
          />
        </Field>
        {validityMode === 'fixed' ? (
          <>
            <Field label="生效日">
              <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
            </Field>
            <Field label="失效日">
              <input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="领取后有效天数" hint="从发放那一刻算起，写入每张券，不随模板改动。">
              <input inputMode="numeric" value={validDays} onChange={(event) => setValidDays(event.target.value)} />
            </Field>
            <Field label="活动截止日" hint="领取后 N 天与这个日期取较早者。">
              <input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
            </Field>
          </>
        )}
        <Field label="开放自助领取" className="span-2" hint="打开后，会员在小程序「我的券」里可以直接领取，每人限领下方张数。">
          <Switch checked={claimable} label="开放自助领取" onChange={setClaimable} />
        </Field>
        {claimable ? (
          <Field label="每人限领（张）">
            <input inputMode="numeric" value={claimLimit} onChange={(event) => setClaimLimit(event.target.value)} />
          </Field>
        ) : null}
        <Field label="内部备注" className="span-2" hint="仅总部可见，不会展示给顾客。">
          <input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
      <InlineError message={error} />
    </Modal>
  );
}

function CouponIssueModal({
  coupon,
  onClose,
  onDone
}: {
  coupon: Coupon | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CouponIssueResult | null>(null);

  useEffect(() => {
    if (!coupon) return;
    setText('');
    setError(null);
    setResult(null);
  }, [coupon]);

  const submit = async () => {
    if (!coupon) return;
    const phones = Array.from(
      new Set(
        text
          .split(/[\s,，、;；\n]+/)
          .map((item) => item.replace(/[\s-]/g, ''))
          .filter(Boolean)
      )
    );
    if (!phones.length) return setError('请填写至少一个手机号');
    if (phones.length > 200) return setError('单次最多发放 200 个手机号');
    setBusy(true);
    setError(null);
    try {
      const response = await api.adminIssueCoupon(coupon.id, phones);
      setResult(response);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发放失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!coupon}
      title={coupon ? `发放「${coupon.title}」` : '发放优惠券'}
      description="按手机号定位会员；未注册、已有同款未使用券的号码会被跳过。"
      onClose={busy ? () => undefined : onClose}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            关闭
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? '发放中…' : '确认发放'}
          </button>
        </>
      }
    >
      <Field label="手机号" hint="支持换行、空格或逗号分隔，单次最多 200 个。">
        <textarea
          rows={5}
          value={text}
          placeholder={'13800000001\n13900000002'}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <InlineError message={error} />
      {result ? (
        <div className="coupon-issue-result">
          <p className="small">
            成功发放 {result.issued.length} 张
            {result.skipped.length ? `，跳过 ${result.skipped.length} 个号码` : ''}。
          </p>
          {result.skipped.length ? (
            <ul className="tiny muted">
              {result.skipped.map((row) => (
                <li key={row.phone}>
                  {row.phone} · {row.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/* ------------------------------- stores ------------------------------- */

/**
 * 微信原生扫一扫配置。
 *
 * 普通二维码不能直接拉起小程序，需要在微信公众平台登记「扫普通链接二维码打开小程序」：
 * 二维码内容是 https 链接，微信识别后打开 pages/index/index，并把原链接放进 q 参数。
 * 这里只保存链接前缀；能否真正拉起取决于公网域名备案、规则发布与小程序正式版。
 */
function SeatQrPanel() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminSeatQr(), []);
  const editable = can('store:config:edit');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    setBaseUrl(query.data.baseUrl);
  }, [query.data]);

  const save = async (next: string) => {
    setBusy(true);
    try {
      const result = await api.adminSaveSeatQr(next.trim());
      setBaseUrl(result.baseUrl);
      notify(
        result.baseUrl
          ? '已保存链接前缀，重新下载桌签即可使用；微信规则发布后扫码才直接打开小程序。'
          : '已恢复「门店ID|位置」纯文本码',
        'ok'
      );
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '保存失败', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const active = Boolean(baseUrl);

  return (
    <Panel
      eyebrow="门店 · 桌签"
      title="微信原生扫一扫"
      description={
        active
          ? `当前桌签为 https 链接码，前缀 ${baseUrl}；微信「扫一扫」直接打开小程序并选中本店本桌。`
          : '当前桌签为「门店ID|位置」纯文本码，只有在小程序内点「扫桌签」才能识别。'
      }
      actions={
        <div className="row-gap">
          <Badge tone={active ? 'ok' : 'neutral'}>{active ? '链接码已启用' : '小程序内扫码'}</Badge>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen((value) => !value)}>
            {open ? '收起设置' : '展开设置'}
          </button>
        </div>
      }
    >
      {!open ? (
        <p className="faint tiny" style={{ margin: 0, lineHeight: 1.7 }}>
          普通二维码不能直接拉起小程序：先在微信公众平台登记「扫普通链接二维码打开小程序」规则，再在这里填写链接前缀即可。
          这是全局设置，展开后可填写前缀或恢复纯文本码。
        </p>
      ) : (
        <>
      {query.loading && !query.data ? (
        <Spinner label="正在读取桌签扫码配置" />
      ) : query.error && !query.data ? (
        <InlineError message={query.error} />
      ) : (
        <div className="form-grid">
          <div className="span-2">
            <Field
              label="二维码链接前缀"
              hint="例如 https://tea.example.com/qr。必须带路径（不能只填域名），并与公众平台规则完全一致：末尾不加 /，也不要填 ?store=... 参数，系统会自动拼接门店与位置。本系统只接受 https；微信规则本身也支持 http，但桌签长期张贴，明文链接存在被篡改风险。"
            >
              <input
                value={baseUrl}
                maxLength={300}
                disabled={!editable || busy}
                placeholder="https://tea.example.com/qr"
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </Field>
          </div>
        </div>
      )}
      {editable ? (
        <div className="row-gap" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          {active ? (
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => save('')}>
              清除链接（恢复纯文本码）
            </button>
          ) : null}
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => save(baseUrl)}>
            {busy ? '保存中…' : '保存链接前缀'}
          </button>
        </div>
      ) : null}
      <div className="notice" style={{ marginTop: 12 }}>
        <strong className="small">微信侧还需要一次性配置</strong>
        <ol className="small" style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.75 }}>
          <li>
            域名必须通过 ICP 备案。下载微信提供的校验文件，按公众平台提示放到域名根目录或规则最后一级目录，确保 https
            可以直接访问。前缀路径不需要真的放一个网页；规则未发布时，扫码会打开顾客端 H5 预览页。
          </li>
          <li>
            微信公众平台 → 开发管理 → 开发设置 →「扫普通链接二维码打开小程序」→ 开启并新增规则：二维码规则填上面的地址（末尾不加
            /），功能页面填 <code>pages/index/index</code>。
          </li>
          <li>先发布小程序代码，再发布二维码规则；规则未发布时，扫码会打开 H5 预览页，不会进入小程序。</li>
          <li>
            测试范围可选开发版/体验版/线上版；每条规则最多 5 条测试链接，需填完整链接（含
            <code>?store=...&amp;seat=...</code>），只有管理员/开发者/体验者扫码才生效。正式发布后，所有门店与桌位的匹配链接自动生效。
          </li>
          <li>
            限制：一个账号最多 500 条前缀规则、每月最多发布 500 次；本场景一条规则即可覆盖全部门店桌位。
          </li>
        </ol>
      </div>
      <p className="faint tiny" style={{ margin: '8px 0 0', lineHeight: 1.7 }}>
        {active
          ? '当前桌签内容为 https 链接，小程序内直接扫同一张码也能识别。微信规则发布前，微信「扫一扫」会打开 H5 预览页；位置改名或删除后旧桌签会失效，需要重新下载打印。'
          : '未配置时桌签内容为「门店ID|位置」，只有在小程序内点「扫桌签」才能识别；微信原生「扫一扫」只会显示码内文本。'}
      </p>
        </>
      )}
    </Panel>
  );
}

/** 桌签链接前缀只用于详情页的文案与桌签内容提示；切换列表/详情时重新取一次。 */
function useSeatQrBase(reloadKey: string) {
  const query = useApi(() => api.adminSeatQr(), [reloadKey]);
  const [base, setBase] = useState('');
  useEffect(() => {
    if (query.data) setBase(query.data.baseUrl);
  }, [query.data]);
  return base;
}

function StoresPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminStores(), []);
  const location = useLocation();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'open' | 'closed'>('all');
  const editable = can('store:config:edit');

  // /admin/stores/:id 复用同一节菜单，避免新增一级菜单；详情本身就是「维护」子页。
  const detailId = (location.pathname.replace(/^\/admin\/stores\/?/, '').split('/')[0] || '').trim();
  const seatQrBase = useSeatQrBase(detailId);

  if (query.loading && !query.data) return <Spinner label="正在读取门店" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  const backToList = () => navigate('/admin/stores');

  if (detailId) {
    const store = data.stores.find((item) => item.id === detailId);
    if (!store) {
      return (
        <>
          <PageHead
            eyebrow="品牌总部 · 门店"
            title="门店不存在"
            description="门店可能已被删除，或这条链接已经过期。"
          />
          <EmptyState icon="store" title="找不到这家门店" description={`门店 ID：${detailId}`} action={<button type="button" className="btn btn-primary" onClick={backToList}>返回门店列表</button>} />
        </>
      );
    }
    return (
      <>
        <div className="detail-bar">
          <button type="button" className="btn btn-sm btn-ghost" onClick={backToList}>
            ← 返回门店列表
          </button>
          <span className="faint tiny">共 {data.stores.length} 家门店</span>
        </div>
        <StoreCard
          key={store.id}
          store={store}
          editable={editable}
          qrBase={seatQrBase}
          onSaved={() => {
            notify('门店配置已更新', 'ok');
            query.reload({ silent: true });
          }}
        />
      </>
    );
  }

  const keyword = search.trim().toLowerCase();
  const filtered = data.stores.filter((store) => {
    if (status === 'open' && !store.open) return false;
    if (status === 'closed' && store.open) return false;
    if (!keyword) return true;
    return [store.name, store.nameEn, store.short, store.city, store.cityEn, store.address, store.id]
      .filter(Boolean)
      .some((text) => String(text).toLowerCase().includes(keyword));
  });
  const openCount = data.stores.filter((store) => store.open).length;

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 门店"
        title="门店配置"
        description="列表只显示关键状态，默认收起；门店资料、营业设置、取餐位置与桌签都进详情页维护。门店账号只可调整本店库存与售罄，不修改总部配置。"
        meta={
          <span>
            {data.stores.length} 家门店 · {openCount} 家营业中
          </span>
        }
        actions={
          editable ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              新增门店
            </button>
          ) : null
        }
      />
      <Panel
        title="门店列表"
        description="点门店名称或右侧按钮进入详情页维护。"
        actions={
          <div className="toolbar">
            <div className="search">
              <Icon name="search" size={15} />
              <input
                value={search}
                placeholder="搜索门店 / 城市 / 地址"
                aria-label="搜索门店"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Segmented
              ariaLabel="筛选营业状态"
              value={status}
              options={[
                { value: 'all' as const, label: '全部' },
                { value: 'open' as const, label: '营业中' },
                { value: 'closed' as const, label: '未营业' }
              ]}
              onChange={setStatus}
            />
          </div>
        }
        flush
      >
        {filtered.length ? (
          <ul className="store-admin-list">
            {filtered.map((store) => (
              <li className="store-admin-row" key={store.id}>
                <button type="button" className="store-admin-row-main" onClick={() => navigate(`/admin/stores/${store.id}`)}>
                  <span className="store-admin-row-title">
                    {store.name}
                    <span className="faint tiny">{store.nameEn}</span>
                  </span>
                  <span className="faint tiny">
                    {store.city} · {store.address} · {store.hours}
                  </span>
                </button>
                <div className="store-admin-row-meta">
                  <Badge tone={store.open ? 'ok' : 'warn'}>{store.open ? '营业中' : '未营业'}</Badge>
                  {store.retailPickup ? <Badge tone="accent">零售提货</Badge> : null}
                  <span className="faint tiny">{store.positions.length} 个取餐位置</span>
                  <Badge tone={store.printerStatus === 'online' ? 'ok' : 'warn'}>
                    标签机{store.printerStatus === 'online' ? '在线' : '离线'}
                  </Badge>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate(`/admin/stores/${store.id}`)}>
                    {editable ? '维护资料' : '查看资料'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="store-admin-empty">
            <EmptyState icon="store" title="没有匹配的门店" description="换个关键词，或把筛选切回「全部」。" />
          </div>
        )}
      </Panel>
      <SeatQrPanel />
      <StoreCreateDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          notify('门店已创建，商品库存已按目录初始化', 'ok');
          query.reload({ silent: true });
        }}
      />
    </>
  );
}

/**
 * 门店劳务单价（元/小时）：走独立接口，和门店配置的「保存」互不影响。
 *
 * 只有 attendance:settle 才看得到：单价是金额敏感信息，不该随门店配置页外泄。
 * 落库单位是「分/分钟」，所以输入按小时换算、保存后回显实际生效的小时价。
 */
function StoreLaborRateField({ storeId, storeName }: { storeId: string; storeName: string }) {
  const { can } = useStaffAuth();
  const notify = useToast();
  const allowed = can('attendance:settle');
  const query = useApi(() => (allowed ? api.attendanceLaborRates() : Promise.resolve(null)), [allowed]);
  const row = query.data?.rows.find((item) => item.storeId === storeId) ?? null;
  const saved = row ? (row.hourlyCents / 100).toFixed(2) : '';
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(saved);
    // 只在读到的单价变化时覆写输入框，避免每次渲染打断正在输入的数字。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, storeId]);

  if (!allowed) return null;

  const save = async () => {
    const yuan = Number(value);
    if (!Number.isFinite(yuan) || yuan < 0) {
      notify('劳务单价请填不小于 0 的数字', 'danger');
      return;
    }
    setBusy(true);
    try {
      await api.attendanceSaveLaborRate(storeId, { laborRatePerMinCents: Math.round((yuan * 100) / 60) });
      await query.reload({ silent: true });
      notify(`${storeName} 劳务单价已更新`, 'ok');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '保存劳务单价失败', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field
      label="劳务单价（元/小时）"
      hint={
        row
          ? `结算按这个价乘计价工时；当前 ${money(row.hourlyCents)}/小时（${row.laborRatePerMinCents} 分/分钟）。`
          : '还没读到单价，保存后可回显实际生效的小时价。'
      }
    >
      <div className="flex">
        <input
          inputMode="decimal"
          value={value}
          placeholder="30.00"
          onChange={(event) => setValue(event.target.value)}
          aria-label="劳务单价（元/小时）"
        />
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy || value === saved} onClick={save}>
          {busy ? '保存中…' : '保存单价'}
        </button>
      </div>
    </Field>
  );
}

function StoreCard({
  store,
  editable,
  qrBase,
  onSaved
}: {
  store: Store;
  editable: boolean;
  qrBase: string;
  onSaved: () => void;
}) {
  const notify = useToast();
  const [draft, setDraft] = useState({
    name: store.name,
    nameEn: store.nameEn,
    short: store.short,
    city: store.city,
    cityEn: store.cityEn,
    address: store.address,
    addressEn: store.addressEn,
    lat: String(store.lat ?? ''),
    lng: String(store.lng ?? ''),
    open: store.open,
    retailPickup: store.retailPickup,
    printerStatus: store.printerStatus,
    hours: store.hours,
    waitMinutes: String(store.waitMinutes),
    mini: !!store.channels.mini,
    assisted: store.channels.assisted !== false,
    meituan: !!store.channels.meituan,
    taobao: !!store.channels.taobao
  });
  const [positions, setPositions] = useState<string[]>(store.positions);
  const [seatInput, setSeatInput] = useState('');
  const [seatTag, setSeatTag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addSeat = () => {
    const next = seatInput.trim();
    if (!next) return;
    if (next.length > 20) return notify('位置名称不能超过 20 个字', 'danger');
    if (positions.includes(next)) return notify('该取餐位置已存在', 'danger');
    if (positions.length >= 60) return notify('每个门店最多 60 个取餐位置', 'danger');
    setPositions([...positions, next]);
    setSeatInput('');
  };

  const removeSeat = (seat: string) => setPositions(positions.filter((item) => item !== seat));

  const save = async () => {
    if (!draft.name.trim() || !draft.city.trim() || !draft.address.trim()) {
      notify('门店名称、城市和地址不能为空', 'danger');
      return;
    }
    if (!positions.length) {
      notify('至少保留一个取餐位置', 'danger');
      return;
    }
    const lat = Number(draft.lat || 0);
    const lng = Number(draft.lng || 0);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return notify('纬度应在 -90 到 90 之间', 'danger');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return notify('经度应在 -180 到 180 之间', 'danger');
    setBusy(true);
    try {
      await api.adminUpdateStore(store.id, {
        name: draft.name.trim(),
        nameEn: draft.nameEn.trim(),
        short: draft.short.trim(),
        city: draft.city.trim(),
        cityEn: draft.cityEn.trim(),
        address: draft.address.trim(),
        addressEn: draft.addressEn.trim(),
        lat,
        lng,
        open: draft.open,
        retailPickup: draft.retailPickup,
        printerStatus: draft.printerStatus,
        hours: draft.hours,
        waitMinutes: Number(draft.waitMinutes),
        positions,
        channels: {
          mini: draft.mini,
          assisted: draft.assisted,
          meituan: draft.meituan,
          taobao: draft.taobao
        }
      });
      onSaved();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '保存失败', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const seatTags = (seats: string[]) =>
    seats.map((seat) => {
      const native = Boolean(qrBase);
      return {
        seat,
        value: seatQrValue(qrBase, store.id, seat),
        native,
        code: native ? '微信扫一扫 · 自动进入本店本桌' : seatCode(store.id, seat)
      };
    });

  const printTags = (seats: string[]) => {
    try {
      printSeatTags(store.name, seatTags(seats));
    } catch (err) {
      notify(err instanceof Error ? err.message : '无法打开打印窗口', 'danger');
    }
  };

  const downloadTags = (seats: string[]) => {
    try {
      downloadSeatTagsPng(store.name, seatTags(seats));
      notify(`已下载 ${seats.length} 张桌签 PNG，可直接交给打印店`, 'ok');
    } catch (err) {
      notify(err instanceof Error ? err.message : '无法生成桌签图片', 'danger');
    }
  };

  const downloadTag = (seat: string) => {
    try {
      downloadSeatTagPng(store.name, seatTags([seat])[0]);
      notify(`已下载「${seat}」桌签 PNG`, 'ok');
    } catch (err) {
      notify(err instanceof Error ? err.message : '无法生成桌签图片', 'danger');
    }
  };

  return (
    <div className="store-admin-card">
      <div className="store-admin-head">
        <div>
          <h3>
            {store.name} <span className="faint tiny">{store.nameEn}</span>
          </h3>
          <p className="faint tiny">
            {store.city} · {store.address} · {store.hours}
          </p>
        </div>
        <div className="row-gap">
          <Badge tone={store.open ? 'ok' : 'warn'}>{store.open ? '营业中' : '未营业'}</Badge>
          {store.retailPickup ? <Badge tone="accent">支持零售提货</Badge> : null}
          <Badge tone={store.printerStatus === 'online' ? 'ok' : 'warn'}>标签机 {store.printerStatus === 'online' ? '在线' : '离线'}</Badge>
        </div>
      </div>

      <div className="cust-sheet-label" style={{ marginTop: 14 }}>门店资料</div>
      <div className="form-grid">
        <Field label="门店名称">
          <input value={draft.name} maxLength={40} disabled={!editable} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </Field>
        <Field label="英文名称">
          <input value={draft.nameEn} maxLength={60} disabled={!editable} onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })} />
        </Field>
        <Field label="门店简称" hint="用于营业台与单据的短名。">
          <input value={draft.short} maxLength={20} disabled={!editable} onChange={(event) => setDraft({ ...draft, short: event.target.value })} />
        </Field>
        <Field label="城市">
          <input value={draft.city} maxLength={20} disabled={!editable} onChange={(event) => setDraft({ ...draft, city: event.target.value })} />
        </Field>
        <Field label="城市英文">
          <input value={draft.cityEn} maxLength={40} disabled={!editable} onChange={(event) => setDraft({ ...draft, cityEn: event.target.value })} />
        </Field>
        <Field label="门店地址">
          <input value={draft.address} maxLength={120} disabled={!editable} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
        </Field>
        <Field label="地址英文">
          <input value={draft.addressEn} maxLength={160} disabled={!editable} onChange={(event) => setDraft({ ...draft, addressEn: event.target.value })} />
        </Field>
        <Field label="经纬度" hint="用于小程序按距离排序，格式：纬度, 经度。">
          <div className="flex">
            <input
              inputMode="decimal"
              value={draft.lat}
              disabled={!editable}
              placeholder="31.23"
              onChange={(event) => setDraft({ ...draft, lat: event.target.value })}
            />
            <input
              inputMode="decimal"
              value={draft.lng}
              disabled={!editable}
              placeholder="121.47"
              onChange={(event) => setDraft({ ...draft, lng: event.target.value })}
            />
          </div>
        </Field>
      </div>

      <div className="cust-sheet-label" style={{ marginTop: 14 }}>营业设置</div>
      <div className="form-grid">
        <Field label="营业状态">
          <div className="flex">
            <Switch checked={draft.open} onChange={(next) => setDraft({ ...draft, open: next })} label="营业状态" />
            <span className="small muted">{draft.open ? '对外营业' : '暂停接单'}</span>
          </div>
        </Field>
        <Field label="零售提货">
          <div className="flex">
            <Switch
              checked={draft.retailPickup}
              onChange={(next) => setDraft({ ...draft, retailPickup: next })}
              label="零售提货"
            />
            <span className="small muted">{draft.retailPickup ? '可核销提货码' : '不接零售提取'}</span>
          </div>
        </Field>
        <Field label="标签机状态">
          <Segmented
            value={draft.printerStatus}
            options={[
              { value: 'online', label: '在线' },
              { value: 'offline', label: '离线' }
            ]}
            onChange={(value) => setDraft({ ...draft, printerStatus: value })}
          />
        </Field>
        <Field label="营业时间 / 开业说明">
          <input value={draft.hours} maxLength={40} disabled={!editable} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} />
        </Field>
        <Field label="预计等待（分钟）">
          <input
            type="number"
            min={0}
            max={180}
            value={draft.waitMinutes}
            disabled={!editable}
            onChange={(event) => setDraft({ ...draft, waitMinutes: event.target.value })}
          />
        </Field>
        <StoreLaborRateField storeId={store.id} storeName={store.name} />
        <div className="span-2">
          <div className="cust-sheet-label">下单渠道</div>
          <div className="row-gap">
            <label className="check-line">
              <input type="checkbox" checked={draft.mini} disabled={!editable} onChange={(event) => setDraft({ ...draft, mini: event.target.checked })} />
              小程序
            </label>
            <label className="check-line">
              <input type="checkbox" checked={draft.assisted} disabled={!editable} onChange={(event) => setDraft({ ...draft, assisted: event.target.checked })} />
              营业台代点
            </label>
            <label className="check-line">
              <input type="checkbox" checked={draft.meituan} disabled={!editable} onChange={(event) => setDraft({ ...draft, meituan: event.target.checked })} />
              美团外卖
            </label>
            <label className="check-line">
              <input type="checkbox" checked={draft.taobao} disabled={!editable} onChange={(event) => setDraft({ ...draft, taobao: event.target.checked })} />
              淘宝闪购
            </label>
          </div>
        </div>
      </div>

      <div className="cust-sheet-label" style={{ marginTop: 14 }}>
        取餐位置与桌签
        <span className="faint tiny" style={{ marginLeft: 8 }}>
          {positions.length} 个位置 · {qrBase ? '微信原生扫一扫链接码' : '扫码内容为「门店|位置」'}
        </span>
      </div>
      <p className="faint tiny" style={{ margin: '4px 0 10px', lineHeight: 1.6 }}>
        {qrBase
          ? '当前桌签为微信原生扫码链接：顾客用微信「扫一扫」识别后会直接打开小程序，并自动选中本店本桌、默认店内享用；小程序内点「扫桌签」扫同一张码也能识别。链接前缀需已在微信公众平台登记「扫普通链接二维码打开小程序」。位置改名或删除后旧桌签会失效，需要重新下载打印。'
          : '当前为小程序内扫码模式：顾客需在小程序内点「扫桌签」扫描，才会自动选中本店本桌并默认店内享用；微信原生「扫一扫」只会显示码内文本。若希望原生扫一扫直接进小程序，请在上方配置链接前缀。位置改名或删除后旧桌签会失效，需要重新下载打印。'}
      </p>
      <div className="seat-chip-list">
        {positions.map((seat) => (
          <span className="seat-chip" key={seat}>
            <button type="button" className="seat-chip-name" title="查看桌签" onClick={() => setSeatTag(seat)}>
              {seat}
            </button>
            {editable ? (
              <button type="button" className="seat-chip-del" title="删除位置" onClick={() => removeSeat(seat)}>
                ×
              </button>
            ) : null}
          </span>
        ))}
        {!positions.length ? <span className="faint tiny">还没有取餐位置</span> : null}
      </div>
      {editable ? (
        <div className="flex" style={{ marginTop: 8 }}>
          <input
            value={seatInput}
            maxLength={20}
            placeholder="新增位置，如：窗边01"
            style={{ maxWidth: 240 }}
            onChange={(event) => setSeatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addSeat();
              }
            }}
          />
          <button type="button" className="btn btn-sm btn-ghost" onClick={addSeat}>
            添加位置
          </button>
        </div>
      ) : null}
      <div className="row-gap" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-sm btn-ghost" disabled={!positions.length} onClick={() => printTags(positions)}>
          打印 / 导出全部桌签（可另存 PDF）
        </button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={!positions.length} onClick={() => downloadTags(positions)}>
          下载全部桌签 PNG
        </button>
      </div>

      {editable ? (
        <div className="row-gap" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save}>
            {busy ? '保存中…' : '保存门店配置'}
          </button>
        </div>
      ) : (
        <p className="faint tiny" style={{ marginTop: 10 }}>
          当前账号只有查看权限。
        </p>
      )}

      <Modal
        open={!!seatTag}
        title={`桌签 · ${seatTag || ''}`}
        description={
          qrBase
            ? '张贴在桌面。微信「扫一扫」会直接打开小程序并选中本店本桌；下方链接可复制到公众平台「测试链接」（每规则最多 5 条）验证。链接前缀需已在公众平台登记并发布规则。'
            : '张贴在桌面。顾客在小程序内点「扫桌签」扫描后，会自动选中本店与这个座位；当前码内文本为「门店ID|位置名」。'
        }
        onClose={() => setSeatTag(null)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSeatTag(null)}>
              关闭
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => seatTag && downloadTag(seatTag)}>
              下载 PNG
            </button>
            <button type="button" className="btn btn-primary" onClick={() => seatTag && printTags([seatTag])}>
              打印此桌签
            </button>
          </>
        }
      >
        {seatTag ? (
          <div style={{ textAlign: 'center' }}>
            <img
              src={qrDataUrl(seatQrValue(qrBase, store.id, seatTag))}
              alt={`${store.name} ${seatTag} 桌签`}
              style={{ width: 220, height: 220, display: 'inline-block' }}
            />
            <p className="small" style={{ margin: '6px 0 0' }}>
              {store.name} · {seatTag}
            </p>
            <p className="faint tiny" style={{ margin: 0, wordBreak: 'break-all' }}>
              {qrBase ? seatQrValue(qrBase, store.id, seatTag) : seatCode(store.id, seatTag)}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function StoreCreateDrawer({
  open,
  onClose,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    nameEn: '',
    short: '',
    city: '',
    cityEn: '',
    address: '',
    addressEn: '',
    lat: '',
    lng: '',
    hours: '10:00–21:00',
    waitMinutes: '8',
    positions: '吧台01',
    open: true,
    retailPickup: true,
    printerStatus: 'online',
    mini: true,
    assisted: true,
    meituan: false,
    taobao: false
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm((current) => ({ ...current, name: '', nameEn: '', short: '', city: '', cityEn: '', address: '', addressEn: '', lat: '', lng: '' }));
    setBusy(false);
    setError(null);
  }, [open]);

  const save = async () => {
    const positions = form.positions
      .split(/[、,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!form.name.trim() || !form.city.trim() || !form.address.trim()) {
      setError('门店名称、城市和地址不能为空');
      return;
    }
    if (!positions.length) {
      setError('至少填写一个取餐位置');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminCreateStore({
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || undefined,
        short: form.short.trim() || undefined,
        city: form.city.trim(),
        cityEn: form.cityEn.trim() || undefined,
        address: form.address.trim(),
        addressEn: form.addressEn.trim() || undefined,
        lat: form.lat.trim() === '' ? 0 : Number(form.lat),
        lng: form.lng.trim() === '' ? 0 : Number(form.lng),
        open: form.open,
        retailPickup: form.retailPickup,
        printerStatus: form.printerStatus,
        hours: form.hours,
        waitMinutes: Number(form.waitMinutes),
        positions,
        channels: {
          mini: form.mini,
          assisted: form.assisted,
          meituan: form.meituan,
          taobao: form.taobao
        }
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      title="新增门店"
      subtitle="创建后自动按商品目录建立本店库存，随后可在门店卡片继续维护与打印桌签"
      width="lg"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? '创建中…' : '创建门店'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="门店名称">
          <input value={form.name} maxLength={40} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field label="英文名称">
          <input value={form.nameEn} maxLength={60} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
        </Field>
        <Field label="城市">
          <input value={form.city} maxLength={20} onChange={(event) => setForm({ ...form, city: event.target.value })} />
        </Field>
        <Field label="城市英文">
          <input value={form.cityEn} maxLength={40} onChange={(event) => setForm({ ...form, cityEn: event.target.value })} />
        </Field>
        <Field label="门店简称">
          <input value={form.short} maxLength={20} onChange={(event) => setForm({ ...form, short: event.target.value })} />
        </Field>
        <Field label="营业时间">
          <input value={form.hours} maxLength={40} onChange={(event) => setForm({ ...form, hours: event.target.value })} />
        </Field>
        <Field label="门店地址">
          <input value={form.address} maxLength={120} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        </Field>
        <Field label="地址英文">
          <input value={form.addressEn} maxLength={160} onChange={(event) => setForm({ ...form, addressEn: event.target.value })} />
        </Field>
        <Field label="纬度" hint="可稍后在门店卡片补充，用于按距离排序。">
          <input inputMode="decimal" value={form.lat} placeholder="31.23" onChange={(event) => setForm({ ...form, lat: event.target.value })} />
        </Field>
        <Field label="经度">
          <input inputMode="decimal" value={form.lng} placeholder="121.47" onChange={(event) => setForm({ ...form, lng: event.target.value })} />
        </Field>
        <Field label="预计等待（分钟）">
          <input
            type="number"
            min={0}
            max={180}
            value={form.waitMinutes}
            onChange={(event) => setForm({ ...form, waitMinutes: event.target.value })}
          />
        </Field>
        <Field label="标签机状态">
          <Segmented
            value={form.printerStatus}
            options={[
              { value: 'online', label: '在线' },
              { value: 'offline', label: '离线' }
            ]}
            onChange={(value) => setForm({ ...form, printerStatus: value })}
          />
        </Field>
        <div className="span-2">
          <Field label="取餐位置" hint="用顿号、逗号或空格分隔；创建后可在门店卡片逐个打印桌签。">
            <input value={form.positions} onChange={(event) => setForm({ ...form, positions: event.target.value })} />
          </Field>
        </div>
        <div className="span-2">
          <div className="cust-sheet-label">默认开关</div>
          <div className="row-gap">
            <label className="check-line">
              <input type="checkbox" checked={form.open} onChange={(event) => setForm({ ...form, open: event.target.checked })} />
              立即营业
            </label>
            <label className="check-line">
              <input type="checkbox" checked={form.retailPickup} onChange={(event) => setForm({ ...form, retailPickup: event.target.checked })} />
              支持零售提货
            </label>
            <label className="check-line">
              <input type="checkbox" checked={form.mini} onChange={(event) => setForm({ ...form, mini: event.target.checked })} />
              小程序
            </label>
            <label className="check-line">
              <input type="checkbox" checked={form.assisted} onChange={(event) => setForm({ ...form, assisted: event.target.checked })} />
              营业台代点
            </label>
            <label className="check-line">
              <input type="checkbox" checked={form.meituan} onChange={(event) => setForm({ ...form, meituan: event.target.checked })} />
              美团外卖
            </label>
            <label className="check-line">
              <input type="checkbox" checked={form.taobao} onChange={(event) => setForm({ ...form, taobao: event.target.checked })} />
              淘宝闪购
            </label>
          </div>
        </div>
      </div>
      <InlineError message={error} />
    </Drawer>
  );
}

/* ------------------------------- staff ------------------------------- */

function StaffPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminStaff(), []);
  const storesQ = useApi(() => api.customerStores(), []);
  const [editing, setEditing] = useState<StaffRow | 'new' | null>(null);

  if (query.loading && !query.data) return <Spinner label="正在读取账号" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  const storeName = (id: string) => storesQ.data?.stores.find((store) => store.id === id)?.name || id;

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 组织"
        title="账号管理"
        description="账号通过角色获得权限，通过门店范围限制数据可见性。审批与退款等操作同样受门店范围约束。"
        meta={<span>{data.staff.length} 个账号 · {data.roles.length} 个角色</span>}
        actions={
          can('rbac:edit') ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={14} /> 新建账号
            </button>
          ) : null
        }
      />
      <Panel title="全部账号" flush>
        <div className="table-wrap">
          <table className="tbl staff-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>登录账号</th>
                <th>角色</th>
                <th>门店范围</th>
                <th>状态</th>
                <th className="actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="cell-main">
                      <span className="avatar">{member.name.slice(0, 1)}</span>
                      <span className="cell-title">{member.name}</span>
                    </div>
                  </td>
                  <td className="mono">{member.username}</td>
                  <td>
                    <div className="product-tags">
                      {member.roles.map((role) => (
                        <span className="tag" key={role.id}>
                          {role.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="small">
                    {member.allStores ? '全部门店' : member.storeIds.map(storeName).join('、') || '—'}
                  </td>
                  <td>
                    <Badge tone={member.active ? 'ok' : 'danger'}>{member.active ? '正常' : '已停用'}</Badge>
                  </td>
                  <td className="actions">
                    {can('rbac:edit') ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(member)}>
                        编辑
                      </button>
                    ) : (
                      <span className="faint tiny">只读</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <StaffDrawer
        editing={editing}
        roles={data.roles}
        stores={storesQ.data?.stores || []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          notify('账号已保存', 'ok');
          query.reload({ silent: true });
        }}
      />
      <p className="page-foot-note">
        新建账号使用 6–20 位数字手机号作为登录名，初始密码必填、不限制长度，建议首次登录后由本人修改。账号停用后无法登录，但历史操作记录保留。
      </p>
    </>
  );
}

const STAFF_FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  username: '登录账号',
  password: '密码',
  roleIds: '角色',
  storeIds: '门店范围',
  allStores: '门店范围',
  active: '账号状态'
};

/** 把服务端的校验明细（details）拼成“字段：原因”，不再只显示泛化提示。 */
function staffErrorMessage(err: ApiError) {
  const details = Array.isArray(err.details) ? (err.details as Array<{ path?: string; message?: string }>) : [];
  const lines = details
    .filter((item) => item && typeof item.message === 'string' && /[\u4e00-\u9fa5]/.test(item.message))
    .map((item) => `${STAFF_FIELD_LABELS[item.path || ''] || '参数'}：${item.message}`);
  if (!lines.length) return err.message;
  return Array.from(new Set(lines)).join('；');
}

function StaffDrawer({
  editing,
  roles,
  stores,
  onClose,
  onSaved
}: {
  editing: StaffRow | 'new' | null;
  roles: Role[];
  stores: Store[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === 'new';
  const member = editing && editing !== 'new' ? editing : null;
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [allStores, setAllStores] = useState(false);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!editing) return;
    setError(null);
    setBusy(false);
    setShowErrors(false);
    hydrated.current = false;
    if (editing === 'new') {
      setName('');
      setUsername('');
      setPassword('');
      setAllStores(false);
      setStoreIds([stores[0]?.id].filter(Boolean) as string[]);
      setRoleIds([roles.find((role) => role.id === 'r-staff')?.id || roles[0]?.id].filter(Boolean) as string[]);
      setActive(true);
      return;
    }
    setName(editing.name);
    setUsername(editing.username);
    setPassword('');
    setAllStores(editing.allStores);
    setStoreIds(editing.storeIds);
    setRoleIds(editing.roles.map((role) => role.id));
    setActive(editing.active);
  }, [editing]);

  // 角色 / 门店是异步加载的：抽屉先打开、数据后到时默认值为空，保存会被服务端拦成
  // “请至少选择一个角色 / 请选择授权门店”。数据到位后补一次默认值，且只在用户尚未选择时补。
  useEffect(() => {
    if (!isNew || hydrated.current) return;
    if (!roles.length || !stores.length) return;
    hydrated.current = true;
    setRoleIds((list) =>
      list.length ? list : ([roles.find((role) => role.id === 'r-staff')?.id || roles[0]?.id].filter(Boolean) as string[])
    );
    setStoreIds((list) => (list.length ? list : stores.slice(0, 1).map((store) => store.id)));
  }, [isNew, roles, stores]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  // 先在前端拦一遍：服务端只能给出笼统的“参数格式不正确”，用户不知道改哪一项。
  const issues: Array<{ field: 'name' | 'username' | 'password' | 'roles' | 'stores'; message: string }> = [];
  if (!name.trim()) issues.push({ field: 'name', message: '请填写姓名' });
  if (name.trim().length > 30) issues.push({ field: 'name', message: '姓名最多 30 个字' });
  if (isNew && !/^\d{6,20}$/.test(username.trim())) {
    issues.push({ field: 'username', message: '登录账号需为 6–20 位数字手机号' });
  }
  if (isNew && !password) issues.push({ field: 'password', message: '请填写初始密码' });
  if (password.length > 72) issues.push({ field: 'password', message: '密码最多 72 位' });
  if (!roleIds.length) issues.push({ field: 'roles', message: '请至少选择一个角色' });
  if (!allStores && !storeIds.length) issues.push({ field: 'stores', message: '请至少选择一个门店，或开启全部门店' });
  const fieldError = (field: 'name' | 'username' | 'password' | 'roles' | 'stores') =>
    showErrors ? issues.find((issue) => issue.field === field)?.message || null : null;

  const save = async () => {
    setShowErrors(true);
    if (issues.length) {
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        roleIds,
        allStores,
        storeIds: allStores ? [] : storeIds,
        active
      };
      if (isNew) {
        body.username = username.trim();
        body.password = password;
        await api.adminCreateStaff(body);
      } else if (member) {
        if (password) body.password = password;
        await api.adminUpdateStaff(member.id, body);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? staffErrorMessage(err) : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!editing}
      title={isNew ? '新建账号' : `编辑账号 · ${member?.name || ''}`}
      subtitle="权限来自角色，门店范围决定可操作与可查看的数据"
      width="lg"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? '保存中…' : '保存账号'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="姓名" error={fieldError('name')}>
          <input value={name} maxLength={30} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="登录账号" hint={isNew ? '6–20 位数字手机号' : '登录名创建后不可修改'} error={fieldError('username')}>
          <input
            value={username}
            maxLength={20}
            disabled={!isNew}
            onChange={(event) => setUsername(event.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field
          label={isNew ? '初始密码' : '重置密码'}
          hint={isNew ? '不限长度；建议首次登录后由本人修改。' : '编辑时留空表示不修改。'}
          error={fieldError('password')}
        >
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="账号状态">
          <div className="flex">
            <Switch checked={active} onChange={setActive} label="账号状态" />
            <span className="small muted">{active ? '允许登录' : '已停用'}</span>
          </div>
        </Field>
        <div className="span-2">
          <div className="cust-sheet-label">角色</div>
          <div className="perm-list">
            {roles.map((role) => (
              <label className="perm-check" key={role.id}>
                <input
                  type="checkbox"
                  checked={roleIds.includes(role.id)}
                  onChange={() => setRoleIds((list) => toggle(list, role.id))}
                />
                {role.name}
                <span className="faint tiny">（{role.scope === 'ALL' ? '全部门店' : '按门店'}）</span>
              </label>
            ))}
          </div>
          {!roles.length ? <span className="field-hint">角色列表未加载完成，请稍后重试或刷新页面。</span> : null}
          {fieldError('roles') ? <span className="field-error">{fieldError('roles')}</span> : null}
        </div>
        <div className="span-2">
          <Field label="门店范围">
            <div className="flex">
              <Switch checked={allStores} onChange={setAllStores} label="全部门店" />
              <span className="small muted">全部门店（总部角色）</span>
            </div>
          </Field>
          {!allStores ? (
            <div className="perm-list" style={{ marginTop: 8 }}>
              {stores.map((store) => (
                <label className="perm-check" key={store.id}>
                  <input
                    type="checkbox"
                    checked={storeIds.includes(store.id)}
                    onChange={() => setStoreIds((list) => toggle(list, store.id))}
                  />
                  {store.name}
                </label>
              ))}
            </div>
          ) : null}
          {!allStores && !stores.length ? (
            <span className="field-hint">门店列表未加载完成，请稍后重试或刷新页面。</span>
          ) : null}
          {fieldError('stores') ? <span className="field-error">{fieldError('stores')}</span> : null}
        </div>
      </div>
      <InlineError message={error} />
    </Drawer>
  );
}

/* ------------------------------- roles ------------------------------- */

function RolesPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminRoles(), []);
  const [editing, setEditing] = useState<Role | 'new' | null>(null);

  if (query.loading && !query.data) return <Spinner label="正在读取角色" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  const cloneRole = (role: Role) => {
    setEditing({
      ...role,
      id: '',
      name: `${role.name} 副本`,
      builtin: false,
      description: role.description,
      users: 0
    } as Role);
  };

  const permissionName = new Map(data.catalog.permissions.map((permission) => [permission.code, permission.name]));
  const isFixedSuper = (role: Role) => role.perms.includes('*');

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 组织"
        title="角色权限"
        description="角色决定可见菜单与可执行操作；内置岗位角色可直接编辑，超级管理员固定保留全部权限。"
        meta={<span>{data.roles.length} 个角色 · {data.catalog.permissions.length} 项权限</span>}
        actions={
          can('rbac:edit') ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={14} /> 新建角色
            </button>
          ) : null
        }
      />
      <div className="stack">
        {data.roles.map((role) => (
          <div className="role-card" key={role.id}>
            <div>
              <h3>
                {role.name}
                <span className="scope-pill">{role.scope === 'ALL' ? '全部门店' : '按门店'}</span>
                {role.builtin ? <Badge tone="neutral">内置</Badge> : <Badge tone="accent">自定义</Badge>}
              </h3>
              <p>{role.description || '未填写说明'}</p>
              <div className="role-perms">
                {isFixedSuper(role)
                  ? '全部权限 · 系统保留'
                  : `${role.perms.length} 项权限 · ${role.users || 0} 个账号使用`}
              </div>
              {isFixedSuper(role) ? null : (
                <div className="role-perm-names">
                  {role.perms.length
                    ? role.perms.map((code) => permissionName.get(code) || code).join(' · ')
                    : '尚未选择权限'}
                </div>
              )}
            </div>
            <div className="row-gap">
              {can('rbac:edit') ? (
                isFixedSuper(role) ? (
                  <span className="faint tiny">系统保留</span>
                ) : (
                  <>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditing(role)}>
                      编辑
                    </button>
                    {role.builtin ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => cloneRole(role)}>
                        克隆
                      </button>
                    ) : null}
                  </>
                )
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <RoleDrawer
        editing={editing}
        catalog={data.catalog}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          notify('角色已保存', 'ok');
          query.reload({ silent: true });
        }}
      />
      <p className="page-foot-note">
        带「菜单」标记的权限决定左侧导航是否出现；角色修改保存后立即对所有使用该角色的账号生效。自定义角色不能授予自己没有的权限；超级管理员使用通配符，固定不可修改。门店范围与角色相互独立，账号必须同时拥有角色与门店授权。
      </p>
    </>
  );
}

function RoleDrawer({
  editing,
  catalog,
  onClose,
  onSaved
}: {
  editing: Role | 'new' | null;
  catalog: { modules: PermissionModule[]; permissions: Permission[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === 'new';
  const role = editing && editing !== 'new' ? editing : null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'ALL' | 'STORES'>('STORES');
  const [perms, setPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setError(null);
    if (editing === 'new') {
      setName('');
      setDescription('');
      setScope('STORES');
      setPerms(['pos:use', 'order:view']);
      return;
    }
    setName(editing.name);
    setDescription(editing.description);
    setScope(editing.scope === 'ALL' ? 'ALL' : 'STORES');
    setPerms(editing.perms.filter((perm) => perm !== '*'));
  }, [editing]);

  const toggle = (code: string) =>
    setPerms((list) => (list.includes(code) ? list.filter((item) => item !== code) : [...list, code]));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminSaveRole({
        id: role?.id || undefined,
        name,
        description,
        scope,
        perms
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!editing}
      title={isNew ? '新建角色' : `编辑角色 · ${role?.name || ''}`}
      subtitle="按模块选择权限，保存后立即对该角色的账号生效"
      width="lg"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim() || !perms.length} onClick={save}>
            {busy ? '保存中…' : '保存角色'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="角色名称">
          <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="数据范围">
          <select value={scope} onChange={(event) => setScope(event.target.value as 'ALL' | 'STORES')}>
            <option value="STORES">按授权门店</option>
            <option value="ALL">全部门店</option>
          </select>
        </Field>
        <Field label="说明" className="span-2">
          <input value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </div>
      <div className="section-title">
        <h2>权限</h2>
        <span className="faint tiny">{perms.length} 项已选</span>
      </div>
      <p className="faint tiny" style={{ marginBottom: 10 }}>
        带「菜单」标记的权限决定左侧导航是否出现；其余为页面内操作或敏感字段权限。
      </p>
      <div className="permission-matrix">
        {catalog.modules.map((module) => {
          const list = catalog.permissions.filter((permission) => permission.module === module.key);
          return (
            <div className="perm-module" key={module.key}>
              <strong>{module.name}</strong>
              <div className="perm-list">
                {list.map((permission) => (
                  <label className="perm-check" key={permission.code}>
                    <input
                      type="checkbox"
                      checked={perms.includes(permission.code)}
                      onChange={() => toggle(permission.code)}
                    />
                    {permission.name}
                    {permission.level === 'MENU' ? <span className="perm-level">菜单</span> : null}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <InlineError message={error} />
    </Drawer>
  );
}

/* ------------------------------- logs ------------------------------- */

/* ------------------------------- 首页内容 ------------------------------- */

const BANNER_LINK_LABEL: Record<BannerLinkType, string> = {
  none: '不跳转',
  menu: '茶单',
  series: '茶单系列',
  retail: '带回家',
  orders: '我的订单',
  profile: '个人中心',
  product: '商品详情'
};

function bannerTargetText(banner: Banner, products: HomeContent['products']) {
  if (banner.linkType === 'series') {
    const series = SERIES[banner.linkValue as Series];
    return `${BANNER_LINK_LABEL.series} · ${series ? series.name : '系列已失效'}`;
  }
  if (banner.linkType === 'product') {
    const product = products.find((item) => item.id === banner.linkValue);
    return `${BANNER_LINK_LABEL.product} · ${product ? product.name : '商品已不存在'}`;
  }
  return BANNER_LINK_LABEL[banner.linkType] || '不跳转';
}

function ContentPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const confirm = useConfirm();
  const query = useApi(() => api.adminHomeContent(), []);
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);
  const [bannerBusy, setBannerBusy] = useState('');
  const [seriesBusy, setSeriesBusy] = useState('');
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const canEdit = can('product:edit');

  if (query.loading && !query.data) return <Spinner label="正在读取首页内容" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  const moveBanner = async (banner: Banner, direction: -1 | 1) => {
    const index = data.banners.findIndex((item) => item.id === banner.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= data.banners.length) return;
    const ids = data.banners.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBannerBusy(banner.id);
    try {
      await api.adminReorderBanners(ids);
      notify('轮播顺序已更新', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '调整顺序失败', 'danger');
    } finally {
      setBannerBusy('');
    }
  };

  const toggleBanner = async (banner: Banner) => {
    setBannerBusy(banner.id);
    try {
      await api.adminUpdateBanner(banner.id, { active: !banner.active });
      notify(banner.active ? '轮播已停用' : '轮播已启用', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '操作失败', 'danger');
    } finally {
      setBannerBusy('');
    }
  };

  const removeBanner = async (banner: Banner) => {
    const ok = await confirm({
      title: '删除这屏轮播？',
      message: `${banner.title}。删除后图片文件会一并清理，无法恢复。`,
      confirmText: '删除',
      tone: 'danger'
    });
    if (!ok) return;
    setBannerBusy(banner.id);
    try {
      await api.adminDeleteBanner(banner.id);
      notify('轮播已删除', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '删除失败', 'danger');
    } finally {
      setBannerBusy('');
    }
  };

  const uploadSeries = async (slot: HomeSeriesSlot, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 清空 input，允许连续选择同一个文件重新上传。
    event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setSeriesError('图片超过 20MB，请换一张更小的图片');
      return;
    }
    setSeriesBusy(slot.key);
    setSeriesError(null);
    try {
      const prepared = await prepareHomeImage(file);
      await api.adminUploadSeriesImage(slot.key, {
        base64: prepared.base64,
        contentType: prepared.contentType
      });
      notify(`${SERIES[slot.series].name} · ${slot.locale === 'en' ? '英文' : '中文'}图已更新`, 'ok');
      query.reload({ silent: true });
    } catch (err) {
      setSeriesError(err instanceof ApiError || err instanceof Error ? err.message : '上传失败');
    } finally {
      setSeriesBusy('');
    }
  };

  const resetSeries = async (slot: HomeSeriesSlot) => {
    const ok = await confirm({
      title: '恢复内置系列图？',
      message: `${SERIES[slot.series].name} · ${slot.locale === 'en' ? '英文' : '中文'}将回到小程序内置图片，后台上传的这张会被删除。`,
      confirmText: '恢复内置图'
    });
    if (!ok) return;
    setSeriesBusy(slot.key);
    setSeriesError(null);
    try {
      await api.adminResetSeriesImage(slot.key);
      notify('已恢复内置系列图', 'ok');
      query.reload({ silent: true });
    } catch (err) {
      setSeriesError(err instanceof ApiError ? err.message : '恢复失败');
    } finally {
      setSeriesBusy('');
    }
  };

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 首页"
        title="首页内容"
        description="小程序首页的轮播广告与四系列图。图片按 1600×900 整张上传，文案直接做在图里；轮播可配置站内跳转并按顺序自动播放。"
        meta={<span>{data.banners.length} / 8 屏轮播 · 8 个系列图槽位</span>}
        actions={
          canEdit ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={14} /> 新建轮播
            </button>
          ) : null
        }
      />

      <Panel title="首页轮播" flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>顺序</th>
                <th>预览</th>
                <th>名称</th>
                <th>点击跳转</th>
                <th>状态</th>
                <th className="actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.banners.map((banner, index) => (
                <tr key={banner.id}>
                  <td>
                    {canEdit ? (
                      <div className="order-actions">
                        <button
                          type="button"
                          className="order-btn"
                          aria-label={`${banner.title} 上移`}
                          disabled={Boolean(bannerBusy) || index <= 0}
                          onClick={() => moveBanner(banner, -1)}
                        >
                          <Icon name="arrowUp" size={13} />
                        </button>
                        <button
                          type="button"
                          className="order-btn"
                          aria-label={`${banner.title} 下移`}
                          disabled={Boolean(bannerBusy) || index >= data.banners.length - 1}
                          onClick={() => moveBanner(banner, 1)}
                        >
                          <Icon name="arrowDown" size={13} />
                        </button>
                      </div>
                    ) : (
                      <span className="tiny muted">{index + 1}</span>
                    )}
                  </td>
                  <td>
                    <img className="banner-thumb" src={banner.imageUrl} alt={`${banner.title} 预览`} loading="lazy" />
                  </td>
                  <td>
                    <span className="cell-title">{banner.title}</span>
                  </td>
                  <td>
                    <span className="small">{bannerTargetText(banner, data.products)}</span>
                  </td>
                  <td>
                    <Badge tone={banner.active ? 'ok' : 'neutral'}>{banner.active ? '展示中' : '已停用'}</Badge>
                  </td>
                  <td className="actions">
                    {canEdit ? (
                      <>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(banner)}>
                          编辑
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={Boolean(bannerBusy)}
                          onClick={() => toggleBanner(banner)}
                        >
                          {banner.active ? '停用' : '启用'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger-soft"
                          disabled={Boolean(bannerBusy)}
                          onClick={() => removeBanner(banner)}
                        >
                          删除
                        </button>
                      </>
                    ) : (
                      <span className="tiny muted">只读</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.banners.length ? (
            <EmptyState
              icon="sparkle"
              title="还没有轮播广告"
              description="未配置时，小程序首页显示默认品牌主视觉。新建后按这里从上到下的顺序自动轮播。"
            />
          ) : null}
        </div>
      </Panel>

      <Panel
        title="首页系列图"
        actions={<span className="tiny muted">四系列 × 中英两套，固定 1600×900</span>}
      >
        <div className="home-series-grid">
          {data.series.map((slot) => (
            <div className="series-slot" key={slot.key}>
              <div className="series-slot-art">
                {slot.imageUrl ? (
                  <img src={slot.imageUrl} alt={`${SERIES[slot.series].name}系列图预览`} loading="lazy" />
                ) : (
                  <span>{SERIES[slot.series].char}</span>
                )}
              </div>
              <div className="series-slot-body">
                <div>
                  <div className="series-slot-title">
                    {SERIES[slot.series].name} · {slot.locale === 'en' ? '英文' : '中文'}
                    {slot.imageUrl ? <Badge tone="accent">后台上传</Badge> : <Badge tone="neutral">内置图</Badge>}
                  </div>
                  <span className="tiny muted">{slot.key}</span>
                </div>
                {canEdit ? (
                  <div className="series-slot-actions">
                    <label className="btn btn-sm btn-ghost">
                      {seriesBusy === slot.key ? '上传中…' : '上传'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        disabled={Boolean(seriesBusy)}
                        onChange={(event) => uploadSeries(slot, event)}
                      />
                    </label>
                    {slot.imageUrl ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={Boolean(seriesBusy)}
                        onClick={() => resetSeries(slot)}
                      >
                        恢复内置
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <InlineError message={seriesError} />
        <p className="page-foot-note">
          上传后顾客端立即使用新图；替换会删除上一张，恢复内置图会回到小程序包内的原始图。中文/英文模式各用对应一套，
          尺寸必须是 {HOME_IMAGE_WIDTH}×{HOME_IMAGE_HEIGHT}，与首页轮播一致。
        </p>
      </Panel>

      <BannerDrawer
        editing={editing}
        products={data.products}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          notify('轮播已保存', 'ok');
          query.reload({ silent: true });
        }}
      />
    </>
  );
}

function BannerDrawer({
  editing,
  products,
  onClose,
  onSaved
}: {
  editing: Banner | 'new' | null;
  products: HomeContent['products'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === 'new';
  const banner = editing && editing !== 'new' ? editing : null;
  const [title, setTitle] = useState('');
  const [linkType, setLinkType] = useState<BannerLinkType>('none');
  const [linkValue, setLinkValue] = useState('');
  const [active, setActive] = useState(true);
  const [image, setImage] = useState<{ base64: string; contentType: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setError(null);
    setImage(null);
    setBusy(false);
    if (editing === 'new') {
      setTitle('');
      setLinkType('none');
      setLinkValue('');
      setActive(true);
      return;
    }
    setTitle(editing.title);
    setLinkType(editing.linkType);
    setLinkValue(editing.linkValue);
    setActive(editing.active);
  }, [editing]);

  const changeLinkType = (next: BannerLinkType) => {
    setLinkType(next);
    if (next === 'series') {
      setLinkValue((value) => (['xing', 'song', 'qing', 'mian'].includes(value) ? value : 'xing'));
    } else if (next === 'product') {
      setLinkValue((value) => (products.some((item) => item.id === value) ? value : products[0]?.id || ''));
    } else {
      setLinkValue('');
    }
  };

  const pickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('图片超过 20MB，请换一张更小的图片');
      return;
    }
    try {
      const prepared = await prepareHomeImage(file);
      setError(null);
      setImage(prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取图片失败，请重新选择');
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      setError('请填写轮播名称');
      return;
    }
    if (isNew && !image) {
      setError(`请上传 ${HOME_IMAGE_WIDTH}×${HOME_IMAGE_HEIGHT} 的轮播图`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = { title: title.trim(), linkType, linkValue, active };
      if (isNew && image) {
        await api.adminCreateBanner({ ...payload, base64: image.base64, contentType: image.contentType });
      } else if (banner) {
        await api.adminUpdateBanner(banner.id, image ? { ...payload, base64: image.base64, contentType: image.contentType } : payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!editing}
      title={isNew ? '新建轮播' : `编辑轮播 · ${banner?.title || ''}`}
      subtitle={`整张成品图 ${HOME_IMAGE_WIDTH}×${HOME_IMAGE_HEIGHT}，小程序默认自动播放`}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? '保存中…' : '保存轮播'}
          </button>
        </>
      }
    >
      <div className="product-image-field">
        <div className="cust-sheet-label">轮播图片</div>
        {image || banner?.imageUrl ? (
          <div className="banner-preview">
            <img src={image ? image.preview : banner?.imageUrl} alt="轮播图预览" />
          </div>
        ) : (
          <div className="banner-preview empty">尚未选择图片</div>
        )}
        <div className="row-gap" style={{ marginTop: 10 }}>
          <label className="btn btn-sm btn-ghost">
            <Icon name="upload" size={14} /> {image || banner?.imageUrl ? '更换图片' : '上传图片'}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickImage} />
          </label>
          <span className="tiny muted">
            必须正好 {HOME_IMAGE_WIDTH}×{HOME_IMAGE_HEIGHT}，JPG / PNG / WebP；超过 2MB 会在浏览器内自动降质，不会裁切。
          </span>
        </div>
      </div>

      <div className="form-grid">
        <Field label="轮播名称" hint="仅后台识别用，不显示在顾客端（文案请做在图片里）。">
          <input value={title} maxLength={40} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="点击跳转" hint="仅支持站内页面；顾客点击整张图跳转。">
          <select value={linkType} onChange={(event) => changeLinkType(event.target.value as BannerLinkType)}>
            {(Object.keys(BANNER_LINK_LABEL) as BannerLinkType[]).map((key) => (
              <option key={key} value={key}>
                {BANNER_LINK_LABEL[key]}
              </option>
            ))}
          </select>
        </Field>
        {linkType === 'series' ? (
          <Field label="跳转到哪个系列">
            <select value={linkValue} onChange={(event) => setLinkValue(event.target.value)}>
              {(['xing', 'song', 'qing', 'mian'] as Series[]).map((key) => (
                <option key={key} value={key}>
                  {SERIES[key].char} · {SERIES[key].nameEn}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {linkType === 'product' ? (
          <Field label="跳转到哪个商品" hint="已归档或草稿商品在茶单里不可售，请谨慎选择。">
            <select value={linkValue} onChange={(event) => setLinkValue(event.target.value)}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.status !== 'published' ? '（不可售）' : ''}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <div className="span-2">
          <label className="check-line">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            在顾客首页展示
          </label>
        </div>
      </div>
      <InlineError message={error} />
    </Drawer>
  );
}

function LogsPage() {
  const [range, setRange] = useStoredRange('logs', '7');
  const [type, setType] = useStoredState<
    'all' | 'order' | 'payment' | 'finance' | 'approval' | 'product' | 'store' | 'rbac' | 'auth' | 'loss'
  >('teahour.admin.logs.type', 'all', [
    'all',
    'order',
    'payment',
    'finance',
    'approval',
    'product',
    'store',
    'rbac',
    'auth',
    'loss'
  ]);
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState('');
  const query = useApi(
    () => api.adminLogs({ ...rangeQuery(range), type: type === 'all' ? undefined : type, q: keyword || undefined, limit: 300 }),
    [range, type, keyword]
  );

  if (query.loading && !query.data) return <Spinner label="正在读取操作记录" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const logs = query.data?.logs || [];

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 审计"
        title="操作记录"
        description="订单、支付、财务、审批、报损、商品与权限变更的追加式日志，用于追溯责任。"
        meta={<span>统计区间：{rangeLabel({ from: range.from, to: range.to })} · {logs.length} 条</span>}
        actions={
          <RangeBar value={range} onChange={setRange} busy={query.loading}>
            <select value={type} onChange={(event) => setType(event.target.value as typeof type)} aria-label="日志类型">
              <option value="all">全部类型</option>
              <option value="order">订单</option>
              <option value="payment">支付</option>
              <option value="finance">财务</option>
              <option value="approval">审批</option>
              <option value="product">商品</option>
              <option value="store">门店</option>
              <option value="rbac">权限</option>
              <option value="auth">登录</option>
              <option value="loss">报损</option>
            </select>
          </RangeBar>
        }
      />
      <Panel
        title="日志明细"
        actions={
          <form
            className="search"
            onSubmit={(event) => {
              event.preventDefault();
              setKeyword(draft.trim());
            }}
          >
            <Icon name="search" size={15} />
            <input value={draft} placeholder="搜索操作人 / 内容" aria-label="搜索日志" onChange={(event) => setDraft(event.target.value)} />
          </form>
        }
        flush
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>类型</th>
                <th>动作</th>
                <th>详情</th>
                <th>门店</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="nowrap">{dateTimeText(log.at)}</td>
                  <td className="cell-title">{log.actorName}</td>
                  <td>
                    <span className="tag">{log.type || '—'}</span>
                  </td>
                  <td>{log.action}</td>
                  <td className="faint">{log.detail}</td>
                  <td className="small">{log.storeName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logs.length ? <EmptyState icon="list" title="没有符合条件的操作记录" description="调整周期或类型后再试。" /> : null}
        </div>
      </Panel>
      <p className="page-foot-note">日志只读且不可编辑；账号停用或门店调整后，历史记录仍保留原始操作人与门店信息。</p>
    </>
  );
}
