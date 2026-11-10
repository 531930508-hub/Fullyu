import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useApi, useNow, useStoredState } from '../lib/hooks';
import { useStaffAuth } from '../lib/auth';
import { StaffShell, type NavItem } from '../components/StaffShell';
import { Icon } from '../components/Icons';
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
  CHANNEL_LABEL,
  ORDER_TYPE_LABEL,
  SERIES,
  dateTimeText,
  money,
  minutesAgo,
  timeText
} from '../lib/format';
import type { Loss, Order, Product, StockItem, Store } from '../lib/types';

type Section = 'workbench' | 'assisted' | 'retail' | 'orders' | 'inventory' | 'losses' | 'devices' | 'logs';

const SECTION_TITLE: Record<Section, string> = {
  workbench: '营业台',
  assisted: '帮客人点单',
  retail: '零售提取',
  orders: '订单记录',
  inventory: '本店在售',
  losses: '报损登记',
  devices: '本店设备',
  logs: '操作记录'
};

const NAV: Array<NavItem & { perm: string }> = [
  { key: 'workbench', label: '营业台', icon: 'grid', perm: 'pos:use', group: '日常营业' },
  { key: 'assisted', label: '帮客人点单', icon: 'plus', perm: 'pos:use', group: '日常营业' },
  { key: 'retail', label: '零售提取', icon: 'bag', perm: 'retail:handover', group: '日常营业' },
  { key: 'orders', label: '订单记录', icon: 'receipt', perm: 'order:view', group: '日常营业' },
  { key: 'inventory', label: '本店在售', icon: 'tray', perm: 'store:stock', group: '门店现场' },
  { key: 'losses', label: '报损登记', icon: 'alert', perm: 'loss:report', group: '门店现场' },
  { key: 'devices', label: '本店设备', icon: 'printer', perm: 'store:device', group: '门店现场' },
  { key: 'logs', label: '操作记录', icon: 'list', perm: 'log:view', group: '门店现场' }
];

