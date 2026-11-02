import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, type RangeQuery } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useStaffAuth } from '../lib/auth';
import { StaffShell, type NavItem } from '../components/StaffShell';
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
import type {
  Approval,
  Category,
  Expense,
  FinanceEntry,
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
  StaffRow,
  Store
} from '../lib/types';

/* ------------------------------- shared ------------------------------- */

type Section =
  | 'overview'
  | 'finance'
  | 'profit'
  | 'expenses'
  | 'approvals'
  | 'losses'
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
  losses: '报损与损耗',
  products: '商品目录',
  mappings: '原料映射',
  stores: '门店配置',
  staff: '账号管理',
  roles: '角色权限',
  logs: '操作记录'
};

const NAV: Array<NavItem & { perm: string }> = [
  { key: 'overview', label: '经营概览', icon: 'chart', perm: 'dashboard:view', group: '经营' },
  { key: 'finance', label: '财务流水', icon: 'coin', perm: 'finance:view', group: '经营' },
  { key: 'profit', label: '门店利润', icon: 'sliders', perm: 'dashboard:profit', group: '经营' },
  { key: 'expenses', label: '运营费用', icon: 'receipt', perm: 'finance:view', group: '经营' },
  { key: 'approvals', label: '审批中心', icon: 'check', perm: 'approval:view', group: '风控' },
  { key: 'losses', label: '报损与损耗', icon: 'alert', perm: 'loss:view', group: '风控' },
  { key: 'products', label: '商品目录', icon: 'tray', perm: 'product:view', group: '商品与门店' },
  { key: 'mappings', label: '原料映射', icon: 'box', perm: 'mapping:view', group: '商品与门店' },
  { key: 'stores', label: '门店配置', icon: 'store', perm: 'store:config', group: '商品与门店' },
  { key: 'staff', label: '账号管理', icon: 'users', perm: 'rbac:view', group: '组织与审计' },
  { key: 'roles', label: '角色权限', icon: 'sliders', perm: 'rbac:view', group: '组织与审计' },
  { key: 'logs', label: '操作记录', icon: 'list', perm: 'log:view', group: '组织与审计' }
];

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

