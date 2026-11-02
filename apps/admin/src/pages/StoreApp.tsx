import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useApi, useNow, useStoredState } from '../lib/hooks';
import { useStaffAuth } from '../lib/auth';
import { StaffShell } from '../components/StaffShell';
import { CameraScanButton, CameraScanner } from '../components/CameraScanner';
import { visibleNav } from '../lib/nav';
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
import { ICE_OPTIONS, changeLineTemp, resolveLineOptions } from '../lib/lineOptions';
import { memberCodeFromScan, pickupCodeFromScan } from '../lib/scan';
import { classifyScanGunKey, isPlausibleGunCode, normalizeGunCode } from '../lib/scanGun';
import { IdempotencyKeys } from '../lib/idempotency';
import { qrDataUrl } from '../lib/qr';

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

/** 门店页面的权限映射；菜单本身来自 lib/nav.ts 的统一导航。 */
const SECTION_PERM: Record<Section, string> = {
  workbench: 'pos:use',
  assisted: 'pos:use',
  retail: 'retail:handover',
  orders: 'order:view',
  inventory: 'store:stock',
  losses: 'loss:report',
  devices: 'store:device',
  logs: 'log:view'
};

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
  const nav = visibleNav(can);
  // 操作记录在统一导航里只有后台一个入口，但 /store/logs 深链仍然可用。
  const section: Section | undefined =
    SECTION_PERM[segment] && can(SECTION_PERM[segment])
      ? segment
      : (['workbench', 'assisted', 'retail', 'orders', 'inventory', 'losses', 'devices'] as Section[]).find((key) =>
          can(SECTION_PERM[key])
        );
  const allowed = Boolean(section);

  useEffect(() => {
    // 无权限的深链回落到第一个可用页面，并把地址栏一起纠正，避免 URL 与内容不一致。
    if (section && section !== segment) navigate(`/store/${section}`, { replace: true });
    // 完全没有门店权限（例如总部财务直接输入 /store/...）时交回 /staff 重新分派。
    else if (!section && nav.length) navigate('/staff', { replace: true });
  }, [section, segment, nav.length, navigate]);

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
      nav={nav}
      active={`store/${section || 'workbench'}`}
      onNavigate={(key) => navigate(`/${key}`)}
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
      {!allowed ? (
        <EmptyState icon="user" title="暂无可用的门店页面" description="当前账号没有任何门店操作权限，请联系管理员。" />
      ) : null}
      {allowed && section === 'workbench' ? (
        <Workbench store={store} can={can} version={version} onOpenOrder={setOrderId} onNavigate={handleNavigate} />
      ) : null}
      {allowed && section === 'assisted' ? (
        <AssistedOrder store={store} can={can} staffId={staff.id} onCompleted={refresh} />
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [gunMode, setGunMode] = useStoredState<'on' | 'off'>('teahour.scanGun', 'off', ['on', 'off']);
  const [filter, setFilter] = useState<'all' | 'dine' | 'takeaway' | 'delivery'>('all');
  const [queueTab, setQueueTab] = useState<'making' | 'ready'>('making');
  const gunBuffer = useRef('');
  const gunTimer = useRef<number | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') overview.reload({ silent: true }).catch(() => undefined);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [overview.reload]);

  const submitScanCode = async (raw?: string) => {
    const code = (raw ?? scan).trim().toUpperCase();
    if (!code) return;
    setScan(code);
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
  // 常驻监听通过 ref 取最新提交函数，避免每次渲染都重装键盘监听。
  const submitScanRef = useRef(submitScanCode);
  submitScanRef.current = submitScanCode;

  useEffect(() => {
    if (gunMode !== 'on') return;
    const clear = () => {
      gunBuffer.current = '';
      if (gunTimer.current != null) window.clearTimeout(gunTimer.current);
      gunTimer.current = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const kind = classifyScanGunKey(
        event,
        event.target instanceof HTMLElement
          ? { tagName: event.target.tagName, isContentEditable: event.target.isContentEditable }
          : null
      );
      if (kind === 'ignore') return;
      if (kind === 'submit') {
        const code = normalizeGunCode(gunBuffer.current);
        clear();
        if (!isPlausibleGunCode(code)) return;
        event.preventDefault();
        void submitScanRef.current(code);
        return;
      }
      gunBuffer.current += event.key;
      if (gunTimer.current != null) window.clearTimeout(gunTimer.current);
      // 扫码器逐字符输入很快；600ms 没有新字符就丢弃半截缓冲，避免和手动按键混在一起。
      gunTimer.current = window.setTimeout(clear, 600);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clear();
    };
  }, [gunMode]);

  if (overview.loading && !overview.data) return <Spinner label="正在读取营业台" />;
  if (overview.error && !overview.data) return <InlineError message={overview.error} />;
  const data = overview.data!;
  const queue = data.queue;
  const pendingCups = queue.fresh.reduce(
    (count, order) => count + order.units.filter((unit) => unit.status === 'pending').length,
    0
  );
  const longest = queue.fresh.reduce((max, order) => Math.max(max, minutesAgo(order.createdAt, now)), 0);
  // 待制作只保留尚未出完餐的订单；全部杯贴完成后进入待取餐，不再占着制作队列。
  const pendingOrders = queue.fresh.filter((order) => order.status === 'pending');
  const readyOrders = queue.fresh.filter((order) => order.status === 'ready');
  const tabOrders = queueTab === 'making' ? pendingOrders : readyOrders;
  const freshFiltered = tabOrders.filter((order) => {
    if (filter === 'all') return true;
    if (filter === 'delivery') return order.type === 'delivery' || order.channel === 'meituan' || order.channel === 'taobao';
    return order.type === filter;
  });

  const handleScan = (event: React.FormEvent) => {
    event.preventDefault();
    void submitScanCode();
  };

  const toggleScanGun = () => {
    const next = gunMode === 'on' ? 'off' : 'on';
    setGunMode(next);
    setScanNotice(null);
    setScan('');
    if (next === 'on') {
      // 焦点留在输入框时字符会被输入框接走；先失焦，交给全页监听。
      (document.activeElement as HTMLElement | null)?.blur?.();
    } else {
      window.setTimeout(() => scanInputRef.current?.focus(), 0);
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

  const deliverFresh = async (order: Order) => {
    try {
      await api.storeDeliverFresh(order.id);
      notify(`${order.number} 已确认取餐并归档`, 'ok');
      await overview.reload({ silent: true });
    } catch (error) {
      notify(error instanceof ApiError ? error.message : '确认取餐失败', 'danger');
    }
  };

  const remake = async (order: Order) => {    const ok = await confirm({
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
            <button
              type="button"
              className={`btn btn-sm ${gunMode === 'on' ? 'btn-primary' : 'btn-outline'}`}
              aria-pressed={gunMode === 'on'}
              title="USB 固定式扫码器：开启后光标不在输入框时，扫码即出餐"
              onClick={toggleScanGun}
            >
              <Icon name="scan" size={14} /> {gunMode === 'on' ? '扫码枪已接管' : '扫码枪常驻'}
            </button>
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
          hint={`${pendingOrders.length} 笔订单 · 每杯扫码后独立完成`}
          onClick={() => setQueueTab('making')}
        />
        <Stat
          label="待取餐"
          value={`${readyOrders.length} 单`}
          hint="全部杯贴完成，等待顾客取餐 · 点击查看"
          onClick={() => setQueueTab('ready')}
        />
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
            : gunMode === 'on'
              ? '扫码枪已接管本页：光标不在输入框时，直接扫码即出餐'
              : '扫描杯贴或输入杯号后回车 — 自动更新这一杯，无需再点按钮'}
        </span>
        <input
          ref={scanInputRef}
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
        <CameraScanButton
          onClick={() => setCameraOpen(true)}
          label="摄像头"
        />
        <button type="submit" className="btn btn-sm btn-primary" disabled={scanBusy || !scan.trim()}>
          {scanBusy ? '处理中' : '确认出餐'}
        </button>
      </form>

      <div className="queue-layout">
        <div>
          <div className="flex between wrap" style={{ marginBottom: 12 }}>
            <div className="flex" style={{ gap: 10 }}>
              <Tabs
                value={queueTab}
                onChange={setQueueTab}
                options={[
                  { value: 'making', label: '待制作', count: pendingOrders.length },
                  { value: 'ready', label: '待取餐', count: readyOrders.length }
                ]}
              />
              <span className="tiny muted">
                {queueTab === 'making' ? '按订单时间从早到晚' : '全部杯贴已完成，交付后归档'}
              </span>
            </div>
            <Tabs
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '全部', count: tabOrders.length },
                { value: 'dine', label: '堂食' },
                { value: 'takeaway', label: '现场外带' },
                { value: 'delivery', label: '平台外卖' }
              ]}
            />
          </div>

          {!tabOrders.length ? (
            <Panel>
              <EmptyState
                icon="cup"
                title={queueTab === 'making' ? '当前没有待制作订单' : '当前没有待取餐订单'}
                description={
                  queueTab === 'making'
                    ? '顾客下单或伙伴代点后，订单会实时出现在这里。'
                    : '全部杯贴完成后，订单会自动从待制作移到待取餐。'
                }
              />
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
                        <span>{ORDER_TYPE_LABEL[order.type]}{order.seat ? ` · ${order.seat}` : order.type === 'dine' ? ' · 取餐口自取' : ''}</span>
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
                    <Icon name="info" size={12} />{' '}
                    {queueTab === 'making'
                      ? '扫码后不可整单跳过；整单最后一份杯贴完成后自动进入待取餐。'
                      : '全部杯贴已完成，顾客取走后点「确认已取餐」归档；每日凌晨也会自动归档前一日未确认的订单。'}
                  </div>
                  <div className="queue-foot">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => reprint(order)}>
                      <Icon name="printer" size={13} /> 补打杯贴
                    </button>
                    {queueTab === 'making' ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => remake(order)}>
                        <Icon name="refresh" size={13} /> 补做
                      </button>
                    ) : (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => deliverFresh(order)}>
                        <Icon name="check" size={13} /> 确认已取餐
                      </button>
                    )}
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

      <CameraScanner
        open={cameraOpen}
        title="扫描杯贴"
        description="对准杯贴二维码，识别后自动出餐。识别结果只用于本次扫码，不会保存照片。"
        onClose={() => setCameraOpen(false)}
        onDetected={(text) => {
          setCameraOpen(false);
          void submitScanCode(text);
        }}
      />
    </>
  );
}