export function StoreApp() {
  const { staff, can } = useStaffAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const storesQ = useApi(() => api.customerStores(), []);
  const allStores = storesQ.data?.stores || [];
  const visibleStores = allStores.filter((store) => staff?.allStores || staff?.storeIds.includes(store.id));
  const [storedStore, setStoredStore] = useStoredState<string>('teahour.store', '');
  const store = visibleStores.find((item) => item.id === storedStore) || visibleStores[0];

  useEffect(() => {
    if (store && store.id !== storedStore) setStoredStore(store.id);
  }, [store?.id, storedStore, setStoredStore]);

  const segment = (location.pathname.replace(/^\/store\/?/, '').split('/')[0] || 'workbench') as Section;
  const nav = NAV.filter((item) => can(item.perm));
  const allowed = nav.some((item) => item.key === segment);
  const section = allowed ? segment : nav[0]?.key as Section | undefined;

  const [orderId, setOrderId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((value) => value + 1);

  if (!staff) return null;
  if (storesQ.loading) return <Spinner label="正在读取门店" />;
  if (!store) {
    return (
      <div className="console-content">
        <EmptyState icon="store" title="没有可访问的门店" description="当前账号未绑定任何门店。请联系总部管理员在「账号与角色」中配置门店范围。" />
      </div>
    );
  }

  const handleNavigate = (key: string) => {
    navigate(`/store/${key}`);
  };

  return (
    <StaffShell
      surface="store"
      nav={nav}
      active={section || 'workbench'}
      onNavigate={handleNavigate}
      topbarTitle={
        <>
          <strong>{section ? SECTION_TITLE[section] : '营业台'}</strong> · {store.name}
        </>
      }
      actions={
        <label className="store-select">
          <span className="visually-hidden">切换门店</span>
          <select
            value={store.id}
            onChange={(event) => setStoredStore(event.target.value)}
            aria-label="切换门店"
          >
            {visibleStores.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {!allowed && nav.length === 0 ? (
        <EmptyState icon="user" title="暂无可用的门店页面" description="当前账号没有任何门店操作权限，请联系管理员。" />
      ) : null}
      {allowed && section === 'workbench' ? (
        <Workbench store={store} can={can} version={version} onOpenOrder={setOrderId} onNavigate={handleNavigate} />
      ) : null}
      {allowed && section === 'assisted' ? (
        <AssistedOrder store={store} can={can} onCompleted={refresh} />
      ) : null}
      {allowed && section === 'retail' ? (
        <RetailSection store={store} onOpenOrder={setOrderId} onChanged={refresh} />
      ) : null}
      {allowed && section === 'orders' ? (
        <OrdersSection store={store} can={can} version={version} onOpenOrder={setOrderId} />
      ) : null}
      {allowed && section === 'inventory' ? <InventorySection store={store} /> : null}
      {allowed && section === 'losses' ? <LossesSection store={store} /> : null}
      {allowed && section === 'devices' ? <DevicesSection store={store} /> : null}
      {allowed && section === 'logs' ? <LogsSection store={store} /> : null}

      <OrderDrawer
        orderId={orderId}
        onClose={() => setOrderId(null)}
        can={can}
        onChanged={() => {
          refresh();
        }}
      />
    </StaffShell>
  );
}

/* ------------------------------ workbench ------------------------------ */

function Workbench({
  store,
  can,
  version,
  onOpenOrder,
  onNavigate
}: {
  store: Store;
  can: (permission: string) => boolean;
  version: number;
  onOpenOrder: (id: string) => void;
  onNavigate: (key: string) => void;
}) {
  const notify = useToast();
  const confirm = useConfirm();
  const now = useNow(20000);
  const overview = useApi(() => api.storeOverview(store.id), [store.id, version]);
  const [scan, setScan] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNotice, setScanNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [filter, setFilter] = useState<'all' | 'dine' | 'takeaway' | 'delivery'>('all');

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') overview.reload({ silent: true }).catch(() => undefined);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [overview.reload]);

  if (overview.loading && !overview.data) return <Spinner label="正在读取营业台" />;
  if (overview.error && !overview.data) return <InlineError message={overview.error} />;
  const data = overview.data!;
  const queue = data.queue;
  const pendingCups = queue.fresh.reduce(
    (count, order) => count + order.units.filter((unit) => unit.status === 'pending').length,
    0
  );
  const longest = queue.fresh.reduce((max, order) => Math.max(max, minutesAgo(order.createdAt, now)), 0);
  const freshFiltered = queue.fresh.filter((order) => {
    if (filter === 'all') return true;
    if (filter === 'delivery') return order.type === 'delivery' || order.channel === 'meituan' || order.channel === 'taobao';
    return order.type === filter;
  });

  const handleScan = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = scan.trim();
    if (!code) return;
    setScanBusy(true);
    setScanNotice(null);
    try {
      const result = await api.storeScan(code);
      notify(
        `${code} · ${result.order.number} ${result.order.status === 'ready' ? '全部杯贴完成，已进入待取' : '这一杯已出餐'}`
      );
      setScanNotice({ text: `${code} 已出餐 · ${result.order.number}` });
      setScan('');
      await overview.reload({ silent: true });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '扫码失败，请重试';
      setScanNotice({ text: message, error: true });
    } finally {
      setScanBusy(false);
    }
  };

  const reprint = async (order: Order) => {
    try {
      const result = await api.storeReprint(order.id);
      if (result.ok) notify(`${order.number} 杯贴已重新发送到打印队列`, 'ok');
      else notify(result.error || '补打失败', 'danger');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : '补打失败', 'danger');
    }
  };

  const remake = async (order: Order) => {
    const ok = await confirm({
      title: '创建补做单？',
      message: `将为 ${order.number} 生成一张新的补做单，原料成本会单独计入本店损耗成本，原订单保持不变。`,
      confirmText: '创建补做'
    });
    if (!ok) return;
    try {
      const result = await api.storeRemake(order.id, '门店补做');
      notify(`补做单 ${result.order.number} 已创建`, 'ok');
      overview.reload({ silent: true }).catch(() => undefined);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : '补做失败', 'danger');
    }
  };

  return (
    <>
      {overview.error && overview.data ? (
        <div style={{ marginBottom: 14 }}>
          <InlineError message={`${overview.error}（展示的是最近一次成功读取的数据）`} />
        </div>
      ) : null}
      <PageHead
        title="营业台"
        description="逐杯扫码出餐，全部完成后自动变为可交付。扫码与输入杯号两种方式都会直接更新这一杯的状态。"
        meta={
          <span className="workbench-status">
            <span className="pill pill-ok"><i />接单中</span>
            <span>{store.hours}</span>
            <span>·</span>
            <span>{store.waitMinutes} 分钟预计等待</span>
            <span>·</span>
            <span>设备与支付为本地模拟</span>
            <span className="right">{dateTimeText(Date.now())}</span>
          </span>
        }
        actions={
          <>
            {can('approval:view') ? (
              <Link className="btn btn-outline btn-sm" to="/admin/approvals">
                <Icon name="check" size={14} /> 审批中心
              </Link>
            ) : null}
            <button type="button" className="btn btn-sm btn-outline" onClick={() => overview.reload()}>
              <Icon name="refresh" size={14} /> 刷新
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onNavigate('assisted')}>
              <Icon name="plus" size={14} /> 帮客人点单
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <Stat
          tone="dark"
          label="待制作"
          value={`${pendingCups} 杯`}
          hint={`${queue.counts.pending} 笔订单 · 每杯扫码后独立完成`}
        />
        <Stat label="待取餐" value={`${queue.counts.ready} 单`} hint="全部杯贴完成，等待顾客取餐" />
        <Stat label="最长等待" value={`${longest} 分钟`} hint="按订单创建时间计算，不承诺倒计时" />
        <Stat
          label="今日净收"
          value={money(data.finance.netCents)}
          hint={`${data.finance.saleCount} 笔收款 · 退款 ${money(data.finance.refundsCents)}`}
        />
      </div>

      <form className={`scan-banner ${scanNotice?.error ? 'error' : ''}`} onSubmit={handleScan}>
        <Icon name={scanNotice?.error ? 'alert' : 'scan'} size={18} />
        <span className="grow">
          {scanNotice
            ? scanNotice.text
            : '扫描杯贴或输入杯号后回车 — 自动更新这一杯，无需再点按钮'}
        </span>
        <input
          className=""
          style={{
            maxWidth: 190,
            minHeight: 34,
            padding: '5px 10px',
            fontFamily: 'var(--mono)',
            textTransform: 'uppercase',
            background: '#fff'
          }}
          value={scan}
          onChange={(event) => setScan(event.target.value.toUpperCase())}
          placeholder="例如 A001-1"
          aria-label="杯贴编号"
          disabled={scanBusy}
        />
        <button type="submit" className="btn btn-sm btn-primary" disabled={scanBusy || !scan.trim()}>
          {scanBusy ? '处理中' : '确认出餐'}
        </button>
      </form>

      <div className="queue-layout">
        <div>
          <div className="flex between wrap" style={{ marginBottom: 12 }}>
            <div className="flex" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 16 }}>待出餐</h2>
              <Badge tone="accent">{queue.fresh.length}</Badge>
              <span className="tiny muted">按订单时间从早到晚</span>
            </div>
            <Tabs
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '全部', count: queue.fresh.length },
                { value: 'dine', label: '堂食' },
                { value: 'takeaway', label: '现场外带' },
                { value: 'delivery', label: '平台外卖' }
              ]}
            />
          </div>

          {!queue.fresh.length ? (
            <Panel>
              <EmptyState icon="cup" title="当前没有待出餐订单" description="顾客下单或伙伴代点后，订单会实时出现在这里。" />
            </Panel>
          ) : !freshFiltered.length ? (
            <Panel>
              <EmptyState icon="filter" title="这个筛选下没有订单" description="切换到「全部」查看其他订单。" />
            </Panel>
          ) : (
            <div className="queue-grid">
              {freshFiltered.map((order) => (
                <article className="queue-card" key={order.id}>
                  <div className="queue-card-head">
                    <div>
                      <div className="queue-no">{order.number}</div>
                      <div className="queue-meta">
                        <Badge tone={order.channel === 'mini' ? 'neutral' : order.channel === 'assisted' ? 'accent' : 'warn'}>
                          {CHANNEL_LABEL[order.channel]}
                        </Badge>
                        <span>{ORDER_TYPE_LABEL[order.type]}{order.seat ? ` · ${order.seat}` : ''}</span>
                      </div>
                    </div>
                    <div className="tiny muted" style={{ textAlign: 'right' }}>
                      <div>等待 {minutesAgo(order.createdAt, now)} 分钟</div>
                      <div>{order.cupScanned}/{order.cupTotal} 杯</div>
                    </div>
                  </div>
                  <div className="queue-cups">
                    {order.units.map((unit) => {
                      const item = order.items.find((line) => line.id === unit.itemId);
                      return (
                        <div className={`cup-row ${unit.status === 'scanned' ? 'done' : ''}`} key={unit.id}>
                          <span className="cup-label">{unit.label}</span>
                          <span className="cup-name">{item?.name || '—'}</span>
                          <span className="cup-state">
                            {unit.status === 'scanned' ? <><Icon name="check" size={12} /> 已出餐</> : <><Icon name="scan" size={12} /> 等待扫码</>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="queue-note">
                    <Icon name="info" size={12} /> 扫码后不可整单跳过；整单最后一份杯贴完成后自动进入待取。
                  </div>
                  <div className="queue-foot">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => reprint(order)}>
                      <Icon name="printer" size={13} /> 补打杯贴
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => remake(order)}>
                      <Icon name="refresh" size={13} /> 补做
                    </button>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => onOpenOrder(order.id)}>
                      查看 / 处理 <Icon name="arrowRight" size={13} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="stack">
          <Panel
            title="零售待交付"
            description="输入 4 位提货码即可校验并交付，任意门店通用。"
            actions={
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onNavigate('retail')}>
                去办理 <Icon name="arrowRight" size={13} />
              </button>
            }
          >
            {!queue.retail.length ? (
              <p className="tiny muted" style={{ padding: '10px 0' }}>暂无待提货的零售订单。</p>
            ) : (
              queue.retail.slice(0, 6).map((order) => (
                <button
                  type="button"
                  key={order.id}
                  className="recent-item"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => onOpenOrder(order.id)}
                >
                  <span className="r-head">
                    <span className="r-no">{order.number}</span>
                    <span className="tiny muted">等待 {minutesAgo(order.createdAt, now)} 分钟</span>
                  </span>
                  <small>
                    {order.items.map((item) => `${item.name} ×${item.qty}`).join(' · ')}
                  </small>
                  <span className="tiny" style={{ color: 'var(--wood)' }}>查看订单</span>
                </button>
              ))
            )}
          </Panel>

          <Panel title="今日门店" description="仅统计当前门店的台账与费用。">
            <div className="kv"><span>收款笔数</span><strong>{data.finance.saleCount} 笔</strong></div>
            <div className="kv"><span>净收入</span><strong>{money(data.finance.netCents)}</strong></div>
            <div className="kv"><span>退款</span><strong>{money(data.finance.refundsCents)}</strong></div>
            <div className="kv"><span>今日运营费用</span><strong>{money(data.opexCents)}</strong></div>
            <div className="kv"><span>待审批</span><strong>{data.approvals.pending} 项</strong></div>
            {can('order:view') ? (
              <button type="button" className="btn btn-sm btn-outline btn-block" style={{ marginTop: 10 }} onClick={() => onNavigate('orders')}>
                查看订单记录
              </button>
            ) : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}

/* ------------------------------ assisted order ------------------------------ */

type CartLine = { productId: string; qty: number; temp: string | null; ice: string | null };

function AssistedOrder({ store, can, onCompleted }: { store: Store; can: (permission: string) => boolean; onCompleted: () => void }) {
  const notify = useToast();
  const menu = useApi(() => api.bootstrap(store.id), [store.id]);
  const [series, setSeries] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<'dine' | 'takeaway'>('dine');
  const [seat, setSeat] = useState('');
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState<'wechat' | 'alipay' | 'cash'>('wechat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ order: Order; printError?: string } | null>(null);

  const products = (menu.data?.products || []).filter((product) => product.kind === 'tea');
  const filtered = products.filter((product) => {
    if (series !== 'all' && product.series !== series) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return `${product.name}${product.nameEn}${product.tag}${product.desc}`.toLowerCase().includes(needle);
  });
  const total = cart.reduce((sum, line) => {
    const product = products.find((item) => item.id === line.productId);
    return sum + (product?.priceCents || 0) * line.qty;
  }, 0);

  const add = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, qty: Math.min(20, line.qty + 1) } : line
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          qty: 1,
          temp: product.temps[0] || '热',
          ice: product.ice ? '标准冰' : null
        }
      ];
    });
  };

  const updateLine = (productId: string, patch: Partial<CartLine>) => {
    setCart((current) => current.map((line) => (line.productId === productId ? { ...line, ...patch } : line)));
  };

  const submit = async () => {
    if (!cart.length) return;
    if (orderType === 'dine' && !seat) {
      setError('堂食请选择桌位或吧台位置');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.storeCreateOrder({
        storeId: store.id,
        business: 'fresh',
        type: orderType,
        seat: orderType === 'dine' ? seat : null,
        items: cart.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          temp: line.temp,
          ice: line.ice
        })),
        note,
        paymentMethod: payment
      });
      setSuccess(result);
      setCart([]);
      setNote('');
      onCompleted();
      notify(`${result.order.number} 已下单，杯贴已进入打印队列`, 'ok');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '下单失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  if (menu.loading && !menu.data) return <Spinner label="正在读取菜单" />;
  if (menu.error) return <InlineError message={menu.error} />;

  return (
    <>
      <PageHead
        eyebrow="Assisted order"
        title="帮客人点单"
        description="由伙伴在吧台代客下单并收款。支付为本地模拟，成功后直接进入营业台，杯贴按杯生成。"
        actions={<Badge tone="accent">{store.name}</Badge>}
      />
      {success ? (
        <Modal
          open
          title="点单成功"
          description="订单已支付并进入营业台，杯贴已按杯生成。"
          onClose={() => setSuccess(null)}
          footer={<button type="button" className="btn btn-primary" onClick={() => setSuccess(null)}>继续点单</button>}
        >
          <div className="stack">
            <div className="flex between">
              <span className="muted">订单号</span>
              <strong className="mono" style={{ fontSize: 18 }}>{success.order.number}</strong>
            </div>
            <div className="flex between">
              <span className="muted">金额</span>
              <strong>{money(success.order.totalCents)}</strong>
            </div>
            <div className="flex between">
              <span className="muted">杯数</span>
              <strong>{success.order.cupTotal} 杯</strong>
            </div>
            {success.printError ? <InlineError message={`杯贴打印未完成：${success.printError}。可在订单详情中补打。`} /> : null}
            <div className="notice">
              <Icon name="info" size={15} />
              <span>请将杯贴贴到对应杯子。营业台扫码后会逐杯完成，整单完成后自动进入待取。</span>
            </div>
          </div>
        </Modal>
      ) : null}

      <div className="assisted-layout">
        <div className="stack">
          <Panel
            title="菜单"
            description="仅显示上架且本店可售的鲜酿酒单。"
            actions={
              <div className="toolbar">
                <div className="search">
                  <Icon name="search" size={15} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索商品" aria-label="搜索商品" />
                </div>
              </div>
            }
          >
            <div className="tabs" style={{ marginBottom: 12 }}>
              <button type="button" className={series === 'all' ? 'active' : ''} onClick={() => setSeries('all')}>全部</button>
              {(['xing', 'song', 'qing', 'mian'] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  className={series === item ? 'active' : ''}
                  onClick={() => setSeries(item)}
                >
                  {SERIES[item].char} {SERIES[item].nameEn}
                </button>
              ))}
            </div>
            {!filtered.length ? (
              <EmptyState icon="cup" title="没有匹配的商品" description="尝试切换系列或更换关键词。" />
            ) : (
              <div className="assisted-menu">
                {filtered.map((product) => (
                  <button
                    type="button"
                    className="assisted-item"
                    key={product.id}
                    onClick={() => add(product)}
                    disabled={!product.available}
                  >
                    <span className={`product-thumb series-${product.series}`}>{SERIES[product.series].char}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="n">{product.name}</span>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {product.available ? `${product.doseGrams}g · ${product.temps?.[0] || '现制'}` : '本店售罄'}
                      </span>
                      <span className="tiny faint" style={{ display: 'block' }}>{product.tag}</span>
                    </span>
                    <span className="p">{money(product.priceCents)}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <aside className="cart-panel">
          <div className="flex between">
            <h2 style={{ fontSize: 15 }}>本单</h2>
            <Badge tone="neutral">{cart.reduce((n, line) => n + line.qty, 0)} 杯</Badge>
          </div>
          <div style={{ marginTop: 10 }}>
            {!cart.length ? (
              <p className="tiny muted" style={{ padding: '20px 0', textAlign: 'center' }}>还没有选择商品。点击左侧菜单加入本单。</p>
            ) : (
              cart.map((line) => {
                const product = products.find((item) => item.id === line.productId);
                if (!product) return null;
                return (
                  <div className="assisted-line" key={line.productId}>
                    <div className="grow">
                      <strong>{product.name}</strong>
                      <small>{money(product.priceCents)} / 杯</small>
                      <div className="option-row">
                        {(product.temps.length ? product.temps : ['热']).map((temp) => (
                          <button
                            type="button"
                            key={temp}
                            className={`option-chip ${line.temp === temp ? 'active' : ''}`}
                            onClick={() => updateLine(line.productId, { temp })}
                          >
                            {temp}
                          </button>
                        ))}
                        {product.ice
                          ? ['标准冰', '少冰', '去冰'].map((ice) => (
                              <button
                                type="button"
                                key={ice}
                                className={`option-chip ${line.ice === ice ? 'active' : ''}`}
                                onClick={() => updateLine(line.productId, { ice })}
                              >
                                {ice}
                              </button>
                            ))
                          : null}
                      </div>
                    </div>
                    <div className="qty">
                      <button type="button" aria-label="减少" onClick={() => setCart((current) => current.map((x) => x.productId === line.productId ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}>
                        <Icon name="minus" size={13} />
                      </button>
                      <span>{line.qty}</span>
                      <button type="button" aria-label="增加" onClick={() => updateLine(line.productId, { qty: Math.min(20, line.qty + 1) })}>
                        <Icon name="plus" size={13} />
                      </button>
                    </div>
                    <button type="button" className="icon-btn" aria-label="移除" onClick={() => setCart((current) => current.filter((x) => x.productId !== line.productId))}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="stack" style={{ marginTop: 14 }}>
            <Segmented
              value={orderType}
              onChange={(next) => {
                setOrderType(next);
                if (next === 'takeaway') setSeat('');
              }}
              options={[
                { value: 'dine', label: '堂食' },
                { value: 'takeaway', label: '外带' }
              ]}
              ariaLabel="用餐方式"
            />
            {orderType === 'dine' ? (
              <Field label="桌位 / 吧台">
                <select value={seat} onChange={(event) => setSeat(event.target.value)} required>
                  <option value="">请选择位置</option>
                  {store.positions.map((position) => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="支付方式" hint="本地模拟收款，不接入真实支付。">
              <select value={payment} onChange={(event) => setPayment(event.target.value as typeof payment)}>
                <option value="wechat">微信支付</option>
                <option value="alipay">支付宝</option>
                <option value="cash">现金</option>
              </select>
            </Field>
            <Field label="备注">
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="如：少甜、分杯装" maxLength={200} />
            </Field>
            {error ? <InlineError message={error} /> : null}
          </div>

          <div className="pay-total">
            <span className="muted">应收合计</span>
            <strong>{money(total)}</strong>
          </div>
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!cart.length || busy} onClick={submit}>
            {busy ? '正在下单…' : <>确认收款并下单 <Icon name="arrowRight" size={16} /></>}
          </button>
          <p className="tiny faint" style={{ marginTop: 8, textAlign: 'center' }}>会员折扣不适用于伙伴代点，按门店标准价收款。</p>
        </aside>
      </div>
    </>
  );
}

/* ------------------------------ retail ------------------------------ */

function RetailSection({
  store,
  onOpenOrder,
  onChanged
}: {
  store: Store;
  onOpenOrder: (id: string) => void;
  onChanged: () => void;
}) {
  const notify = useToast();
  const awaiting = useApi(
    () => api.storeOrders({ storeId: store.id, business: 'retail', status: 'awaiting', limit: 50 }),
    [store.id]
  );
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delivered, setDelivered] = useState<Order | null>(null);

  useEffect(() => {
    setLookup(null);
    setError(null);
    if (code.length !== 4) return;
    let cancelled = false;
    setBusy(true);
    api
      .storeRetailLookup(code)
      .then((result) => {
        if (!cancelled) setLookup(result.order);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : '未能找到提货码');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const deliver = async () => {
    if (!lookup) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.storeDeliver(lookup.id, store.id, code);
      setDelivered(result.order);
      setLookup(null);
      setCode('');
      notify(`${result.order.number} 已完成交付`, 'ok');
      onChanged();
      awaiting.reload({ silent: true }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '交付失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Retail handover"
        title="零售提取"
        description="零售订单在任意门店通用。输入 4 位提货码即完成核验，确认交付后扣减本店零售库存。"
        actions={<Badge tone="neutral">{awaiting.data?.orders.length || 0} 笔待提货</Badge>}
      />

      <div className="retail-lookup">
        <Panel title="核验提货码" description="提货码为 4 位数字。输入完成后自动校验，不需要再点查询。">
          <form
            className="code-input-wrap"
            onSubmit={(event) => {
              event.preventDefault();
              if (lookup) void deliver();
            }}
          >
            <span className="eyebrow">Pickup code</span>
            <input
              className="code-input"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••"
              aria-label="四位提货码"
              autoFocus
            />
            <div className="tiny muted">在本店交付时，请当面确认商品数量后再确认。</div>
            {busy ? <Spinner label="正在校验" /> : null}
            {error ? <InlineError message={error} /> : null}
            {lookup ? (
              <div className="delivery-card" style={{ width: '100%' }}>
                <div className="flex between" style={{ marginBottom: 8 }}>
                  <span className="mono strong">{lookup.number}</span>
                  <StatusPill status={lookup.status} />
                </div>
                {lookup.items.map((item) => (
                  <div className="delivery-item" key={item.id}>
                    <span>{item.name}</span>
                    <span className="muted">×{item.qty}</span>
                  </div>
                ))}
                <div className="delivery-item">
                  <span>实付</span>
                  <strong>{money(lookup.totalCents)}</strong>
                </div>
                <button type="button" className="btn btn-primary btn-block btn-lg" style={{ marginTop: 12 }} onClick={deliver} disabled={busy}>
                  确认已交付 <Icon name="check" size={16} />
                </button>
              </div>
            ) : null}
            {delivered ? (
              <div className="delivery-card" style={{ width: '100%', borderColor: '#cfdcc8', background: '#f4f8f0' }}>
                <div className="flex" style={{ gap: 8, color: 'var(--success)' }}>
                  <Icon name="check" size={18} />
                  <strong>{delivered.number} 已交付</strong>
                </div>
                <p className="tiny muted" style={{ marginTop: 4 }}>
                  交付门店：{store.name} · {timeText(delivered.deliveredAt)}。库存已按本店零售商品扣减。
                </p>
                <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => setDelivered(null)}>
                  继续核验下一单
                </button>
              </div>
            ) : null}
          </form>
        </Panel>

        <Panel
          title="待提货订单"
          description="零售订单不指定提货门店，哪家店都可以核验交付。"
          actions={
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => awaiting.reload()}>
              <Icon name="refresh" size={13} /> 刷新
            </button>
          }
        >
          {awaiting.loading && !awaiting.data ? (
            <Spinner label="正在读取" />
          ) : awaiting.error ? (
            <div style={{ padding: 20 }}><InlineError message={awaiting.error} /></div>
          ) : !awaiting.data?.orders.length ? (
            <EmptyState icon="bag" title="暂无待提货订单" description="顾客在小程序「带回家」下单后会出现在这里。" />
          ) : (
            awaiting.data.orders.map((order) => (
              <button
                type="button"
                className="recent-item"
                key={order.id}
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => onOpenOrder(order.id)}
              >
                <span className="r-head">
                  <span className="r-no">{order.number}</span>
                  <span className="tiny muted">{minutesAgo(order.createdAt)} 分钟前</span>
                </span>
                <small>{order.items.map((item) => `${item.name} ×${item.qty}`).join(' · ')}</small>
                <span className="tiny muted">{money(order.totalCents)} · 提货码已隐藏</span>
              </button>
            ))
          )}
        </Panel>
      </div>
    </>
  );
}

/* ------------------------------ orders ------------------------------ */

function OrdersSection({
  store,
  can,
  version,
  onOpenOrder
}: {
  store: Store;
  can: (permission: string) => boolean;
  version: number;
  onOpenOrder: (id: string) => void;
}) {
  const [status, setStatus] = useState('all');
  const [business, setBusiness] = useState('all');
  const [q, setQ] = useState('');
  const orders = useApi(
    () => api.storeOrders({ storeId: store.id, status, business, q, limit: 200 }),
    [store.id, status, business, q, version]
  );

  return (
    <>
      <PageHead
        eyebrow="Orders"
        title="订单记录"
        description="查看本店订单、逐杯状态与操作记录。退款超过限额会自动进入总部审批。"
        actions={<Badge tone="neutral">{orders.data?.orders.length || 0} 笔</Badge>}
      />
      <Panel
        flush
        title="订单列表"
        actions={
          <div className="toolbar">
            <div className="search">
              <Icon name="search" size={15} />
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="订单号 / 提货码 / 桌位" aria-label="搜索订单" />
            </div>
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="订单状态">
              <option value="all">全部状态</option>
              <option value="pending">制作中</option>
              <option value="ready">待取餐</option>
              <option value="awaiting">待提货</option>
              <option value="delivered">已交付</option>
              <option value="refunded">已退款</option>
              <option value="cancelled">已取消</option>
            </select>
            <select value={business} onChange={(event) => setBusiness(event.target.value)} aria-label="订单类型">
              <option value="all">鲜酿 + 零售</option>
              <option value="fresh">纯茶鲜酿</option>
              <option value="retail">零售</option>
            </select>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => orders.reload()}>
              <Icon name="refresh" size={13} />
            </button>
          </div>
        }
      >
        {orders.loading && !orders.data ? (
          <Spinner label="正在读取订单" />
        ) : orders.error ? (
          <div style={{ padding: 20 }}><InlineError message={orders.error} /></div>
        ) : !orders.data?.orders.length ? (
          <EmptyState icon="receipt" title="没有匹配的订单" description="调整筛选条件，或等待顾客下单。" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>订单</th>
                  <th>类型 / 渠道</th>
                  <th>内容</th>
                  <th className="num">金额</th>
                  <th>状态</th>
                  <th>时间</th>
                  <th className="actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <span className="mono strong">{order.number}</span>
                      {order.refundPending ? <span className="sub-cell">退款审批中</span> : null}
                    </td>
                    <td>
                      {order.business === 'retail' ? '零售' : ORDER_TYPE_LABEL[order.type]}
                      <span className="sub-cell">{CHANNEL_LABEL[order.channel]}{order.seat ? ` · ${order.seat}` : ''}</span>
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      {order.items.map((item) => `${item.name}×${item.qty}`).join('、')}
                      {order.business === 'fresh' ? <span className="sub-cell">{order.cupScanned}/{order.cupTotal} 杯已出餐</span> : null}
                    </td>
                    <td className="num">{money(order.totalCents)}</td>
                    <td><StatusPill status={order.status} /></td>
                    <td className="tiny muted">{dateTimeText(order.createdAt)}</td>
                    <td className="actions">
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => onOpenOrder(order.id)}>
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------ order drawer ------------------------------ */

function OrderDrawer({
  orderId,
  onClose,
  can,
  onChanged
}: {
  orderId: string | null;
  onClose: () => void;
  can: (permission: string) => boolean;
  onChanged: () => void;
}) {
  const notify = useToast();
  const confirm = useConfirm();
  const detail = useApi(() => (orderId ? api.storeOrder(orderId) : Promise.reject(new Error('no order'))), [orderId]);
  const [refundOpen, setRefundOpen] = useState(false);

  useEffect(() => {
    setRefundOpen(false);
  }, [orderId]);

  if (!orderId) return null;
  const order = detail.data?.order;

  const reprint = async () => {
    if (!order) return;
    try {
      const result = await api.storeReprint(order.id);
      notify(result.ok ? '杯贴已重新发送到打印队列' : result.error || '补打失败', result.ok ? 'ok' : 'danger');
      detail.reload({ silent: true }).catch(() => undefined);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : '补打失败', 'danger');
    }
  };

  const remake = async () => {
    if (!order) return;
    const ok = await confirm({
      title: '创建补做单？',
      message: '补做会生成一张新的订单并扣减原料库存，成本单独计入本店损耗成本。',
      confirmText: '创建补做'
    });
    if (!ok) return;
    try {
      const result = await api.storeRemake(order.id, '门店补做');
      notify(`补做单 ${result.order.number} 已创建`, 'ok');
      onChanged();
      detail.reload({ silent: true }).catch(() => undefined);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : '补做失败', 'danger');
    }
  };

  const canRefund = !!order && (can('order:refund') || can('order:refund:request')) && order.paymentStatus === 'paid' && order.status !== 'refunded';

  return (
    <>
      <Drawer
        open
        title={order ? `${order.number}` : '订单详情'}
        subtitle={order ? `${order.storeName} · ${CHANNEL_LABEL[order.channel]} · ${dateTimeText(order.createdAt)}` : '正在读取'}
        onClose={onClose}
        footer={
          order ? (
            <>
              {order.business === 'fresh' && can('pos:use') ? (
                <>
                  <button type="button" className="btn btn-sm btn-outline" onClick={reprint}>
                    <Icon name="printer" size={14} /> 补打杯贴
                  </button>
                  <button type="button" className="btn btn-sm btn-outline" onClick={remake}>
                    <Icon name="refresh" size={14} /> 补做
                  </button>
                </>
              ) : null}
              {canRefund ? (
                <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => setRefundOpen(true)}>
                  发起退款
                </button>
              ) : null}
              <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>关闭</button>
            </>
          ) : null
        }
      >
        {detail.loading && !order ? <Spinner label="正在读取订单" /> : null}
        {detail.error ? <InlineError message={detail.error} /> : null}
        {order ? (
          <div className="stack">
            <div className="flex between wrap">
              <div className="row-gap">
                <StatusPill status={order.status} />
                <Badge tone="neutral">{ORDER_TYPE_LABEL[order.type]}</Badge>
                {order.seat ? <Badge tone="neutral">{order.seat}</Badge> : null}
                {order.refundPending ? <Badge tone="warn">退款审批中</Badge> : null}
              </div>
              <strong style={{ fontSize: 20 }}>{money(order.totalCents)}</strong>
            </div>

            {order.business === 'retail' && order.pickupCode && order.status === 'awaiting' ? (
              <div className="notice">
                <Icon name="bag" size={15} />
                <span>该零售订单的提货码已隐藏。请让顾客出示或口述 4 位提货码，在「零售提取」中核验。</span>
              </div>
            ) : null}

            <Panel title="商品" flush>
              <div style={{ padding: '0 4px' }}>
                {order.items.map((item) => (
                  <div className="delivery-item" key={item.id}>
                    <span>
                      {item.name}
                      <span className="sub-cell">{item.temp || ''}{item.temp && item.ice ? ' · ' : ''}{item.ice || ''}</span>
                    </span>
                    <span className="muted">×{item.qty} {item.refundedQty ? `（已退 ${item.refundedQty}）` : ''}</span>
                    <strong>{money(item.totalCents)}</strong>
                  </div>
                ))}
              </div>
            </Panel>

            {order.business === 'fresh' ? (
              <Panel title="逐杯状态" description="杯贴扫码后自动更新，无需人工干预。">
                <div className="queue-cups">
                  {order.units.map((unit) => (
                    <div className={`cup-row ${unit.status === 'scanned' ? 'done' : ''}`} key={unit.id}>
                      <span className="cup-label">{unit.label}</span>
                      <span className="cup-name">
                        {order.items.find((item) => item.id === unit.itemId)?.name}
                      </span>
                      <span className="cup-state">
                        {unit.status === 'scanned' ? '已出餐' : unit.status === 'refunded' ? '已退款' : '等待扫码'}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}

            <Panel title="支付与打印">
              <div className="kv"><span>支付状态</span><strong>{order.paymentStatus === 'paid' ? '已支付' : order.paymentStatus}</strong></div>
              <div className="kv"><span>支付方式</span><strong>{order.paymentMethod === 'cash' ? '现金' : order.paymentMethod === 'alipay' ? '支付宝' : order.paymentMethod === 'wechat' ? '微信支付' : order.paymentMethod || '—'}</strong></div>
              <div className="kv"><span>杯贴打印</span><strong><StatusPill status={order.printStatus} /></strong></div>
              <div className="kv"><span>已退款</span><strong>{money(order.refundedCents)}</strong></div>
              {order.note ? <div className="kv"><span>备注</span><strong>{order.note}</strong></div> : null}
            </Panel>

            <Panel title="操作记录">
              {!detail.data?.logs.length ? (
                <p className="tiny muted">暂无记录。</p>
              ) : (
                <div className="log-list">
                  {detail.data.logs.map((log) => (
                    <div className="log-row" key={log.id}>
                      <span className="log-time">{dateTimeText(log.at)}</span>
                      <span className="log-actor">{log.actorName}</span>
                      <span className="log-detail">{log.action} · {log.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ) : null}
      </Drawer>

      {order ? (
        <RefundModal
          open={refundOpen}
          order={order}
          canDirect={can('order:refund')}
          onClose={() => setRefundOpen(false)}
          onDone={() => {
            setRefundOpen(false);
            detail.reload({ silent: true }).catch(() => undefined);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function RefundModal({
  open,
  order,
  canDirect,
  onClose,
  onDone
}: {
  open: boolean;
  order: Order;
  canDirect: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const notify = useToast();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuantities(Object.fromEntries(order.items.map((item) => [item.id, 0])));
      setReason('');
      setError(null);
    }
  }, [open, order.id]);

  const selected = order.items
    .map((item) => ({ item, qty: quantities[item.id] || 0 }))
    .filter((line) => line.qty > 0);
  const amount = selected.reduce((sum, line) => sum + line.item.unitPriceCents * line.qty, 0);
  const prepared = order.status === 'ready' || order.cupScanned > 0;
  const needsApproval = !canDirect || amount >= 5000;

  const fillAll = () => {
    setQuantities(Object.fromEntries(order.items.map((item) => [item.id, item.remainingQty])));
  };

  const submit = async () => {
    if (!selected.length) {
      setError('请选择至少一杯或一件商品');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.storeRefund(order.id, {
        items: selected.map((line) => ({ itemId: line.item.id, qty: line.qty })),
        reason: reason.trim() || '顾客需求'
      });
      if (result.mode === 'pending') {
        notify('退款申请已提交，等待总部审批', 'ok');
      } else {
        notify(`已退款 ${money(result.refundedCents || amount)}`, 'ok');
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '退款失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="发起退款"
      description={`${order.number} · 已实付 ${money(order.totalCents)} · 已退 ${money(order.refundedCents)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-danger" disabled={busy || !selected.length} onClick={submit}>
            {busy ? '正在提交…' : needsApproval ? '提交审批' : `确认退款 ${money(amount)}`}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="flex between">
          <span className="field-label">选择退款商品</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={fillAll}>全部可退</button>
        </div>
        <div>
          {order.items.map((item) => (
            <div className="flex between" key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <div>
                <strong style={{ fontSize: 12.5 }}>{item.name}</strong>
                <span className="sub-cell">可退 {item.remainingQty} · {money(item.unitPriceCents)}/件</span>
              </div>
              <div className="qty">
                <button type="button" aria-label="减少" onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, (current[item.id] || 0) - 1) }))}>
                  <Icon name="minus" size={13} />
                </button>
                <span>{quantities[item.id] || 0}</span>
                <button type="button" aria-label="增加" onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.min(item.remainingQty, (current[item.id] || 0) + 1) }))}>
                  <Icon name="plus" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <Field label="退款原因">
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="如：顾客取消、口味不符" maxLength={120} />
        </Field>
        <div className="notice">
          <Icon name="info" size={15} />
          <span>
            本次退款金额 <strong>{money(amount)}</strong>。{needsApproval
              ? '满 ¥50 或当前账号无直接退款权限，将提交总部审批，审批通过后原路退回。'
              : '未制作且未出餐的杯数会同时退回原料库存；已制作订单保留原料成本。'}
            {prepared ? ' 该订单已有出餐记录，退款不退回原料库存。' : ''}
          </span>
        </div>
        {error ? <InlineError message={error} /> : null}
      </div>
    </Modal>
  );
}

/* ------------------------------ inventory ------------------------------ */

function InventorySection({ store }: { store: Store }) {
  const notify = useToast();
  const inventory = useApi(() => api.storeInventory(store.id), [store.id]);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inventory.data) {
      setDrafts(Object.fromEntries(inventory.data.items.map((item) => [item.productId, item.grams])));
    }
  }, [inventory.data]);

  if (inventory.loading && !inventory.data) return <Spinner label="正在读取库存" />;
  if (inventory.error) return <InlineError message={inventory.error} />;

  const items = inventory.data!.items.filter((item) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return `${item.name}${item.nameEn}`.toLowerCase().includes(needle);
  });
  const changed = inventory.data!.items.filter((item) => Math.abs((drafts[item.productId] ?? item.grams) - item.grams) > 0.01);
  const tea = items.filter((item) => item.kind === 'tea');
  const retail = items.filter((item) => item.kind !== 'tea');

  const toggleSoldOut = async (item: StockItem, next: boolean) => {
    try {
      const result = await api.storeUpdateInventory(store.id, [{ productId: item.productId, soldOut: next }]);
      inventory.setData(result);
      notify(`${item.name} 已${next ? '标记售罄' : '恢复在售'}`, 'ok');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '更新失败', 'danger');
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.storeUpdateInventory(
        store.id,
        changed.map((item) => ({ productId: item.productId, grams: drafts[item.productId] ?? item.grams }))
      );
      inventory.setData(result);
      notify(`已保存 ${changed.length} 项库存调整`, 'ok');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Store stock"
        title="本店在售"
        description="总部统一维护商品与配方，门店只调整本店原料余量与售罄状态。修改原料余量不会改变商品目录。"
        actions={
          <>
            <div className="search" style={{ position: 'relative' }}>
              <Icon name="search" size={15} style={{ position: 'absolute', left: 11, top: 13, color: 'var(--faint)' }} />
              <input style={{ paddingLeft: 34, minWidth: 200 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索商品" aria-label="搜索库存" />
            </div>
            <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={!changed.length || busy}>
              {busy ? '保存中…' : `保存变更${changed.length ? ` (${changed.length})` : ''}`}
            </button>
          </>
        }
      />
      {error ? <InlineError message={error} /> : null}
      <Panel title="鲜酿原料" description="单位 g。按每杯投茶量折算可制作杯数，仅供吧台参考。" flush>
        <div style={{ padding: '0 20px 10px' }}>
          {!tea.length ? <EmptyState icon="cup" title="没有匹配的原料" /> : tea.map((item) => {
            const cups = item.doseGrams > 0 ? Math.floor((drafts[item.productId] ?? item.grams) / item.doseGrams) : 0;
            return (
              <div className="inventory-row" key={item.productId}>
                <div className="name">
                  {item.name}
                  <small>{item.doseGrams}g / 杯 · 约可制作 {cups} 杯</small>
                </div>
                <input
                  className="grams-input"
                  type="number"
                  min={0}
                  step="0.1"
                  value={drafts[item.productId] ?? item.grams}
                  onChange={(event) => setDrafts((current) => ({ ...current, [item.productId]: Number(event.target.value) }))}
                  aria-label={`${item.name} 库存克数`}
                />
                <span className="tiny muted" style={{ minWidth: 16 }}>g</span>
                <div className="flex" style={{ gap: 6, minWidth: 88 }}>
                  <Switch checked={item.soldOut} onChange={(next) => toggleSoldOut(item, next)} label={`${item.name} 售罄`} />
                  <span className="tiny muted">{item.soldOut ? '售罄' : '在售'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="零售商品" description="零售商品作为实物库存管理，交付时从本店扣减 1 件。" flush>
        <div style={{ padding: '0 20px 10px' }}>
          {!retail.length ? <EmptyState icon="bag" title="没有匹配的商品" /> : retail.map((item) => (
            <div className="inventory-row" key={item.productId}>
              <div className="name">
                {item.name}
                <small>实物 · {item.unit}</small>
              </div>
              <input
                className="grams-input"
                type="number"
                min={0}
                value={drafts[item.productId] ?? item.grams}
                onChange={(event) => setDrafts((current) => ({ ...current, [item.productId]: Number(event.target.value) }))}
                aria-label={`${item.name} 库存数量`}
              />
              <span className="tiny muted" style={{ minWidth: 16 }}>{item.unit}</span>
              <div className="flex" style={{ gap: 6, minWidth: 88 }}>
                <Switch checked={item.soldOut} onChange={(next) => toggleSoldOut(item, next)} label={`${item.name} 售罄`} />
                <span className="tiny muted">{item.soldOut ? '售罄' : '在售'}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <p className="page-foot-note">
        库存调整会写入操作记录。真实上线后建议接入原料入库、盘点与损耗单据，当前为本地演示数据。
      </p>
    </>
  );
}

/* ------------------------------ losses ------------------------------ */

const LOSS_REASONS = ['过期', '破损', '制作失误', '试饮 / 招待', '其他'];

function LossesSection({ store }: { store: Store }) {
  const notify = useToast();
  const data = useApi(() => api.storeLosses(store.id), [store.id]);
  const menu = useApi(() => api.bootstrap(store.id), [store.id]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState(LOSS_REASONS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data.loading && !data.data) return <Spinner label="正在读取报损" />;
  if (data.error) return <InlineError message={data.error} />;
  const summary = data.data!.summary;
  const row = summary.rows[0];
  const policy = data.data!.policy;
  const products = menu.data?.products || [];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!productId) {
      setError('请选择报损商品');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.storeReportLoss({
        storeId: store.id,
        productId,
        qty: Number(qty),
        reason,
        note
      });
      notify(
        result.loss.status === 'pending'
          ? `报损 ${result.loss.name} 已提交，等待总部审批`
          : `报损 ${result.loss.name} 已登记并扣减库存`,
        'ok'
      );
      setProductId('');
      setQty('1');
      setNote('');
      data.reload({ silent: true }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '报损提交失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Loss reporting"
        title="报损登记"
        description="登记原料或零售商品的过期、破损与制作失误。超过审批线的报损会先进入总部审批，通过后才扣减库存并计入成本。"
        actions={<Badge tone={row?.warning ? 'danger' : 'ok'}>{row ? `本月损耗率 ${row.ratio.toFixed(1)}%` : '本月'}</Badge>}
      />
      <div className="stat-grid">
        <Stat label="本月已批报损" value={money(summary.totalCents)} hint={`${row?.count || 0} 笔 · 计入门店成本`} />
        <Stat label="待审批报损" value={money(summary.pendingTotalCents)} hint={`${row?.pending || 0} 笔 · 审批前不扣库存`} />
        <Stat label="损耗率 / 预警线" value={`${row ? row.ratio.toFixed(1) : '0.0'}% / ${policy.monthlyRatio}%`} hint={row?.warning ? '已超过总部设定的预警线' : '在本月预警线内'} />
        <Stat label="本月销售额" value={money(row?.salesCents || 0)} hint="用于计算损耗占比" />
      </div>

      <Panel title="登记一笔报损" description={`单笔金额满 ${money(policy.approvalThresholdCents)} 需总部审批。`}>
        <form className="loss-form" onSubmit={submit}>
          <Field label="商品">
            <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
              <option value="">请选择商品</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}（{product.kind === 'tea' ? `${product.doseGrams}g/杯` : product.unit}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="数量">
            <input type="number" min="0.1" step="0.1" value={qty} onChange={(event) => setQty(event.target.value)} required />
          </Field>
          <Field label="原因">
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              {LOSS_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="备注" className="span-2" >
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选，例如批次、发现时间" maxLength={200} />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '提交中…' : '提交报损'}
          </button>
        </form>
        {error ? <div style={{ marginTop: 10 }}><InlineError message={error} /></div> : null}
        <div className="notice" style={{ marginTop: 12 }}>
          <Icon name="info" size={15} />
          <span>
            鲜酿原料按「数量 × 每杯投茶量」换算为杯数并计算原料成本；零售商品按「数量 × 单位成本」计算。
            审批通过后才从库存扣减，并按审批时间计入当期门店成本。
          </span>
        </div>
      </Panel>

      <Panel title="本店报损记录" flush>
        {!data.data!.losses.length ? (
          <EmptyState icon="alert" title="暂无报损记录" description="登记后会显示在这里，并同步给总部审批。" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>商品</th>
                  <th className="num">数量</th>
                  <th className="num">金额</th>
                  <th>原因</th>
                  <th>状态</th>
                  <th>审批说明</th>
                </tr>
              </thead>
              <tbody>
                {data.data!.losses.map((loss: Loss) => (
                  <tr key={loss.id}>
                    <td className="tiny muted">{dateTimeText(loss.at)}</td>
                    <td>{loss.name}</td>
                    <td className="num">{loss.qty} {loss.unit}</td>
                    <td className="num">{money(loss.amountCents)}</td>
                    <td>{loss.reason}{loss.note ? <span className="sub-cell">{loss.note}</span> : null}</td>
                    <td><StatusPill status={loss.status} /></td>
                    <td className="tiny muted">{loss.decisionNote || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------ devices ------------------------------ */

function DevicesSection({ store }: { store: Store }) {
  const data = useApi(() => api.storeDevices(), []);

  if (data.loading && !data.data) return <Spinner label="正在读取设备" />;
  if (data.error) return <InlineError message={data.error} />;
  const devices = data.data!.devices;
  const cards = [
    { ...devices.printer, name: '云标签打印机', icon: 'printer' as const },
    { ...devices.payment, name: '模拟支付网关', icon: 'card' as const },
    ...devices.machines.map((machine, index) => ({
      ...machine,
      name: `泡茶机 ${index + 1}`,
      icon: 'cup' as const
    }))
  ];

  return (
    <>
      <PageHead
        eyebrow="Devices & adapters"
        title="本店设备"
        description="设备接入全部通过适配接口预留：云打印、泡茶机、支付网关、平台订单与会员系统。当前运行的是本机模拟驱动。"
        actions={<Badge tone="warn">当前为 Mock 模式</Badge>}
      />
      <Panel title="设备状态" description="真实设备接入后，驱动只需实现同一套接口，业务层无需改动。">
        <div className="device-grid">
          {cards.map((card) => (
            <div className="device-card" key={`${card.name}-${card.id || ''}`}>
              <span className="device-icon"><Icon name={card.icon} size={19} /></span>
              <div className="grow">
                <div className="flex between">
                  <strong>{card.name}</strong>
                  <Badge tone={card.online === false ? 'danger' : 'ok'}>{card.mode?.toUpperCase() || 'MOCK'}</Badge>
                </div>
                <small>{card.detail || '已预留接口，尚未连接真实硬件。'}</small>
                {card.id ? <small className="mono">{card.id}</small> : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="overview-grid" style={{ marginTop: 18 }}>
        <Panel title="接口边界" description="以下能力均已定义 contract 与 mock 实现，接入真实服务时替换驱动即可。">
          <div className="stack">
            <div className="notice"><Icon name="printer" size={15} /><span><strong>LabelPrinter</strong>：杯贴与订单标签。真实驱动负责把杯号、商品、温度、冰量映射到厂商模板。</span></div>
            <div className="notice"><Icon name="cup" size={15} /><span><strong>TeaMachineAdapter</strong>：三台泡茶机的状态与冲泡命令。当前版本不把设备调度放进下单主流程，避免下单被设备阻塞。</span></div>
            <div className="notice"><Icon name="card" size={15} /><span><strong>PaymentGateway</strong>：下单收款与退款。当前为同步模拟；真实微信/支付宝接入时保留同一支付引用与退款幂等键。</span></div>
            <div className="notice"><Icon name="bag" size={15} /><span><strong>PlatformConnector / MemberProvider</strong>：外卖平台拉单、回执与会员权益校验。平台订单当前不开放接口调用，会员校验为本地规则。</span></div>
          </div>
        </Panel>
        <Panel title="当前门店" description="设备接入以门店为单位配置。">
          <div className="kv"><span>门店</span><strong>{store.name}</strong></div>
          <div className="kv"><span>营业时间</span><strong>{store.hours}</strong></div>
          <div className="kv"><span>打印机</span><strong>{store.printerStatus === 'online' ? '在线（配置）' : '离线（配置）'}</strong></div>
          <div className="kv"><span>渠道</span><strong>{Object.entries(store.channels).filter(([, on]) => on).map(([key]) => CHANNEL_LABEL[key] || key).join(' / ') || '—'}</strong></div>
          <div className="kv"><span>桌位</span><strong>{store.positions.length} 个</strong></div>
          <p className="page-foot-note">
            设备状态来自服务端 mock 适配器，不代表真实硬件在线。上线前需要补充设备网关、心跳、密钥轮换与失败重试策略。
          </p>
        </Panel>
      </div>
    </>
  );
}

/* ------------------------------ logs ------------------------------ */

function LogsSection({ store }: { store: Store }) {
  const [q, setQ] = useState('');
  const logs = useApi(() => api.storeLogs(store.id, q), [store.id, q]);

  return (
    <>
      <PageHead
        eyebrow="Audit trail"
        title="操作记录"
        description="记录本店的下单、出餐、退款、库存与报损操作，便于交接与追溯。"
        actions={
          <div className="search" style={{ position: 'relative' }}>
            <Icon name="search" size={15} style={{ position: 'absolute', left: 11, top: 13, color: 'var(--faint)' }} />
            <input style={{ paddingLeft: 34, minWidth: 220 }} value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索操作人 / 内容" aria-label="搜索操作记录" />
          </div>
        }
      />
      <Panel flush>
        {logs.loading && !logs.data ? (
          <Spinner label="正在读取记录" />
        ) : logs.error ? (
          <div style={{ padding: 20 }}><InlineError message={logs.error} /></div>
        ) : !logs.data?.logs.length ? (
          <EmptyState icon="list" title="暂无操作记录" description="门店发生操作后会实时写入。" />
        ) : (
          <div style={{ padding: '6px 20px 14px' }}>
            {logs.data.logs.map((log) => (
              <div className="log-row" key={log.id}>
                <span className="log-time">{dateTimeText(log.at)}</span>
                <span className="log-actor">{log.actorName}</span>
                <span className="log-detail">{log.action} · {log.detail}</span>
                <Badge tone="neutral">{log.type}</Badge>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