function RangeBar({
  value,
  onChange,
  children
}: {
  value: RangeState;
  onChange: (next: RangeState) => void;
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
            onChange={(event) => onChange({ ...value, from: event.target.value })}
          />
          <span className="faint small">至</span>
          <input
            type="date"
            value={value.to}
            min={value.from}
            aria-label="结束日期"
            onChange={(event) => onChange({ ...value, to: event.target.value })}
          />
        </>
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
  const [pending, setPending] = useState(0);
  const [ping, setPing] = useState(0);

  const nav = NAV.filter((item) => can(item.perm));
  const segment = (location.pathname.replace(/^\/admin\/?/, '').split('/')[0] || 'overview') as Section;
  const allowed = nav.some((item) => item.key === segment);
  const section = allowed ? segment : (nav[0]?.key as Section | undefined);

  useEffect(() => {
    if (!staff?.permissions.includes('approval:view')) return;
    let cancelled = false;
    api
      .adminApprovals({ status: 'pending' })
      .then((result) => {
        if (!cancelled) setPending(result.counts.pending);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [staff?.id, section, ping]);

  if (!staff) return null;

  if (!nav.length) {
    return (
      <div className="console-content">
        <EmptyState icon="user" title="当前账号没有后台权限" description="请联系超级管理员在「账号与角色」中分配角色。" />
      </div>
    );
  }

  const navWithBadge = nav.map((item) => (item.key === 'approvals' ? { ...item, badge: pending } : item));

  return (
    <StaffShell
      surface="admin"
      nav={navWithBadge}
      active={section || 'overview'}
      onNavigate={(key) => navigate(`/admin/${key}`)}
    >
      {!allowed && nav.length === 0 ? (
        <EmptyState icon="user" title="暂无可用页面" />
      ) : null}
      {allowed && section === 'overview' ? <OverviewPage /> : null}
      {allowed && section === 'finance' ? <FinancePage /> : null}
      {allowed && section === 'profit' ? <ProfitPage /> : null}
      {allowed && section === 'expenses' ? <ExpensesPage /> : null}
      {allowed && section === 'approvals' ? <ApprovalsPage onChanged={() => setPing((n) => n + 1)} /> : null}
      {allowed && section === 'losses' ? <LossesPage /> : null}
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

function OverviewPage() {
  const [range, setRange] = useState<RangeState>(() => makeRange('today'));
  const [series, setSeries] = useState<Series | null>(null);
  const query = useApi(() => api.adminOverview(rangeQuery(range)), [range]);

  if (query.loading && !query.data) return <Spinner label="正在汇总经营数据" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const overview = query.data?.overview;
  if (!overview) return null;

  const maxDaily = Math.max(...overview.daily.map((day) => day.gross), 1);
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
        actions={<RangeBar value={range} onChange={setRange} />}
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
            <span className="faint tiny">{overview.daily.length} 天</span>
          </div>
          {overview.daily.length ? (
            <div className="bar-chart" aria-label="每日营业额">
              {overview.daily.map((day) => (
                <div className="bar-col" key={day.day} title={`${day.day} · ${money(day.gross)} · ${day.entries} 笔`}>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ height: `${Math.max(3, (day.gross / maxDaily) * 100)}%` }} />
                  </div>
                  <span className="bar-label">{day.day.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="chart" title="所选区间还没有流水" description="调整时间范围或先在门店完成一笔订单。" />
          )}

          <div className="section-title">
            <h2>热销商品</h2>
            <span className="faint tiny">按销售额排序</span>
          </div>
          <div className="table-wrap">
            <table className="tbl">
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
  const [range, setRange] = useState<RangeState>(() => makeRange('today'));
  const [type, setType] = useState<'all' | 'SALE' | 'REFUND'>('all');
  const [storeId, setStoreId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState('');
  const storesQ = useApi(() => api.customerStores(), []);
  const query = useApi(
    () => api.adminFinance({ ...rangeQuery(range), type: type === 'all' ? undefined : type, storeId: storeId || undefined, q: keyword || undefined }),
    [range, type, storeId, keyword]
  );

  if (query.loading && !query.data) return <Spinner label="正在读取财务流水" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

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
          <RangeBar value={range} onChange={setRange}>
            {can('finance:export') ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={exportRows} disabled={!entries.length}>
                <Icon name="download" size={14} /> 导出 CSV
              </button>
            ) : null}
          </RangeBar>
        }
      />

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
  const [range, setRange] = useState<RangeState>(() => makeRange('today'));
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
          <RangeBar value={range} onChange={setRange}>
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
      setError(err instanceof ApiError ? err.message : '读取示例失败');
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
            <Icon name="sparkle" size={14} /> {loadingSample ? '载入中…' : '载入今日示例'}
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
          <span className="faint tiny">示例会为每个授权门店生成人力、租金、总部管理费与水电物业四行。</span>
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
  const [range, setRange] = useState<RangeState>(() => makeRange('today'));
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
        actions={<RangeBar value={range} onChange={setRange} />}
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
  const [status, setStatus] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending');
  const [kind, setKind] = useState<'all' | 'REFUND' | 'LOSS'>('all');
  const query = useApi(() => api.adminApprovals({ status, kind }), [status, kind]);
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
        description="退款与超限报损在同一处处理。审批通过后按业务规则执行退款或扣减库存成本。"
        meta={<span>待处理 {data.counts.pending} · 已通过 {data.counts.approved} · 已驳回 {data.counts.rejected}</span>}
        actions={
          <Segmented
            value={kind}
            ariaLabel="审批类型"
            options={[
              { value: 'all', label: '全部' },
              { value: 'REFUND', label: '退款' },
              { value: 'LOSS', label: '报损' }
            ]}
            onChange={setKind}
          />
        }
      />

      <Tabs
        value={status}
        onChange={setStatus}
        options={[
          { value: 'pending', label: '待处理', count: data.counts.pending },
          { value: 'approved', label: '已通过', count: data.counts.approved },
          { value: 'rejected', label: '已驳回', count: data.counts.rejected },
          { value: 'all', label: '全部' }
        ]}
      />

      <div style={{ marginTop: 14 }}>
        {data.approvals.map((approval) => {
          const permission = approval.kind === 'REFUND' ? 'order:refund:approve' : 'loss:approve';
          const canDecide = approval.status === 'pending' && can(permission);
          return (
            <article className="approval-card" key={approval.id}>
              <div className="approval-head">
                <div>
                  <h3>
                    <Badge tone={approval.kind === 'REFUND' ? 'accent' : 'warn'}>
                      {approval.kind === 'REFUND' ? '退款审批' : '报损审批'}
                    </Badge>{' '}
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
                  <span className="approval-amount">{money(approval.amountCents)}</span>
                  {approval.status === 'pending' ? (
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
          <EmptyState icon="check" title="没有待处理的申请" description="新的退款或超限报损会自动出现在这里。" />
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
      <p className="page-foot-note">审批权限由角色控制：退款需「审批退款」，报损需「审批超限报损」，且门店范围必须覆盖申请门店。</p>
    </>
  );
}

/* ------------------------------- losses ------------------------------- */

function LossesPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const [range, setRange] = useState<RangeState>(() => makeRange('30'));
  const [status, setStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
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
          <RangeBar value={range} onChange={setRange}>
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

function ProductsPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminProducts(), []);
  const [search, setSearch] = useState('');
  const [series, setSeries] = useState<'all' | Series>('all');
  const [kind, setKind] = useState<'all' | 'tea' | 'retail' | 'bottle'>('all');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

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
        description="全部门店共用统一商品与配方。门店仅可调整本店库存与售罄状态，售价与上下架由总部管理。"
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
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="cell-main">
                        <span className={`product-thumb series-${SERIES[product.series]?.className || 'retail'}`} style={{ width: 30, height: 38, fontSize: 13 }}>
                          {SERIES[product.series]?.char || '零'}
                        </span>
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
    spec: '',
    tag: '',
    unit: '杯'
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setError(null);
    if (editing === 'new') {
      setForm({
        name: '',
        nameEn: '',
        categoryId: categories.find((item) => item.kind === 'fresh')?.id || categories[0]?.id || '',
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
        spec: '',
        tag: '',
        unit: '杯'
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
      spec: editing.spec,
      tag: editing.tag,
      unit: editing.unit
    });
  }, [editing]);

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
        spec: form.spec,
        tag: form.tag,
        unit: form.unit
      };
      if (canPrice && (isNew || product)) {
        body.priceCents = Math.round(Number(form.price) * 100);
        body.costCents = Math.round(Number(form.cost) * 100);
      }
      if (isNew) {
        await api.adminCreateProduct(body);
      } else if (product) {
        await api.adminUpdateProduct(product.id, body);
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
      <div className="form-grid">
        <Field label="商品名称">
          <input value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field label="英文名称">
          <input value={form.nameEn} maxLength={80} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
        </Field>
        <Field label="分类">
          <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} · {category.kind}
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
        <Field label="描述" className="span-2">
          <textarea value={form.desc} rows={3} maxLength={2000} onChange={(event) => setForm({ ...form, desc: event.target.value })} />
        </Field>
        <Field label="规格">
          <input value={form.spec} maxLength={300} onChange={(event) => setForm({ ...form, spec: event.target.value })} />
        </Field>
        <Field label="标签">
          <input value={form.tag} maxLength={100} onChange={(event) => setForm({ ...form, tag: event.target.value })} />
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
  const [form, setForm] = useState({ id: '', name: '', nameEn: '', kind: 'fresh' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open]);

  const reset = () => {
    setForm({ id: '', name: '', nameEn: '', kind: 'fresh' });
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
      description="分类决定商品出现在鲜酿、零售或瓶装分组中。现有分类可修改名称，不删除以保留历史商品。"
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
              <option value="fresh">鲜酿</option>
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
                  <td>{category.kind === 'fresh' ? '鲜酿' : category.kind === 'bottle' ? '瓶装' : '零售'}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setForm({ id: category.id, name: category.name, nameEn: category.nameEn, kind: category.kind })}
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

/* ------------------------------- stores ------------------------------- */

function StoresPage() {
  const { can } = useStaffAuth();
  const notify = useToast();
  const query = useApi(() => api.adminStores(), []);

  if (query.loading && !query.data) return <Spinner label="正在读取门店" />;
  if (query.error && !query.data) return <InlineError message={query.error} />;
  const data = query.data;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 门店"
        title="门店配置"
        description="统一管理营业状态、渠道、取餐位置与设备状态。门店只可调整本店库存与售罄，不修改总部配置。"
        meta={<span>{data.stores.length} 家门店</span>}
      />
      {data.stores.map((store) => (
        <StoreCard
          key={store.id}
          store={store}
          editable={can('store:config:edit')}
          onSaved={() => {
            notify('门店配置已更新', 'ok');
            query.reload({ silent: true });
          }}
        />
      ))}
    </>
  );
}

function StoreCard({ store, editable, onSaved }: { store: Store; editable: boolean; onSaved: () => void }) {
  const notify = useToast();
  const [draft, setDraft] = useState({
    open: store.open,
    retailPickup: store.retailPickup,
    printerStatus: store.printerStatus,
    hours: store.hours,
    waitMinutes: String(store.waitMinutes),
    positions: store.positions.join('、'),
    mini: !!store.channels.mini,
    meituan: !!store.channels.meituan,
    taobao: !!store.channels.taobao
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.adminUpdateStore(store.id, {
        open: draft.open,
        retailPickup: draft.retailPickup,
        printerStatus: draft.printerStatus,
        hours: draft.hours,
        waitMinutes: Number(draft.waitMinutes),
        positions: draft.positions
          .split(/[、,，\s]+/)
          .map((item) => item.trim())
          .filter(Boolean),
        channels: { mini: draft.mini, meituan: draft.meituan, taobao: draft.taobao }
      });
      onSaved();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '保存失败', 'danger');
    } finally {
      setBusy(false);
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
          <Badge tone={store.open ? 'ok' : 'danger'}>{store.open ? '营业中' : '暂停营业'}</Badge>
          {store.retailPickup ? <Badge tone="accent">支持零售提货</Badge> : null}
          <Badge tone={store.printerStatus === 'online' ? 'ok' : 'warn'}>标签机 {store.printerStatus === 'online' ? '在线' : '离线'}</Badge>
        </div>
      </div>

      <div className="form-grid" style={{ marginTop: 12 }}>
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
        <Field label="营业时间">
          <input value={draft.hours} maxLength={40} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} />
        </Field>
        <Field label="预计等待（分钟）">
          <input
            type="number"
            min={0}
            max={180}
            value={draft.waitMinutes}
            onChange={(event) => setDraft({ ...draft, waitMinutes: event.target.value })}
          />
        </Field>
        <Field label="取餐位置" hint="用顿号或逗号分隔，例如：吧台、窗边、长桌。">
          <input value={draft.positions} onChange={(event) => setDraft({ ...draft, positions: event.target.value })} />
        </Field>
        <div className="span-2">
          <div className="cust-sheet-label">下单渠道</div>
          <div className="row-gap">
            <label className="check-line">
              <input type="checkbox" checked={draft.mini} onChange={(event) => setDraft({ ...draft, mini: event.target.checked })} />
              小程序
            </label>
            <label className="check-line">
              <input type="checkbox" checked={draft.meituan} onChange={(event) => setDraft({ ...draft, meituan: event.target.checked })} />
              美团外卖
            </label>
            <label className="check-line">
              <input type="checkbox" checked={draft.taobao} onChange={(event) => setDraft({ ...draft, taobao: event.target.checked })} />
              淘宝闪购
            </label>
          </div>
        </div>
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
    </div>
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
        新建账号使用 6–20 位数字手机号作为登录名，初始密码至少 8 位。演示密码统一为 teahour2026。账号停用后无法登录，但历史操作记录保留。
      </p>
    </>
  );
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

  useEffect(() => {
    if (!editing) return;
    setError(null);
    setBusy(false);
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

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        roleIds,
        allStores,
        storeIds: allStores ? [] : storeIds,
        active
      };
      if (isNew) {
        body.username = username;
        body.password = password;
        await api.adminCreateStaff(body);
      } else if (member) {
        if (password) body.password = password;
        await api.adminUpdateStaff(member.id, body);
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
      title={isNew ? '新建账号' : `编辑账号 · ${member?.name || ''}`}
      subtitle="权限来自角色，门店范围决定可操作与可查看的数据"
      width="lg"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={save}>
            {busy ? '保存中…' : '保存账号'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="姓名">
          <input value={name} maxLength={30} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="登录账号" hint={isNew ? '6–20 位数字手机号' : '登录名创建后不可修改'}>
          <input
            value={username}
            maxLength={20}
            disabled={!isNew}
            onChange={(event) => setUsername(event.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label={isNew ? '初始密码' : '重置密码'} hint="至少 8 位；编辑时留空表示不修改。">
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

  return (
    <>
      <PageHead
        eyebrow="品牌总部 · 组织"
        title="角色权限"
        description="角色决定可访问的页面与可执行的操作；内置角色不可修改，可克隆后调整。"
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
                {role.perms.includes('*')
                  ? '全部权限'
                  : `${role.perms.length} 项权限 · ${role.users || 0} 个账号使用`}
              </div>
            </div>
            <div className="row-gap">
              {can('rbac:edit') ? (
                role.builtin ? (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => cloneRole(role)}>
                    克隆
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditing(role)}>
                    编辑
                  </button>
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
        自定义角色不能授予自己未拥有的权限；超级管理员角色使用通配符，仅系统内置。门店范围与角色相互独立，账号必须同时拥有角色与门店授权。
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

function LogsPage() {
  const [range, setRange] = useState<RangeState>(() => makeRange('7'));
  const [type, setType] = useState('all');
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
          <RangeBar value={range} onChange={setRange}>
            <select value={type} onChange={(event) => setType(event.target.value)} aria-label="日志类型">
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