/* ------------------------------ assisted order ------------------------------ */

type CartLine = { productId: string; qty: number; temp: string | null; ice: string | null };

/**
 * 代点草稿：只存购物袋与结算选项，按「门店 + 账号」隔离。
 * 失效口径（UI-07）：按最后一段真实操作闲置 90 分钟过期；恢复草稿不算操作，
 * 不刷新计时；常驻页面每分钟与回前台时复查，提交前再校验，过期清空并提示。
 * 会员码原文绝不落盘，恢复草稿后需要重新扫码核验；下单成功或退出登录时清除。
 */
const DRAFT_TTL_MS = 90 * 60 * 1000;
const DRAFT_PREFIX = 'teahour.pos.draft.';

type PosDraft = {
  at: number;
  cart: CartLine[];
  orderType: 'dine' | 'takeaway';
  seat: string;
  note: string;
  payment: 'wechat' | 'alipay' | 'cash';
};

function readDraft(key: string): PosDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PosDraft>;
    if (!parsed || !Array.isArray(parsed.cart) || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    const cart = parsed.cart
      .filter((line) => line && typeof line.productId === 'string' && Number(line.qty) > 0)
      .map((line) => ({
        productId: line.productId,
        qty: Math.max(1, Math.min(20, Math.round(Number(line.qty) || 1))),
        temp: typeof line.temp === 'string' ? line.temp : null,
        ice: typeof line.ice === 'string' ? line.ice : null
      }));
    return {
      at: parsed.at,
      cart,
      orderType: parsed.orderType === 'takeaway' ? 'takeaway' : 'dine',
      seat: typeof parsed.seat === 'string' ? parsed.seat : '',
      note: typeof parsed.note === 'string' ? parsed.note.slice(0, 200) : '',
      payment: parsed.payment === 'alipay' || parsed.payment === 'cash' ? parsed.payment : 'wechat'
    };
  } catch (error) {
    return null;
  }
}

function writeDraft(key: string, draft: PosDraft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (error) {
    /* 存储不可用时只保留内存状态 */
  }
}

function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    /* ignore */
  }
}

function AssistedOrder({
  store,
  can,
  staffId,
  onCompleted
}: {
  store: Store;
  can: (permission: string) => boolean;
  staffId: string;
  onCompleted: () => void;
}) {
  const notify = useToast();
  const menu = useApi(() => api.bootstrap(store.id), [store.id]);
  const [series, setSeries] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<'dine' | 'takeaway'>('dine');
  const [seat, setSeat] = useState('');
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState<'wechat' | 'alipay' | 'cash'>('wechat');
  const [member, setMember] = useState<{ code: string; discountPerCupCents: number; name?: string } | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberCameraOpen, setMemberCameraOpen] = useState(false);
  const [memberCode, setMemberCode] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [scanAuthCode, setScanAuthCode] = useState('');
  const [scanCameraOpen, setScanCameraOpen] = useState(false);
  // 订单已创建、等待渠道确认的收款：qr=已生成收款码；scan=渠道处理中。
  // 订单一旦创建就必须明确「等到账」或「取消本单」，不能悄悄关闭后重复下单。
  const [pendingPay, setPendingPay] = useState<{
    orderId: string;
    kind: 'qr' | 'scan';
    method: 'wechat' | 'alipay';
    qrCode?: string;
    amountCents: number;
  } | null>(null);
  // 到账轮询约 3 分钟后暂停，避免长时间占着渠道查询；暂停后仍可手动复查或取消本单。
  const [payTimedOut, setPayTimedOut] = useState(false);
  const [payPoll, setPayPoll] = useState(0);
  const [cashReceived, setCashReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ order: Order; printError?: string } | null>(null);
  const confirm = useConfirm();

  const draftKey = `${DRAFT_PREFIX}${store.id}.${staffId}`;
  const draftRestored = useRef(false);
  // 闲置计时（UI-07）：只在真实用户操作时刷新；恢复草稿沿用原时间，不冒充新操作。
  const idleAtRef = useRef(0);
  const restoreAtRef = useRef<number | null>(null);
  // 代点幂等：同一份内容的重试复用同一个键，断网/双击不会重复出单。
  const idempotency = useRef(new IdempotencyKeys());

  useEffect(() => {
    // 换店或换账号时先清掉上一份草稿的内存副本，再按新 key 恢复。
    draftRestored.current = false;
    setCart([]);
    setNote('');
    setSeat('');
    setOrderType('dine');
    setPayment('wechat');
    setMember(null);
    setError(null);
    setSuccess(null);
    setScanAuthCode('');
    setPendingPay(null);
    setPayTimedOut(false);
  }, [draftKey]);

  const products = (menu.data?.products || []).filter((product) => product.kind === 'tea');
  const filtered = products.filter((product) => {
    if (series !== 'all' && product.series !== series) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return `${product.name}${product.nameEn}${product.tag}${product.desc}`.toLowerCase().includes(needle);
  });
  const grossTotal = cart.reduce((sum, line) => {
    const product = products.find((item) => item.id === line.productId);
    return sum + (product?.priceCents || 0) * line.qty;
  }, 0);
  const memberDiscount = member
    ? cart.reduce((sum, line) => {
        const product = products.find((item) => item.id === line.productId);
        if (!product || !product.memberEligible) return sum;
        return sum + Math.min(member.discountPerCupCents, product.priceCents) * line.qty;
      }, 0)
    : 0;
  const total = grossTotal - memberDiscount;
  const cashChange = payment === 'cash' ? Math.round(Number(cashReceived || 0) * 100) - total : 0;

  // 菜单到位后恢复本店本账号的草稿；下架或售罄的商品不再带出，会员码必须重新核验。
  useEffect(() => {
    if (draftRestored.current || !menu.data) return;
    // 换店时 useApi 会短暂保留上一家店的菜单，等本店目录到位再恢复。
    if (!menu.data.store || menu.data.store.id !== store.id) return;
    draftRestored.current = true;
    const draft = readDraft(draftKey);
    if (!draft) return;
    // 恢复沿用草稿原时间：闲置时长从最后一次真实操作起算（UI-07）。
    idleAtRef.current = draft.at;
    restoreAtRef.current = draft.at;
    const positions = store.positions || [];
    const lines: CartLine[] = [];
    draft.cart.forEach((line) => {
      const product = products.find((item) => item.id === line.productId && item.available !== false);
      if (!product) return;
      const options = resolveLineOptions(product, line.temp, line.ice);
      lines.push({ productId: product.id, qty: line.qty, ...options });
    });
    if (!lines.length) {
      clearDraft(draftKey);
      return;
    }
    setCart(lines);
    setOrderType(draft.orderType);
    setSeat(draft.orderType === 'dine' && positions.includes(draft.seat) ? draft.seat : '');
    setNote(draft.note);
    setPayment(draft.payment);
    notify('已恢复未完成的代点单，会员权益需重新扫码核验', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.data, draftKey]);

  // 草稿只随本单内容变化写入；空单即清除，避免残留上一笔的座位和备注。
  // 恢复触发的首次写入沿用草稿原 at，不把恢复当成新的用户操作（UI-07）。
  useEffect(() => {
    if (!draftRestored.current) return;
    if (!cart.length) {
      clearDraft(draftKey);
      idleAtRef.current = 0;
      return;
    }
    const restoredAt = restoreAtRef.current;
    restoreAtRef.current = null;
    const at = restoredAt ?? Date.now();
    if (!restoredAt) idleAtRef.current = at;
    writeDraft(draftKey, { at, cart, orderType, seat, note, payment });
  }, [cart, orderType, seat, note, payment, draftKey]);

  // 常驻过期复查（UI-07）：页面停留期间每分钟校验一次，回前台（重新可见）时立即校验；
  // 过期即清空内存与草稿并明确提示，而不是等下一次提交才暴露。
  useEffect(() => {
    const expireIfIdle = () => {
      if (!draftRestored.current || !cart.length) return;
      if (!idleAtRef.current) return;
      if (Date.now() - idleAtRef.current <= DRAFT_TTL_MS) return;
      setCart([]);
      setNote('');
      setMember(null);
      idleAtRef.current = 0;
      clearDraft(draftKey);
      notify('代点单已闲置超过 90 分钟，为保价格与权益准确已自动清空，请重新点单', 'warn');
    };
    const timer = window.setInterval(expireIfIdle, 60 * 1000);
    document.addEventListener('visibilitychange', expireIfIdle);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', expireIfIdle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, draftKey]);

  const add = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, qty: Math.min(20, line.qty + 1) } : line
        );
      }
      const options = resolveLineOptions(product);
      return [
        ...current,
        {
          productId: product.id,
          qty: 1,
          ...options
        }
      ];
    });
  };

  const updateLine = (productId: string, patch: Partial<CartLine>) => {
    setCart((current) => current.map((line) => (line.productId === productId ? { ...line, ...patch } : line)));
  };

  const verifyMember = async (raw?: string) => {
    const code = (raw ?? memberCode).trim().toUpperCase();
    if (!code) {
      setMemberError('请输入或扫入顾客会员码');
      return;
    }
    setMemberCode(code);
    setMemberBusy(true);
    setMemberError(null);
    try {
      const result = await api.storeVerifyMember(code);
      setMember({
        code: result.benefit.code,
        discountPerCupCents: result.benefit.discountPerCupCents,
        name: result.benefit.name
      });
      setMemberOpen(false);
      setMemberCode('');
      notify(`已识别 ${result.benefit.name || '会员'} · 单杯减 ${money(result.benefit.discountPerCupCents)}`, 'ok');
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : '会员码识别失败，请重试');
    } finally {
      setMemberBusy(false);
    }
  };

  const openPayment = () => {
    if (!cart.length) return;
    if (orderType === 'dine' && !seat) {
      setError('堂食请选择桌位或吧台位置');
      return;
    }
    setError(null);
    setScanAuthCode('');
    setPendingPay(null);
    setPayTimedOut(false);
    setCashReceived(String((total / 100).toFixed(2)));
    setPayOpen(true);
  };

  // 支付落账：只有渠道确认到账（或现金当面确认）才调用，统一收口订单、草稿与提示。
  const completeOrder = (order: Order, printError?: string) => {
    setPayOpen(false);
    setPendingPay(null);
    setPayTimedOut(false);
    setSuccess({ order, printError });
    setCart([]);
    setNote('');
    setMember(null);
    setScanAuthCode('');
    clearDraft(draftKey);
    onCompleted();
  };

  // 顾客迟迟不付款时取消本单：释放库存与锁定的券；已支付订单由服务端拒绝，必须走退款。
  const cancelPending = async (closeModal = false) => {
    if (!pendingPay) return;
    const ok = await confirm({
      title: '取消这笔未支付订单？',
      message: '顾客尚未付款。取消后会释放已占用的库存与优惠券，本单不再收款。',
      confirmText: '取消订单',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      const result = await api.storeCancelOrder(pendingPay.orderId);
      setPendingPay(null);
      setPayTimedOut(false);
      if (closeModal) setPayOpen(false);
      notify(`${result.order.number} 已取消，未收款${closeModal ? '' : '；可重新选择收款方式'}`, 'warn');
      onCompleted();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : '取消订单失败，请稍后重试', 'danger');
    }
  };

  // 到账轮询：回调可能晚到，营业台以服务端查询结果为准，不凭「已出示二维码」当成收款成功。
  useEffect(() => {
    if (!pendingPay || payTimedOut) return;
    let stopped = false;
    let timer = 0;
    let attempts = 0;
    const tick = async () => {
      if (stopped) return;
      attempts += 1;
      try {
        const status = await api.storeOrderPayment(pendingPay.orderId);
        if (stopped) return;
        if (status.paymentStatus === 'paid') {
          stopped = true;
          completeOrder(status.order);
          notify(`${status.order.number} 已确认收款，杯贴已进入打印队列`, 'ok');
          return;
        }
        if (status.paymentStatus === 'cancelled') {
          stopped = true;
          setPendingPay(null);
          setPayTimedOut(false);
          notify('渠道确认这笔交易未收款且已关闭，本单已取消，可重新收款', 'warn');
          onCompleted();
          return;
        }
      } catch (error) {
        /* 网络抖动：保持等待，下一轮继续 */
      }
      if (attempts >= 80) {
        setPayTimedOut(true);
        return;
      }
      timer = window.setTimeout(() => void tick(), 2600);
    };
    timer = window.setTimeout(() => void tick(), 1200);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPay, payTimedOut, payPoll]);

  const submit = async () => {
    if (!cart.length || pendingPay) return;
    // 提交前闲置校验（UI-07）：恢复后的常驻草稿若已超时，禁止按旧内容收款。
    if (idleAtRef.current && Date.now() - idleAtRef.current > DRAFT_TTL_MS) {
      setCart([]);
      setNote('');
      setMember(null);
      idleAtRef.current = 0;
      clearDraft(draftKey);
      setPayOpen(false);
      setError('代点单已闲置超过 90 分钟，已自动清空，请重新点单');
      return;
    }
    if (orderType === 'dine' && !seat) {
      setError('堂食请选择桌位或吧台位置');
      return;
    }
    if (payment === 'cash') {
      const received = Math.round(Number(cashReceived || 0) * 100);
      if (!Number.isFinite(received) || received < total) {
        setError('实收现金不能少于应收金额');
        return;
      }
    } else if (scanAuthCode.trim().length < 6) {
      setError('请扫描或输入顾客的付款码');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const lines = cart.map((line) => ({
        productId: line.productId,
        qty: line.qty,
        temp: line.temp,
        ice: line.ice
      }));
      const idempotencyKey = idempotency.current.keyFor(
        JSON.stringify({
          storeId: store.id,
          type: orderType,
          seat: orderType === 'dine' ? seat : null,
          payment,
          memberCode: member?.code ?? null,
          note,
          lines
        })
      );
      const payload: Record<string, unknown> = {
        storeId: store.id,
        business: 'fresh',
        type: orderType,
        seat: orderType === 'dine' ? seat : null,
        items: lines,
        note,
        paymentMethod: payment,
        memberCode: member?.code,
        idempotencyKey
      };
      if (payment !== 'cash') {
        // 汇付暂不支持微信正扫（T_NATIVE），营业台先统一走付款码反扫。
        payload.payMode = 'scan';
        payload.authCode = scanAuthCode.trim();
      }
      const result = await api.storeCreateOrder(payload);
      // 成功后才换键：失败/超时重试仍复用原键，避免「以为没成功」重复出单。
      idempotency.current.reset();
      const prompt = result.payment;
      if (prompt && prompt.kind === 'qr') {
        // 订单已创建、库存已占用：保持弹窗等顾客扫码，不关闭、不重复下单。
        setPendingPay({
          orderId: result.order.id,
          kind: 'qr',
          method: prompt.method,
          qrCode: prompt.qrCode,
          amountCents: result.order.totalCents
        });
        setPayTimedOut(false);
        setError(null);
        notify('收款码已生成，等待顾客扫码支付', 'info');
        onCompleted();
        return;
      }
      if (prompt && prompt.kind === 'scan' && prompt.status === 'processing') {
        setPendingPay({
          orderId: result.order.id,
          kind: 'scan',
          method: prompt.method,
          amountCents: result.order.totalCents
        });
        setPayTimedOut(false);
        setError(null);
        notify('渠道处理中，正在确认到账', 'info');
        return;
      }
      // 现金当面确认、付款码即时成功（或同步渠道已落账）：订单已支付，直接完成。
      completeOrder(result.order, result.printError);
      notify(
        `${result.order.number} 已下单，杯贴已进入打印队列${
          payment === 'cash' && cashChange > 0 ? ` · 找零 ${money(cashChange)}` : ''
        }`,
        'ok'
      );
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
        description="由伙伴在吧台代客下单并收款。收款成功后直接进入营业台，杯贴按杯生成。"
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
                            onClick={() => updateLine(line.productId, changeLineTemp(product, temp, line.ice))}
                          >
                            {temp}
                          </button>
                        ))}
                        {product.ice && line.temp !== '热'
                          ? ICE_OPTIONS.map((ice) => (
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
            <div className="field">
              <span className="field-label">支付方式</span>
              <div className="radio-cards" role="radiogroup" aria-label="支付方式">
                {([
                  { value: 'wechat', label: '微信支付' },
                  { value: 'alipay', label: '支付宝' },
                  { value: 'cash', label: '现金' }
                ] as const).map((option) => (
                  <label key={option.value} className={`radio-card ${payment === option.value ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="assisted-payment"
                      value={option.value}
                      checked={payment === option.value}
                      onChange={() => setPayment(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <span className="field-hint">扫码收款走门店已配置的支付通道，现金由伙伴清点入账。</span>
            </div>
            <Field label="备注">
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="如：少甜、分杯装" maxLength={200} />
            </Field>
            {error ? <InlineError message={error} /> : null}
          </div>

          <div className="pos-member-box" style={{ marginTop: 14 }}>
            <div className="flex between">
              <div className="grow">
                <strong>会员权益</strong>
                <p className="tiny muted">
                  {member
                    ? `已识别${member.name || '会员'} · 单杯减 ${money(member.discountPerCupCents)}`
                    : '扫顾客会员码，带入单杯权益；不需要手机号'}
                </p>
              </div>
              {member ? (
                <button type="button" className="text-btn" onClick={() => setMember(null)}>解除</button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setMemberError(null);
                    setMemberCode('');
                    setMemberOpen(true);
                  }}
                >
                  <Icon name="scan" size={14} /> 扫会员码
                </button>
              )}
            </div>
          </div>

          {memberDiscount ? (
            <>
              <div className="bill-line flex between tiny muted" style={{ marginTop: 6 }}>
                <span>商品原价</span>
                <span>{money(grossTotal)}</span>
              </div>
              <div className="bill-line flex between tiny muted">
                <span>会员减免</span>
                <span>-{money(memberDiscount)}</span>
              </div>
            </>
          ) : null}

          <div className="pay-total">
            <span className="muted">应收合计</span>
            <strong>{money(total)}</strong>
          </div>
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!cart.length || busy} onClick={openPayment}>
            {payment === 'cash' ? <>现金已收 · 确认出单 <Icon name="arrowRight" size={16} /></> : <>收款 · 扫顾客付款码 <Icon name="arrowRight" size={16} /></>}
          </button>
          <p className="tiny faint" style={{ marginTop: 8, textAlign: 'center' }}>现金不设日结余额，伙伴内部清点后扫码入账。</p>
        </aside>
      </div>

      <Modal
        open={memberOpen}
        title="扫顾客会员码"
        description="只识别权益，不读取个人资料。"
        onClose={() => setMemberOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setMemberOpen(false)}>取消</button>
            <button type="button" className="btn btn-primary" disabled={memberBusy} onClick={() => verifyMember()}>
              {memberBusy ? '识别中…' : '识别会员权益'}
            </button>
          </>
        }
      >
        <button
          type="button"
          className="scan-frame compact"
          onClick={() => setMemberCameraOpen(true)}
          aria-label="打开摄像头扫描会员码"
          style={{ cursor: 'pointer' }}
        >
          <Icon name="qr" size={30} />
        </button>
        <p className="note">点击上方二维码框打开摄像头扫描，或用扫码枪读取会员码、直接输入，带入单杯权益。</p>
        <Field label="会员码" hint="时叙会员码以 TH- 开头，例如 TH-261029-0001。">
          <div className="scan-input-row">
            <input
              value={memberCode}
              onChange={(event) => setMemberCode(event.target.value.toUpperCase())}
              placeholder="TH-"
              maxLength={40}
              autoComplete="off"
            />
            <CameraScanButton onClick={() => setMemberCameraOpen(true)} />
          </div>
        </Field>
        {memberError ? <InlineError message={memberError} /> : null}
      </Modal>

      <CameraScanner
        open={memberCameraOpen}
        title="扫描顾客会员码"
        description="对准顾客的会员二维码，识别后自动填入并校验权益。"
        onClose={() => setMemberCameraOpen(false)}
        onDetected={(text) => {
          const code = memberCodeFromScan(text);
          setMemberCameraOpen(false);
          if (!code) {
            setMemberError('未识别到会员码，请确认顾客出示的是时叙会员二维码');
            return;
          }
          void verifyMember(code);
        }}
      />

      <Modal
        open={payOpen}
        title={pendingPay ? '等待顾客支付' : payment === 'cash' ? '确认现金已收' : '收款'}
        description={
          pendingPay
            ? '订单已创建并占用库存，渠道确认到账后自动出杯贴；顾客不付可取消本单。'
            : payment === 'cash'
              ? '现金收款由伙伴当面清点，确认后计入门店现金台账。'
              : '用扫码设备读取顾客的微信或支付宝付款码。'
        }
        onClose={() => {
          // 已创建订单时不允许悄悄关掉：不取消就会一直占着库存，重复下单还会多出一单。
          if (pendingPay) void cancelPending(true);
          else setPayOpen(false);
        }}
        footer={
          pendingPay ? (
            <>
              {payTimedOut ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setPayTimedOut(false);
                    setPayPoll((n) => n + 1);
                  }}
                >
                  重新检查到账
                </button>
              ) : (
                <span className="tiny muted">正在确认到账…</span>
              )}
              <button type="button" className="btn danger" onClick={() => void cancelPending(false)}>
                取消本单
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => setPayOpen(false)}>返回修改</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
                {busy
                  ? '正在下单…'
                  : payment === 'cash'
                    ? '确认已收款并出单'
                    : '确认收款并下单'}
              </button>
            </>
          )
        }
      >
        <div className="centered">
          <div className="eyebrow">AMOUNT DUE</div>
          <h3 className="payment-amount">{money(pendingPay?.amountCents ?? total)}</h3>
          <p className="tiny muted">
            {store.name} · {orderType === 'dine' ? `店内享用 · ${seat}` : '现场外带'} ·{' '}
            {cart.reduce((n, line) => n + line.qty, 0)} 杯
            {memberDiscount ? ` · 会员减免 ${money(memberDiscount)}` : ''}
          </p>
        </div>

        {pendingPay ? (
          pendingPay.kind === 'qr' && pendingPay.qrCode ? (
            <>
              <div
                className="qr-demo"
                role="img"
                aria-label={`${pendingPay.method === 'alipay' ? '支付宝' : '微信'}收款二维码`}
                style={{ width: 208, height: 208, background: 'var(--card)' }}
              >
                <img
                  src={qrDataUrl(pendingPay.qrCode)}
                  alt="收款二维码"
                  style={{ width: '100%', height: '100%', padding: 10, display: 'block', background: 'var(--card)' }}
                />
              </div>
              <p className="note">
                请顾客用{pendingPay.method === 'alipay' ? '支付宝' : '微信'}扫码支付。
                {payTimedOut
                  ? '暂时没有查到到账，顾客付款后系统仍会自动记账；可重新检查，或取消本单。'
                  : '系统正在确认到账，付款成功后自动出杯贴，不需要重复点击。'}
              </p>
            </>
          ) : (
            <>
              <div className="scan-frame compact" role="img" aria-label="正在向渠道确认付款">
                <Icon name="scan" size={30} />
              </div>
              <p className="note">
                顾客付款码已提交给{pendingPay.method === 'alipay' ? '支付宝' : '微信'}渠道，正在确认结果。
                {payTimedOut
                  ? '暂时未确认到账，可重新检查或取消本单。'
                  : '确认到账后自动出杯贴，请不要重复下单。'}
              </p>
            </>
          )
        ) : payment === 'cash' ? (
          <>
            <Field label="实收现金（元）">
              <input
                type="number"
                step="0.01"
                min="0"
                value={cashReceived}
                onChange={(event) => setCashReceived(event.target.value)}
              />
            </Field>
            <p className="note">
              {cashChange > 0 ? `应找零 ${money(cashChange)}。` : ''}
              现金不留日结余额，由伙伴内部清点后扫码入账，不设现金台账。
            </p>
          </>
        ) : (
          <>
            {/* 汇付暂不支持微信正扫（T_NATIVE），先只保留付款码反扫；
                小程序码直达订单支付完成后再补回「顾客扫我们的码」。 */}
            <Field label={`顾客${payment === 'alipay' ? '支付宝' : '微信'}付款码`}>
              <div className="scan-input-row">
                <input
                  value={scanAuthCode}
                  onChange={(event) => setScanAuthCode(event.target.value.trim().slice(0, 64))}
                  placeholder="用扫码设备读取，或手动输入付款码"
                  maxLength={64}
                  autoComplete="off"
                  aria-label="顾客付款码"
                />
                <CameraScanButton onClick={() => setScanCameraOpen(true)} />
              </div>
            </Field>
            <p className="note">
              读取顾客付款码后点「确认收款并下单」，渠道即时扣款并确认结果；
              付款码只透传给支付渠道，不保存、不写日志。
            </p>
          </>
        )}
        {error ? <InlineError message={error} /> : null}
      </Modal>

      <CameraScanner
        open={scanCameraOpen}
        title="扫描顾客付款码"
        description="对准顾客手机上的微信或支付宝付款码，识别后自动填入。"
        onClose={() => setScanCameraOpen(false)}
        onDetected={(text) => {
          const code = String(text || '').trim().slice(0, 64);
          setScanCameraOpen(false);
          if (code.length < 6) {
            setError('未识别到付款码，请让顾客刷新付款码后重试');
            return;
          }
          setScanAuthCode(code);
          setError(null);
          notify('已读取付款码，确认后即可收款', 'info');
        }}
      />
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
  const [cameraOpen, setCameraOpen] = useState(false);
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
            <CameraScanButton
              onClick={() => setCameraOpen(true)}
              label="摄像头扫提货码"
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

      <CameraScanner
        open={cameraOpen}
        title="扫描提货码"
        description="对准提货凭证上的二维码或条形码，自动读取最后 4 位数字并校验。"
        onClose={() => setCameraOpen(false)}
        onDetected={(text) => {
          setCameraOpen(false);
          const parsed = pickupCodeFromScan(text);
          if (!parsed) {
            setError('未识别到 4 位提货码，请改用键盘输入或让顾客出示提货凭证');
            return;
          }
          setError(null);
          setDelivered(null);
          setCode(parsed);
        }}
      />
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
  const [status, setStatus] = useStoredState<'all' | 'pending' | 'ready' | 'awaiting' | 'delivered' | 'refunded' | 'cancelled'>(
    'teahour.store.orders.status',
    'all',
    ['all', 'pending', 'ready', 'awaiting', 'delivered', 'refunded', 'cancelled']
  );
  const [business, setBusiness] = useStoredState<'all' | 'fresh' | 'retail'>('teahour.store.orders.business', 'all', [
    'all',
    'fresh',
    'retail'
  ]);
  const [q, setQ] = useState('');
  const [searchCameraOpen, setSearchCameraOpen] = useState(false);
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
            <CameraScanButton onClick={() => setSearchCameraOpen(true)} label="扫码搜索" />
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="订单状态">
              <option value="all">全部状态</option>
              <option value="pending">制作中</option>
              <option value="ready">待取餐</option>
              <option value="awaiting">待提货</option>
              <option value="delivered">已交付</option>
              <option value="refunded">已退款</option>
              <option value="cancelled">已取消</option>
            </select>
            <select value={business} onChange={(event) => setBusiness(event.target.value as typeof business)} aria-label="订单类型">
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
                      <span className="sub-cell">{CHANNEL_LABEL[order.channel]}{order.seat ? ` · ${order.seat}` : order.type === 'dine' ? ' · 取餐口自取' : ''}</span>
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

      <CameraScanner
        open={searchCameraOpen}
        title="扫码搜索订单"
        description="扫描杯贴、订单凭证或桌签二维码，识别结果会填入搜索框。"
        onClose={() => setSearchCameraOpen(false)}
        onDetected={(text) => {
          setSearchCameraOpen(false);
          setQ(text.trim());
        }}
      />
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
                {order.seat ? <Badge tone="neutral">{order.seat}</Badge> : order.type === 'dine' ? <Badge tone="neutral">取餐口自取</Badge> : null}
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
  // 金额是否走审批由服务端按配置阈值决定，前端只按自身权限标注按钮，不重复维护阈值（UI-05）
  const needsApproval = !canDirect;

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
      if (result.mode === 'approval') {
        notify('退款金额超过直接退款上限，已提交总部审批，审批通过后自动执行', 'ok');
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
              ? '当前账号无直接退款权限，将提交总部审批，审批通过后原路退回。'
              : '超过直接退款上限的金额会自动转总部审批。未制作且未出餐的杯数会同时退回原料库存；已制作订单保留原料成本。'}
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
  // 草稿按门店隔离（UI-06）：切店不丢未保存输入，也绝不把 A 店草稿提交给 B 店。
  const [draftsByStore, setDraftsByStore] = useState<Record<string, Record<string, number>>>({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storeRef = useRef(store.id);
  storeRef.current = store.id;

  const drafts = draftsByStore[store.id] || {};

  const setDraft = (productId: string, value: number) => {
    setDraftsByStore((current) => ({
      ...current,
      [store.id]: { ...(current[store.id] || {}), [productId]: value }
    }));
  };

  const discardDrafts = (storeId: string, productIds: string[]) => {
    setDraftsByStore((current) => {
      const layer = current[storeId];
      if (!layer) return current;
      const next = { ...layer };
      for (const id of productIds) delete next[id];
      return { ...current, [storeId]: next };
    });
  };

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
    const storeId = store.id;
    try {
      const result = await api.storeUpdateInventory(storeId, [{ productId: item.productId, soldOut: next }]);
      // 已切店：响应属于旧店，服务端已生效但不覆盖当前门店视图、不误报（UI-06）。
      if (storeRef.current !== storeId) return;
      // 售罄是局部更新：其他未保存的克数草稿一律保留（UI-06）。
      inventory.setData(result);
      notify(`${item.name} 已${next ? '标记售罄' : '恢复在售'}`, 'ok');
    } catch (err) {
      if (storeRef.current !== storeId) return;
      notify(err instanceof ApiError ? err.message : '更新失败', 'danger');
    }
  };

  const save = async () => {
    const storeId = store.id;
    const previous = inventory.data;
    const lines = changed.map((item) => ({ productId: item.productId, grams: drafts[item.productId] ?? item.grams }));
    if (!lines.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.storeUpdateInventory(storeId, lines);
      // 已切店：不把旧店保存结果写进当前门店视图（UI-06）；草稿仍留在该店，返回时可再保存。
      if (storeRef.current !== storeId) return;
      inventory.setData(result);
      // 只清除本次已提交的草稿；其余脏字段保留，供用户继续修改（UI-06）。
      discardDrafts(storeId, lines.map((line) => line.productId));
      const contested = previous
        ? result.items.filter(
            (item) =>
              !lines.some((line) => line.productId === item.productId) &&
              previous.items.find((row) => row.productId === item.productId && Math.abs(row.grams - item.grams) > 0.01)
          )
        : [];
      notify(
        contested.length
          ? `已保存 ${lines.length} 项；另有 ${contested.length} 项库存已被其他操作更新，未保存的修改已保留，请核对后再保存`
          : `已保存 ${lines.length} 项库存调整`,
        'ok'
      );
    } catch (err) {
      if (storeRef.current !== storeId) return;
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  // 本店顺序覆盖：只在同系列同分类内移动，未覆盖时跟随总部；搜索会隐藏同组商品，先收起排序按钮。
  const orderBlocked = Boolean(search.trim());
  const customOrder = inventory.data!.items.some((item) => item.customOrder);
  const storeOrder = async (productIds: string[], message: string) => {
    const storeId = store.id;
    setOrderBusy(true);
    setError(null);
    try {
      const result = await api.storeReorderInventory(storeId, productIds);
      if (storeRef.current !== storeId) return;
      inventory.setData(result);
      notify(message, 'ok');
    } catch (err) {
      if (storeRef.current !== storeId) return;
      setError(err instanceof ApiError ? err.message : '调整顺序失败');
    } finally {
      setOrderBusy(false);
    }
  };

  const moveItem = (item: StockItem, direction: -1 | 1) => {
    const group = inventory.data!.items.filter(
      (row) => row.series === item.series && row.categoryId === item.categoryId
    );
    const index = group.findIndex((row) => row.productId === item.productId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= group.length) return;
    const ids = group.map((row) => row.productId);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void storeOrder(ids, `已更新本店顺序：${item.name}`);
  };

  const resetOrder = async () => {
    const storeId = store.id;
    setOrderBusy(true);
    setError(null);
    try {
      const result = await api.storeResetInventoryOrder(storeId);
      if (storeRef.current !== storeId) return;
      inventory.setData(result);
      notify('已恢复总部茶单顺序', 'ok');
    } catch (err) {
      if (storeRef.current !== storeId) return;
      setError(err instanceof ApiError ? err.message : '恢复总部顺序失败');
    } finally {
      setOrderBusy(false);
    }
  };

  const orderButtons = (item: StockItem) => {
    if (orderBlocked) return null;
    const group = inventory.data!.items.filter(
      (row) => row.series === item.series && row.categoryId === item.categoryId
    );
    const index = group.findIndex((row) => row.productId === item.productId);
    return (
      <div className="order-actions">
        <button
          type="button"
          className="order-btn"
          aria-label={`${item.name} 上移`}
          title="在同系列同分类内上移"
          disabled={orderBusy || index <= 0}
          onClick={() => moveItem(item, -1)}
        >
          <Icon name="arrowUp" size={13} />
        </button>
        <button
          type="button"
          className="order-btn"
          aria-label={`${item.name} 下移`}
          title="在同系列同分类内下移"
          disabled={orderBusy || index < 0 || index >= group.length - 1}
          onClick={() => moveItem(item, 1)}
        >
          <Icon name="arrowDown" size={13} />
        </button>
      </div>
    );
  };

  return (
    <>
      <PageHead
        eyebrow="Store stock"
        title="本店在售"
        description="总部统一维护商品与配方，门店只调整本店原料余量与售罄状态。茶单顺序默认跟随总部，门店调整后以本店为准。"
        actions={
          <>
            <div className="search" style={{ position: 'relative' }}>
              <Icon name="search" size={15} style={{ position: 'absolute', left: 11, top: 13, color: 'var(--faint)' }} />
              <input style={{ paddingLeft: 34, minWidth: 200 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索商品" aria-label="搜索库存" />
            </div>
            {customOrder ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={resetOrder} disabled={orderBusy}>
                <Icon name="refresh" size={13} /> 恢复总部顺序
              </button>
            ) : null}
            <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={!changed.length || busy}>
              {busy ? '保存中…' : `保存变更${changed.length ? ` (${changed.length})` : ''}`}
            </button>
          </>
        }
      />
      {error ? <InlineError message={error} /> : null}
      <Panel title="鲜酿原料" description="单位 g。按每杯投茶量折算可制作杯数，仅供吧台参考。上下箭头调整本店茶单顺序。" flush>
        <div style={{ padding: '0 20px 10px' }}>
          {!tea.length ? <EmptyState icon="cup" title="没有匹配的原料" /> : tea.map((item) => {
            const cups = item.doseGrams > 0 ? Math.floor((drafts[item.productId] ?? item.grams) / item.doseGrams) : 0;
            return (
              <div className="inventory-row" key={item.productId}>
                {orderButtons(item)}
                <div className="name">
                  {item.name}
                  <small>
                    {(SERIES[item.series as keyof typeof SERIES]?.name || '') + (SERIES[item.series as keyof typeof SERIES] ? ' · ' : '')}
                    {item.doseGrams}g / 杯 · 约可制作 {cups} 杯
                  </small>
                </div>
                <input
                  className="grams-input"
                  type="number"
                  min={0}
                  step="0.1"
                  value={drafts[item.productId] ?? item.grams}
                  onChange={(event) => setDraft(item.productId, Number(event.target.value))}
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
              {orderButtons(item)}
              <div className="name">
                {item.name}
                <small>实物 · {item.unit}</small>
              </div>
              <input
                className="grams-input"
                type="number"
                min={0}
                value={drafts[item.productId] ?? item.grams}
                onChange={(event) => setDraft(item.productId, Number(event.target.value))}
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
        库存调整会写入操作记录。原料入库、盘点与损耗单据由总部在「原料映射」与「报损与损耗」中归集。
        茶单顺序默认跟随总部；本店用上下箭头调整后立即生效，可随时「恢复总部顺序」。搜索时先收起排序按钮，避免同组商品被隐藏后误移。
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
    { ...devices.payment, name: '支付网关', icon: 'card' as const },
    ...devices.machines.map((machine, index) => ({
      ...machine,
      name: `泡茶机 ${index + 1}`,
      icon: 'cup' as const
    }))
  ];
  // mode 是适配层返回的驱动标识，这里翻译成门店能看懂的接入状态。
  const modeLabel = (mode?: string) => {
    if (mode === 'local') return '本地';
    if (mode === 'noop') return '未启用';
    if (!mode || mode === 'mock') return '未接入';
    return mode.toUpperCase();
  };
  const pendingCount = cards.filter((card) => !card.mode || card.mode === 'mock').length;

  return (
    <>
      <PageHead
        eyebrow="Devices & adapters"
        title="本店设备"
        description="云打印、泡茶机、支付网关、平台订单与会员系统均通过适配层接入，按门店单独配置并启用。"
        actions={<Badge tone={pendingCount ? 'warn' : 'ok'}>{pendingCount ? `${pendingCount} 项待接入` : '全部已接入'}</Badge>}
      />
      <Panel title="设备状态" description="接入新设备只需实现同一套适配接口，业务流程无需改动。">
        <div className="device-grid">
          {cards.map((card) => (
            <div className="device-card" key={`${card.name}-${card.id || ''}`}>
              <span className="device-icon"><Icon name={card.icon} size={19} /></span>
              <div className="grow">
                <div className="flex between">
                  <strong>{card.name}</strong>
                  <Badge tone={card.online === false ? 'danger' : !card.mode || card.mode === 'mock' ? 'warn' : 'ok'}>
                    {modeLabel(card.mode)}
                  </Badge>
                </div>
                <small>{card.detail || '适配层已就绪，尚未配置设备凭证。'}</small>
                {card.id ? <small className="mono">{card.id}</small> : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="overview-grid" style={{ marginTop: 18 }}>
        <Panel title="接口边界" description="以下能力由适配层统一定义，配置对应驱动后即可启用。">
          <div className="stack">
            <div className="notice"><Icon name="printer" size={15} /><span><strong>云标签打印</strong>：杯贴与订单标签。驱动负责把杯号、商品、温度、冰量映射到厂商模板。</span></div>
            <div className="notice"><Icon name="cup" size={15} /><span><strong>泡茶机</strong>：设备状态与冲泡命令。设备调度不进入下单主流程，避免下单被设备阻塞。</span></div>
            <div className="notice"><Icon name="card" size={15} /><span><strong>支付网关</strong>：下单收款与退款。微信、支付宝等通道共用同一支付引用与退款幂等键。</span></div>
            <div className="notice"><Icon name="bag" size={15} /><span><strong>外卖平台 / 会员</strong>：平台拉单回执与会员权益校验。未配置通道时，对应操作在门店侧不可用。</span></div>
          </div>
        </Panel>
        <Panel title="当前门店" description="设备接入以门店为单位配置。">
          <div className="kv"><span>门店</span><strong>{store.name}</strong></div>
          <div className="kv"><span>营业时间</span><strong>{store.hours}</strong></div>
          <div className="kv"><span>打印机</span><strong>{store.printerStatus === 'online' ? '在线（配置）' : '离线（配置）'}</strong></div>
          <div className="kv"><span>渠道</span><strong>{Object.entries(store.channels).filter(([, on]) => on).map(([key]) => CHANNEL_LABEL[key] || key).join(' / ') || '—'}</strong></div>
          <div className="kv"><span>桌位</span><strong>{store.positions.length} 个</strong></div>
          <p className="page-foot-note">
            状态来自适配层回报，未接入的设备不代表硬件故障。设备网关、心跳、密钥轮换与失败重试由总部统一配置。
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
