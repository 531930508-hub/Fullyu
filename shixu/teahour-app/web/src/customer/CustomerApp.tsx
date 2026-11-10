import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, ApiError, tokens } from '../lib/api';
import { useApi, useStoredState } from '../lib/hooks';
import { Icon, type IconName } from '../components/Icons';
import { ProductArt, SeriesMotif } from '../components/ProductArt';
import { AppTop } from '../components/AppTop';
import { Spinner, useToast } from '../components/ui';
import { SERIES, money } from '../lib/format';
import type { Category, Customer, Order, Product, RetailAvailability, Series, Store } from '../lib/types';

type Locale = 'zh' | 'en';
type Screen = 'home' | 'menu' | 'retail' | 'orders' | 'profile' | 'checkout' | 'receipt';
type SeriesFilter = 'all' | Series;

type FreshLine = { key: string; product: Product; qty: number; temp: string; ice: string };
type RetailLine = { key: string; item: RetailAvailability; categoryId?: string; qty: number };

const SPEC_EN: Record<string, string> = {
  热: 'Hot',
  冰: 'Iced',
  冰镇: 'Chilled',
  标准冰: 'Regular ice',
  少冰: 'Less ice',
  去冰: 'No ice',
  热饮: 'Hot',
  杯: 'cup',
  瓶: 'bottle',
  枚: 'pack',
  盒: 'box',
  袋: 'bag'
};

const STATUS_EN: Record<string, string> = {
  unpaid: 'Unpaid',
  pending: 'Preparing',
  ready: 'Ready',
  awaiting: 'To collect',
  delivered: 'Collected',
  refunded: 'Refunded',
  cancelled: 'Cancelled'
};

type LocaleValue = {
  locale: Locale;
  setLocale: (value: Locale) => void;
  t: (zh: string, en: string) => string;
  pname: (product: { name: string; nameEn?: string | null }) => string;
  sname: (store: Store) => string;
  spec: (value: string) => string;
  ostatus: (status: string) => string;
};

const LocaleCtx = createContext<LocaleValue>({
  locale: 'zh',
  setLocale: () => undefined,
  t: (zh) => zh,
  pname: (product) => product.name,
  sname: (store) => store.name,
  spec: (value) => value,
  ostatus: (status) => status
});

const useLocale = () => useContext(LocaleCtx);

function specText(value: string, locale: Locale) {
  if (locale !== 'en') return value;
  if (SPEC_EN[value]) return SPEC_EN[value];
  return value.replace('吧台', 'Counter ').replace('窗边', 'Window ').replace('桌', ' Table');
}

function orderLabel(order: Order, locale: Locale, t: (zh: string, en: string) => string) {
  if (order.business === 'retail') return t('任意门店领取', 'Pickup at any store');
  if (order.type === 'dine') return specText(order.seat || '吧台', locale);
  if (order.type === 'takeaway') return t('现场外带', 'Takeaway');
  return order.channel === 'meituan' ? '美团外卖' : order.channel === 'taobao' ? '淘宝闪购' : t('平台外卖', 'Delivery');
}

function useCustomerSession() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setError(null);
      const existing = tokens.customer();
      if (existing) {
        try {
          const result = await api.customerMe();
          if (!cancelled) setCustomer(result.customer);
          return;
        } catch {
          tokens.clearCustomer();
        }
      }
      try {
        const result = await api.customerSession({ name: '茶客' });
        tokens.setCustomer(result.token);
        if (!cancelled) setCustomer(result.customer);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : '无法连接服务，请确认后端已启动');
      }
    };
    start();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { customer, error, retry: () => setTick((value) => value + 1) };
}

export function CustomerApp() {
  const { customer, error, retry } = useCustomerSession();
  const [storedStore, setStoredStore] = useStoredState<string>('teahour.customer.store', '');
  const [storeChosen, setStoreChosen] = useState(() => Boolean(localStorage.getItem('teahour.customer.store')));
  const [locale, setLocaleState] = useStoredState<Locale>('teahour.customer.locale', 'zh', ['zh', 'en']);

  const [screen, setScreen] = useState<Screen>('home');
  const [menuSeries, setMenuSeries] = useState<SeriesFilter>('all');
  const [checkoutKind, setCheckoutKind] = useState<'fresh' | 'retail'>('fresh');
  const [dining, setDining] = useState<'dine' | 'takeaway'>('takeaway');
  const [seat, setSeat] = useState('');
  const [note, setNote] = useState('');
  const [freshCart, setFreshCart] = useState<FreshLine[]>([]);
  const [retailCart, setRetailCart] = useState<RetailLine[]>([]);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [ordersVersion, setOrdersVersion] = useState(0);

  const [storeOpen, setStoreOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detail, setDetail] = useState<Product | null>(null);

  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const notify = useToast();
  const seq = useRef(1);
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [screen]);

  const boot = useApi(() => api.bootstrap(storedStore || undefined), [customer?.id, storedStore]);
  const store = boot.data?.store;
  const stores = boot.data?.stores || [];
  const categories = boot.data?.categories || [];
  const products = boot.data?.products || [];
  const retail = boot.data?.retail || [];

  const orders = useApi(() => (customer ? api.customerOrders() : Promise.resolve({ orders: [] as Order[] })), [
    customer?.id,
    ordersVersion
  ]);

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
    return () => {
      document.documentElement.lang = 'zh-CN';
    };
  }, [locale]);

  useEffect(() => {
    if (!store) return;
    setSeat((current) => current || store.positions[0] || '吧台01');
  }, [store?.id, store?.positions]);

  const t = useMemo(() => (zh: string, en: string) => (locale === 'en' ? en : zh), [locale]);
  const pname = useMemo(
    () => (product: { name: string; nameEn?: string | null }) => (locale === 'en' ? product.nameEn || product.name : product.name),
    [locale]
  );
  const sname = useMemo(() => (item: Store) => (locale === 'en' ? item.nameEn || item.name : item.name), [locale]);
  const spec = useMemo(() => (value: string) => specText(value, locale), [locale]);
  const ostatus = useMemo(
    () => (status: string) => (locale === 'en' ? STATUS_EN[status] || status : {
      unpaid: '待支付',
      pending: '制作中',
      ready: '待取餐',
      awaiting: '待提货',
      delivered: '已交付',
      refunded: '已退款',
      cancelled: '已取消'
    }[status] || status),
    [locale]
  );

  const localeValue: LocaleValue = {
    locale,
    setLocale: (value) => {
      setLocaleState(value);
      notify(value === 'en' ? 'Switched to English' : '已切换为中文');
    },
    t,
    pname,
    sname,
    spec,
    ostatus
  };

  const addFresh = (product: Product, options?: { temp?: string; ice?: string; qty?: number }) => {
    if (product.available === false) {
      notify(t('本店暂时售罄', 'Sold out at this store'), 'warn');
      return;
    }
    const temp = options?.temp || product.temps[0] || '热';
    const ice = options?.ice || (temp === '热' || !product.ice ? '热饮' : '标准冰');
    const qty = options?.qty || 1;
    setFreshCart((lines) => {
      const found = lines.find((line) => line.product.id === product.id && line.temp === temp && line.ice === ice);
      if (found) {
        return lines.map((line) => (line === found ? { ...line, qty: Math.min(20, line.qty + qty) } : line));
      }
      return [...lines, { key: `f${seq.current++}`, product, qty, temp, ice }];
    });
    notify(`${t('已加入', 'Added')} ${pname(product)}`, 'ok');
  };

  const addRetail = (item: RetailAvailability, qty = 1) => {
    const matched = products.find((product) => product.id === item.id);
    setRetailCart((lines) => {
      const found = lines.find((line) => line.item.id === item.id);
      if (found) {
        return lines.map((line) => (line === found ? { ...line, qty: Math.min(20, line.qty + qty) } : line));
      }
      return [...lines, { key: `r${seq.current++}`, item, categoryId: matched?.categoryId, qty }];
    });
    notify(`${t('已加入', 'Added')} ${item.name}`, 'ok');
  };

  const chooseStore = (id: string) => {
    setStoredStore(id);
    setStoreChosen(true);
    setStoreOpen(false);
  };

  const applyTable = (storeId: string, position: string) => {
    setStoredStore(storeId);
    setStoreChosen(true);
    setSeat(position);
    setDining('dine');
    setTableOpen(false);
    const target = stores.find((item) => item.id === storeId);
    notify(
      `${t('已扫桌签', 'Table scanned')}：${target ? sname(target) : ''} · ${spec(position)}，${t('默认店内享用', 'dine-in selected')}`
    );
  };

  const startCheckout = (kind: 'fresh' | 'retail') => {
    if (kind === 'fresh' && !storeChosen) {
      setStoreOpen(true);
      return;
    }
    setCheckoutKind(kind);
    setPayError(null);
    setScreen('checkout');
  };

  const submitOrder = async () => {
    if (!store || !customer) return;
    const kind = checkoutKind;
    if (kind === 'fresh' && !freshCart.length) return;
    if (kind === 'retail' && !retailCart.length) return;
    setPaying(true);
    setPayError(null);
    try {
      const body =
        kind === 'fresh'
          ? {
              storeId: store.id,
              business: 'fresh' as const,
              type: dining,
              seat: dining === 'dine' ? seat : null,
              note,
              memberCode: customer.memberCode,
              items: freshCart.map((line) => ({
                productId: line.product.id,
                qty: line.qty,
                temp: line.temp,
                ice: line.ice
              }))
            }
          : {
              storeId: store.id,
              business: 'retail' as const,
              type: 'retail' as const,
              note,
              items: retailCart.map((line) => ({ productId: line.item.id, qty: line.qty }))
            };
      const result = await api.customerCreateOrder(body);
      setReceiptOrder(result.order);
      setFreshCart([]);
      setRetailCart([]);
      setNote('');
      setConfirmOpen(false);
      setScreen('receipt');
      setOrdersVersion((value) => value + 1);
      if (result.printError) notify(t(`已下单，标签打印未完成：${result.printError}`, `Order placed. Label print failed: ${result.printError}`), 'warn');
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : t('下单失败，请稍后重试', 'Could not place the order'));
    } finally {
      setPaying(false);
    }
  };

  const openReceipt = async (order: Order) => {
    setReceiptOrder(order);
    setScreen('receipt');
    try {
      const result = await api.customerOrder(order.id);
      setReceiptOrder(result.order);
    } catch {
      /* keep the list snapshot */
    }
  };

  const freshQty = freshCart.reduce((n, line) => n + line.qty, 0);
  const retailQty = retailCart.reduce((n, line) => n + line.qty, 0);
  const freshGross = freshCart.reduce((n, line) => n + line.product.priceCents * line.qty, 0);
  const memberCut = freshCart.reduce(
    (n, line) => n + (line.product.memberEligible ? (customer?.discountPerCupCents || 0) * line.qty : 0),
    0
  );
  const retailGross = retailCart.reduce((n, line) => n + line.item.price_cents * line.qty, 0);
  const bagKind: 'fresh' | 'retail' = screen === 'retail' ? 'retail' : 'fresh';
  const bagQty = bagKind === 'retail' ? retailQty : freshQty;
  const bagTotal = bagKind === 'retail' ? retailGross : Math.max(0, freshGross - memberCut);

  const content = () => {
    if (!customer || (!boot.data && boot.loading)) {
      return (
        <div className="mini-pad section-space">
          {error ? (
            <div className="empty">
              <h3>{t('暂时连不上茶席', 'The tea counter is offline')}</h3>
              <p className="small muted">{error}</p>
              <button type="button" className="btn primary" onClick={retry}>
                {t('重新连接', 'Try again')}
              </button>
            </div>
          ) : (
            <Spinner label={t('正在准备茶席', 'Preparing your tea')} />
          )}
        </div>
      );
    }
    if (!store) return null;
    if (screen === 'checkout') {
      return (
        <CheckoutScreen
          store={store}
          storeChosen={storeChosen}
          storeName={storeChosen ? sname(store) : ''}
          kind={checkoutKind}
          freshLines={freshCart}
          retailLines={retailCart}
          dining={dining}
          seat={seat}
          note={note}
          memberCut={memberCut}
          memberDiscount={customer.discountPerCupCents}
          onDining={setDining}
          onSeat={setSeat}
          onNote={setNote}
          onPickStore={() => setStoreOpen(true)}
          onBack={() => setScreen(checkoutKind === 'fresh' ? 'menu' : 'retail')}
          onPay={() => {
            if (!storeChosen) {
              setStoreOpen(true);
              return;
            }
            setPayError(null);
            setConfirmOpen(true);
          }}
          onQty={(key, delta) => {
            if (checkoutKind === 'fresh') {
              setFreshCart((lines) =>
                lines
                  .map((line) => (line.key === key ? { ...line, qty: Math.max(0, Math.min(20, line.qty + delta)) } : line))
                  .filter((line) => line.qty > 0)
              );
            } else {
              setRetailCart((lines) =>
                lines
                  .map((line) => (line.key === key ? { ...line, qty: Math.max(0, Math.min(20, line.qty + delta)) } : line))
                  .filter((line) => line.qty > 0)
              );
            }
          }}
          paying={paying}
          payError={payError}
        />
      );
    }
    if (screen === 'receipt') {
      return (
        <ReceiptScreen
          order={receiptOrder}
          stores={stores}
          onBack={() => setScreen('home')}
          onOrders={() => setScreen('orders')}
        />
      );
    }
    if (screen === 'menu') {
      return (
        <MenuScreen
          store={store}
          storeChosen={storeChosen}
          products={products}
          initialSeries={menuSeries}
          onPickStore={() => setStoreOpen(true)}
          onTable={() => setTableOpen(true)}
          onDetail={setDetail}
        />
      );
    }
    if (screen === 'retail') {
      return (
        <RetailScreen
          categories={categories}
          retail={retail}
          products={products}
          onDetailRetail={(item, categoryId) => {
            const matched = products.find((product) => product.id === item.id);
            setDetail(
              matched
                ? ({ ...matched, kind: 'retail' } as Product)
                : ({
                    id: item.id,
                    name: item.name,
                    nameEn: item.name,
                    series: 'retail',
                    kind: 'retail',
                    categoryId
                  } as Product)
            );
          }}
        />
      );
    }
    if (screen === 'orders') {
      return (
        <OrdersScreen
          orders={orders.data?.orders || []}
          stores={stores}
          loading={orders.loading && !orders.data}
          onOpen={openReceipt}
          onShop={() => setScreen('menu')}
        />
      );
    }
    if (screen === 'profile') {
      return (
        <ProfileScreen
          customer={customer}
          pickups={(orders.data?.orders || []).filter((order) => order.status === 'awaiting').length}
          onMember={() => setMemberOpen(true)}
          onOrders={() => setScreen('orders')}
          onStores={() => setStoreOpen(true)}
          onHelp={() => setHelpOpen(true)}
          onAbout={() => setAboutOpen(true)}
        />
      );
    }
    return (
      <HomeScreen
        store={store}
        storeChosen={storeChosen}
        products={products}
        onPickStore={() => setStoreOpen(true)}
        onTable={() => setTableOpen(true)}
        onSeries={(series) => {
          setMenuSeries(series);
          setScreen('menu');
        }}
        onMenu={() => {
          setMenuSeries('all');
          setScreen('menu');
        }}
        onRetail={() => setScreen('retail')}
        onDetail={setDetail}
        onAdd={addFresh}
      />
    );
  };

  const showBag = bagQty > 0 && !['checkout', 'receipt', 'orders', 'profile'].includes(screen);

  return (
    <LocaleCtx.Provider value={localeValue}>
      <AppTop active="mini" locale={locale} />
      <section className="mini-stage">
        <aside className="preview-copy">
          <div className="eyebrow">FULL愈 · TEA HOUR</div>
          <h1 className="serif">
            {t('不止一杯茶，', 'More than tea.')}
            <br />
            {t('是你的此刻。', 'A little time for yourself.')}
          </h1>
          <p>
            {t('鲜酿，留在此刻。', 'Freshly brewed for now.')}
            <br />
            {t('喜欢的茶，也带回日常。', 'A favourite ritual to take home.')}
          </p>
          <div className="series-dots">
            {(['xing', 'song', 'qing', 'mian'] as Series[]).map((key) => (
              <span key={key} className={`series-dot ${SERIES[key].color}`}>
                {SERIES[key].name}
              </span>
            ))}
          </div>
          <p className="tiny section-space">{t('中英双语 · 多城多店 · 本地演示', 'Bilingual · Multi-city · Local demo')}</p>
        </aside>

        <div className="phone">
          <div className="phone-status">
            <span>9:41</span>
            <span>
              <Icon name="wifi" size={12} />
            </span>
          </div>
          <header className="mini-header">
            <div className="brand">
              <img
                className={`mini-logo ${locale === 'en' ? 'en' : ''}`}
                src={locale === 'en' ? '/assets/logo-en.png' : '/assets/logo-zh.png'}
                alt="Full愈·时叙 TEA HOUR"
              />
            </div>
            <button
              type="button"
              className="language-switch"
              aria-label={t('切换到英文', 'Switch to Chinese')}
              onClick={() => localeValue.setLocale(locale === 'zh' ? 'en' : 'zh')}
            >
              {locale === 'zh' ? 'EN' : '中'}
            </button>
          </header>
          <main className="phone-content" id="phone-content" ref={contentRef}>
            {content()}
          </main>
          {showBag && store ? (
            <div className="bag-bar">
              <div className="bag-icon">
                <Icon name={bagKind === 'retail' ? 'package' : 'bag'} size={24} />
                <span>{bagQty}</span>
              </div>
              <div className="grow">
                <span className="price">{money(bagTotal)}</span>
                <p className="tiny">
                  {bagKind === 'retail'
                    ? t('零售 · 任意店取', 'Retail · Any-store pickup')
                    : storeChosen
                      ? sname(store)
                      : t('鲜酿 · 下单前选店', 'Fresh tea · Choose a store')}
                </p>
              </div>
              <button type="button" onClick={() => startCheckout(bagKind)}>
                {t('选好了', 'Checkout')}
              </button>
            </div>
          ) : null}
          <nav className="nav-bottom" aria-label={t('小程序导航', 'Customer navigation')}>
            {(
              [
                ['home', 'home', t('此刻', 'Now')],
                ['menu', 'cup', t('茶单', 'Tea')],
                ['retail', 'package', t('带回家', 'Take home')],
                ['orders', 'receipt', t('订单', 'Orders')],
                ['profile', 'user', t('我的', 'Me')]
              ] as Array<[Screen, IconName, string]>
            ).map(([key, iconName, label]) => (
              <button
                type="button"
                key={key}
                className={screen === key ? 'active' : ''}
                aria-current={screen === key ? 'page' : undefined}
                onClick={() => setScreen(key)}
              >
                <Icon name={iconName} size={20} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <aside className="preview-note">
          <div className="eyebrow">TWO WAYS TO ENJOY TEA</div>
          <h3>{t('两种日常，同一个时叙', 'Two rituals. One Tea Hour.')}</h3>
          <div className="journey-step">
            <Icon name="cup" size={20} />
            <div>
              <b>{t('鲜酿，即刻享用', 'Fresh tea, made for now')}</b>
              <span>
                {t(
                  '定位或扫桌签 → 支付前确认门店 → 逐杯扫码出餐',
                  'Choose a store → Dine in or takeaway → Ready'
                )}
              </span>
            </div>
          </div>
          <div className="journey-step">
            <Icon name="package" size={20} />
            <div>
              <b>{t('零售，任意门店领取', 'Retail, collect at any store')}</b>
              <span>
                {t(
                  '茶包/盒装茶 → 独立结算 → 提货码核验交付',
                  'Tea bags & boxes → Separate checkout → Store handover'
                )}
              </span>
            </div>
          </div>
          <hr className="divider" />
          <p className="tiny muted">
            {t(
              '中英界面即时切换。示例门店、支付与库存均为本地演示。',
              'Switch language at any time. Stores, payments and inventory are illustrative.'
            )}
          </p>
        </aside>
      </section>

      {storeOpen && store ? (
        <StoreSheet
          stores={stores}
          currentId={store.id}
          onPick={chooseStore}
          onClose={() => setStoreOpen(false)}
        />
      ) : null}
      {tableOpen && store ? (
        <TableSheet
          stores={stores}
          defaultStoreId={store.id}
          onApply={applyTable}
          onClose={() => setTableOpen(false)}
        />
      ) : null}
      {memberOpen && customer ? <MemberSheet customer={customer} onClose={() => setMemberOpen(false)} /> : null}
      {detail ? (
        <ProductSheet
          product={detail}
          onClose={() => setDetail(null)}
          onAdd={(product, options) => {
            if (product.kind === 'retail') {
              const item = retail.find((entry) => entry.id === product.id);
              if (item) addRetail(item, options?.qty || 1);
            } else {
              addFresh(product, options);
            }
            setDetail(null);
          }}
        />
      ) : null}
      {confirmOpen && store ? (
        <Sheet title={t('确认门店', 'Confirm store')} onClose={() => setConfirmOpen(false)}>
          <div className="mini-card pay-store-card">
            <div className="eyebrow">{t('PAYMENT CHECK', 'PAYMENT CHECK')}</div>
            <h3>{sname(store)}</h3>
            <p className="small muted">
              {t(store.address, store.addressEn)} · {store.hours}
            </p>
            <p className="tiny muted section-space">
              {t('鲜酿需到所选门店制作；零售可在任意支持门店领取。', 'Fresh tea is made at this store. Retail can be collected at any supporting store.')}
            </p>
          </div>
          {payError ? <p className="note danger">{payError}</p> : null}
          <div className="sheet-footer">
            <button type="button" className="btn" onClick={() => setStoreOpen(true)}>
              {t('不是这家，换门店', 'Change store')}
            </button>
            <button type="button" className="btn primary" disabled={paying} onClick={submitOrder}>
              {paying ? t('正在支付…', 'Paying…') : t('门店正确，继续支付', 'Confirm and pay')}
            </button>
          </div>
        </Sheet>
      ) : null}
      {helpOpen ? (
        <Sheet title={t('联系与帮助', 'Help & contact')} onClose={() => setHelpOpen(false)}>
          <p className="small">
            {t('如遇出杯、提货或退款问题，请到店联系伙伴；本演示不接入真实客服系统。', 'For cup, pickup or refund questions, please ask a partner in store. This demo has no live support channel.')}
          </p>
          <div className="notice section-space">
            <Icon name="info" size={15} />
            <span>{t('演示环境：支付、打印、会员核验均为模拟。', 'Demo: payment, printing and member checks are simulated.')}</span>
          </div>
        </Sheet>
      ) : null}
      {aboutOpen ? (
        <Sheet title={t('隐私与演示说明', 'Privacy & demo')} onClose={() => setAboutOpen(false)}>
          <p className="small">
            {t('本页不读取真实手机号或个人资料；购物袋仅保存在当前浏览器。', 'No real phone number or personal profile is read. Your bag stays in this browser.')}
          </p>
          <p className="small muted section-space">
            {t('会员码、提货码为本地生成，仅用于演示扫码流程。', 'Member and pickup codes are generated locally for the scan flow.')}
          </p>
        </Sheet>
      ) : null}
    </LocaleCtx.Provider>
  );
}

/* ------------------------------- shared ------------------------------- */

function LocationBar({
  store,
  chosen,
  onPick,
  onTable
}: {
  store: Store;
  chosen: boolean;
  onPick: () => void;
  onTable: () => void;
}) {
  const { t, sname, locale } = useLocale();
  return (
    <div className="location-bar">
      <button type="button" className="store-trigger" onClick={onPick}>
        <Icon name="pin" size={17} />
        <span>
          <strong>{chosen ? sname(store) : t('请选择取茶门店', 'Choose a tea store')}</strong>
          <small>
            {chosen
              ? t('下单前请核对门店', 'Confirm this store at checkout')
              : t('多城多店 · 地点均为示例', 'Multiple cities · Example locations')}
          </small>
        </span>
        <Icon name="chevronRight" size={14} />
      </button>
      <span className="pill">{chosen ? (locale === 'en' ? store.cityEn : store.city) : t('选店', 'Stores')}</span>
      <button type="button" className="text-btn" onClick={onTable}>
        <Icon name="qr" size={15} />
        {t('扫桌签', 'Table QR')}
      </button>
    </div>
  );
}

function PageHeading({ en, title, sub }: { en: string; title: string; sub: string }) {
  return (
    <div className="page-heading">
      <div className="eyebrow">{en}</div>
      <h1 className="serif">{title}</h1>
      <p>{sub}</p>
    </div>
  );
}

/* ------------------------------- home ------------------------------- */

function HomeScreen({
  store,
  storeChosen,
  products,
  onPickStore,
  onTable,
  onSeries,
  onMenu,
  onRetail,
  onDetail,
  onAdd
}: {
  store: Store;
  storeChosen: boolean;
  products: Product[];
  onPickStore: () => void;
  onTable: () => void;
  onSeries: (series: Series) => void;
  onMenu: () => void;
  onRetail: () => void;
  onDetail: (product: Product) => void;
  onAdd: (product: Product, options?: { temp?: string; ice?: string; qty?: number }) => void;
}) {
  const { t, locale } = useLocale();
  const bottle = products.find((product) => product.kind === 'bottle' && product.status === 'published');

  return (
    <>
      <LocationBar store={store} chosen={storeChosen} onPick={onPickStore} onTable={onTable} />
      <section className="tea-hero">
        <div className="eyebrow">A MOMENT, ALL YOURS</div>
        <h2 className="serif">
          {t('一杯茶，', 'A moment.')}
          <br />
          {t('回到此刻。', 'Just for you.')}
        </h2>
        <p>{t('Full愈·时叙 · 纯茶鲜酿', 'Freshly brewed, pure tea')}</p>
        <span className="photo-note">{t('概念视觉', 'Concept image')}</span>
      </section>
      <div className="mini-pad">
        <div className="section-title">
          <h2>{t('这一刻，想怎么过？', 'How is your moment?')}</h2>
          <button type="button" className="text-btn" onClick={onMenu}>
            {t('看茶单', 'Tea menu')}
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
        <div className="series-grid">
          {(['xing', 'song', 'qing', 'mian'] as Series[]).map((key) => {
            const meta = SERIES[key];
            return (
              <button
                type="button"
                key={key}
                className={`series-card ${meta.color}`}
                aria-label={t(`选择${meta.name}系列`, meta.nameEn)}
                onClick={() => onSeries(key)}
              >
                <div className="character">{meta.name}</div>
                <div className="series-en">{meta.nameEn}</div>
                <div className="phrase">{locale === 'en' ? meta.phraseEn : meta.phrase}</div>
                <SeriesMotif series={key} />
                <span className="arrow">
                  <Icon name="arrowRight" size={14} />
                </span>
              </button>
            );
          })}
        </div>
        {bottle ? (
          <button
            type="button"
            className="celebrate-strip"
            onClick={() => onDetail(bottle)}
          >
            <img src="/assets/celebration.jpg" alt={t('瓶装茶概念图', 'Bottle concept')} />
            <div className="grow">
              <div className="eyebrow">CELEBRATE THE EVERYDAY</div>
              <h3>{t('让这一刻，值得碰杯。', 'Here’s to this moment.')}</h3>
              <p>
                {t('庆·瓶装香槟茶', 'Champagne-style tea')} · {money(bottle.priceCents)}
              </p>
            </div>
            <Icon name="arrowRight" size={18} />
          </button>
        ) : null}
        <p className="tiny muted section-space">
          {t('纯茶与香气的探索，不作功效承诺。', 'An exploration of tea and aroma. No health claims.')}
        </p>
      </div>
    </>
  );
}

/* ------------------------------- menu ------------------------------- */

function MenuScreen({
  store,
  storeChosen,
  products,
  initialSeries,
  onPickStore,
  onTable,
  onDetail
}: {
  store: Store;
  storeChosen: boolean;
  products: Product[];
  initialSeries: SeriesFilter;
  onPickStore: () => void;
  onTable: () => void;
  onDetail: (product: Product) => void;
}) {
  const { t, spec } = useLocale();
  const [series, setSeries] = useState<SeriesFilter>(initialSeries);
  const [temp, setTemp] = useState('全部');
  const [query, setQuery] = useState('');
  const [menuAll, setMenuAll] = useState(false);

  useEffect(() => {
    setSeries(initialSeries);
  }, [initialSeries]);

  const teas = products.filter((product) => product.kind !== 'retail' && product.status === 'published');
  let list = teas.filter((product) => series === 'all' || product.series === series);
  if (temp !== '全部') list = list.filter((product) => product.temps.includes(temp));
  if (query) {
    const needle = query.toLowerCase();
    list = list.filter((product) =>
      `${product.name}${product.nameEn || ''}${product.tag}${product.tagEn || ''}`.toLowerCase().includes(needle)
    );
  }
  const total = list.length;
  const shown = !menuAll && !query ? list.slice(0, 3) : list;

  return (
    <>
      <LocationBar store={store} chosen={storeChosen} onPick={onPickStore} onTable={onTable} />
      <PageHeading
        en="THE TEA MENU"
        title={t('喜欢的茶，直接点。', 'Find your kind of tea.')}
        sub={t('四个系列，五种香气线索。', 'Four moments. Five aroma inspirations.')}
      />
      <div className="chips">
        {([['all', t('全部', 'All')], ...(['xing', 'song', 'qing', 'mian'] as Series[]).map((key) => [key, SERIES[key].name])] as Array<[string, string]>).map(
          ([key, label]) => (
            <button
              type="button"
              key={key}
              className={series === key ? 'active' : ''}
              onClick={() => {
                setSeries(key as SeriesFilter);
                setMenuAll(false);
              }}
            >
              {label}
            </button>
          )
        )}
      </div>
      <div className="search">
        <Icon name="search" size={16} />
        <input
          aria-label={t('搜索茶名或风味', 'Search teas or aromas')}
          placeholder={t('找茶名，或喜欢的香气', 'Search a tea or an aroma')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="chips">
        {['全部', '热', '冰'].map((value) => (
          <button
            type="button"
            key={value}
            className={temp === value ? 'active' : ''}
            onClick={() => setTemp(value)}
          >
            {value === '全部' ? t('冷热都可以', 'All temperatures') : spec(value)}
          </button>
        ))}
      </div>
      <div className="product-list">
        {shown.length ? (
          shown.map((product) => <ProductRow key={product.id} product={product} onOpen={() => onDetail(product)} />)
        ) : (
          <div className="empty">
            <Icon name="cup" size={35} />
            <h3>{t('这一刻，换一种选择', 'Try another choice')}</h3>
            <p className="small">{t('当前筛选下没有茶饮。', 'No teas match these filters.')}</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSeries('all');
                setTemp('全部');
                setQuery('');
              }}
            >
              {t('清除筛选', 'Clear filters')}
            </button>
          </div>
        )}
        {!menuAll && total > 3 ? (
          <button type="button" className="text-btn full" onClick={() => setMenuAll(true)}>
            {t('查看本系列全部', 'See the full series')}
          </button>
        ) : null}
      </div>
      <div className="mini-pad section-space">
        <p className="tiny muted">
          {t('香气为研发灵感，不代表加入精油；名称、价格与配方均为草案。', 'Aromas are inspiration, not essential-oil ingredients. Names, prices and recipes are provisional.')}
        </p>
      </div>
    </>
  );
}

function ProductRow({ product, onOpen }: { product: Product; onOpen: () => void }) {
  const { t, pname, spec } = useLocale();
  const sold = product.available === false;
  return (
    <article className="product-row">
      <ProductArt product={product} />
      <div className="grow">
        <button type="button" className="product-hit" onClick={onOpen}>
          <h3>{pname(product)}</h3>
          <p className="tag">
            {t(product.tag, product.tagEn || product.nameEn || product.tag)}
            {product.kind === 'tea' ? ` · ${product.temps.map(spec).join(' / ')}` : ''}
          </p>
        </button>
        <div className="flex between">
          <div>
            <span className="price">{money(product.priceCents)}</span>
            <span className="tiny muted"> / {t(product.unit, product.unitEn || product.unit)}</span>
            {product.memberEligible ? (
              <div className="tiny muted">{t('大会员可按杯立减', 'Member savings per cup')}</div>
            ) : null}
          </div>
          <button
            type="button"
            className={sold ? 'pill' : 'add-btn'}
            aria-label={`${t('选择', 'Choose ')}${pname(product)}`}
            disabled={sold}
            onClick={onOpen}
          >
            {sold ? t('售罄', 'Sold out') : <Icon name="plus" size={18} />}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------- retail ------------------------------- */

function RetailScreen({
  categories,
  retail,
  products,
  onDetailRetail
}: {
  categories: Category[];
  retail: RetailAvailability[];
  products: Product[];
  onDetailRetail: (item: RetailAvailability, categoryId?: string) => void;
}) {
  const { t } = useLocale();
  const [category, setCategory] = useState('all');
  const retailCats = categories.filter((item) => item.kind === 'retail');
  const categoryOf = (id: string) => products.find((product) => product.id === id)?.categoryId;
  const list = retail.filter((item) => category === 'all' || categoryOf(item.id) === category);
  const feature = products.find((product) => product.kind === 'retail' && product.status === 'published');

  return (
    <>
      <div className="retail-intro">
        <div className="grow">
          <div className="eyebrow">A RITUAL TO TAKE HOME</div>
          <h1 className="serif">
            {t('喜欢的茶，', 'Take a little')}
            <br />
            {t('留在日常。', 'ritual home.')}
          </h1>
          <p className="small">{t('茶包 · 手冲 · 盒装茶', 'Tea bags · Pour-over · Tea boxes')}</p>
        </div>
        {feature ? (
          <ProductArt product={feature} />
        ) : (
          <ProductArt product={{ id: 'retail', name: '时叙茶盒', series: 'retail', kind: 'retail', categoryId: 'boxes' }} />
        )}
      </div>
      <div className="mini-pad">
        <div className="pickup-promise">
          <Icon name="store" size={21} />
          <div>
            <strong>{t('下单后，任意门店领取', 'Order here. Collect at any store.')}</strong>
            <p>{t('只支持门店领取，暂不邮寄。到店前可查看各店现货。', 'Store pickup only. No shipping. Check store stock before visiting.')}</p>
          </div>
        </div>
      </div>
      <div className="chips">
        {[{ id: 'all', name: '全部', nameEn: 'All' }, ...retailCats].map((item) => (
          <button
            type="button"
            key={item.id}
            className={category === item.id ? 'active' : ''}
            onClick={() => setCategory(item.id)}
          >
            {t(item.name, item.nameEn)}
          </button>
        ))}
      </div>
      <div className="product-list">
        {list.length ? (
          list.map((item) => (
            <article className="product-row" key={item.id}>
              <ProductArt
                product={{
                  id: item.id,
                  name: item.name,
                  series: 'retail',
                  kind: 'retail',
                  categoryId: categoryOf(item.id)
                }}
              />
              <div className="grow">
                <button type="button" className="product-hit" onClick={() => onDetailRetail(item, categoryOf(item.id))}>
                  <h3>{item.name}</h3>
                  <p className="tag">
                    {t('零售装', 'Retail pack')} · {t('任意门店领取', 'Any-store pickup')}
                  </p>
                </button>
                <div className="flex between">
                  <div>
                    <span className="price">{money(item.price_cents)}</span>
                    <div className="tiny muted">
                      {t(`合计 ${Math.round(item.totalStock)}g · ${item.stores} 家门店`, `${Math.round(item.totalStock)}g total · ${item.stores} stores`)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="add-btn"
                    aria-label={`${t('选择', 'Choose ')}${item.name}`}
                    onClick={() => onDetailRetail(item, categoryOf(item.id))}
                  >
                    <Icon name="plus" size={18} />
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="empty">
            <Icon name="package" size={35} />
            <h3>{t('新品正在路上', 'More tea is on its way')}</h3>
            <p className="small">{t('这个分类还没有上架商品。', 'No published items in this category yet.')}</p>
          </div>
        )}
      </div>
      <div className="mini-pad section-space">
        <p className="note">
          {t(
            '零售与鲜酿分开结算，各自购物袋都会保留。价格与包装规格为演示草案。',
            'Retail and fresh tea have separate bags and checkouts. Both bags are saved. Prices and packaging are illustrative.'
          )}
        </p>
      </div>
    </>
  );
}

/* ------------------------------- checkout ------------------------------- */

function CheckoutScreen({
  store,
  storeChosen,
  storeName,
  kind,
  freshLines,
  retailLines,
  dining,
  seat,
  note,
  memberCut,
  memberDiscount,
  onDining,
  onSeat,
  onNote,
  onPickStore,
  onBack,
  onPay,
  onQty,
  paying,
  payError
}: {
  store: Store;
  storeChosen: boolean;
  storeName: string;
  kind: 'fresh' | 'retail';
  freshLines: FreshLine[];
  retailLines: RetailLine[];
  dining: 'dine' | 'takeaway';
  seat: string;
  note: string;
  memberCut: number;
  memberDiscount: number;
  onDining: (value: 'dine' | 'takeaway') => void;
  onSeat: (value: string) => void;
  onNote: (value: string) => void;
  onPickStore: () => void;
  onBack: () => void;
  onPay: () => void;
  onQty: (key: string, delta: number) => void;
  paying: boolean;
  payError: string | null;
}) {
  const { t, pname, spec } = useLocale();
  const retail = kind === 'retail';
  const gross = retail
    ? retailLines.reduce((n, line) => n + line.item.price_cents * line.qty, 0)
    : freshLines.reduce((n, line) => n + line.product.priceCents * line.qty, 0);
  const total = retail ? gross : Math.max(0, gross - memberCut);
  const empty = retail ? !retailLines.length : !freshLines.length;

  return (
    <>
      <PageHeading
        en="YOUR ORDER"
        title={t('确认这一单', 'Make it yours.')}
        sub={retail ? t('零售 · 任意门店领取', 'Retail · Pickup at any store') : t('鲜酿 · 请核对门店和用餐方式', 'Fresh tea · Confirm your store and serving choice')}
      />
      {empty ? (
        <div className="empty">
          <Icon name="bag" size={35} />
          <h3>{t('购物袋还是空的', 'Your bag is empty')}</h3>
          <p className="small">{t('先去选喜欢的茶吧。', 'Find something you love.')}</p>
          <button type="button" className="btn primary" onClick={onBack}>
            {t('继续选购', 'Browse tea')}
          </button>
        </div>
      ) : (
        <>
          {retail ? (
            <section className="mini-card pickup-promise">
              <Icon name="package" size={24} />
              <div>
                <strong>{t('任意门店领取 · 不邮寄', 'Any-store pickup · No shipping')}</strong>
                <p>
                  {t(
                    '领取时出示 4 位提货码；伙伴扫码或输入后交付。缺货可调货或到其他门店领取。',
                    'Show your 4-digit pickup code. A partner scans or enters it. Stock may vary across stores.'
                  )}
                </p>
              </div>
            </section>
          ) : (
            <section className="mini-card">
              <div className="flex between">
                <div>
                  <h3>{storeChosen ? storeName : t('尚未选择门店', 'No store selected')}</h3>
                  <p className="tiny muted">
                    {storeChosen ? t(store.address, store.addressEn) : t('请选择实际到访的门店', 'Choose the store you will visit')}
                  </p>
                </div>
                <button type="button" className="text-btn" onClick={onPickStore}>
                  {t('更换', 'Change')}
                </button>
              </div>
              <div className="mode-toggle checkout-mode">
                <button type="button" className={dining === 'dine' ? 'active' : ''} onClick={() => onDining('dine')}>
                  {t('店内享用', 'Dine in')}
                </button>
                <button type="button" className={dining === 'takeaway' ? 'active' : ''} onClick={() => onDining('takeaway')}>
                  {t('现场外带', 'Takeaway')}
                </button>
              </div>
              {dining === 'dine' ? (
                <>
                  <div className="flex between small">
                    <span>{t('送到你的位置', 'Your seat')}</span>
                  </div>
                  <div className="options section-space">
                    {store.positions.map((position) => (
                      <button
                        type="button"
                        key={position}
                        className={`option ${seat === position ? 'selected' : ''}`}
                        onClick={() => onSeat(position)}
                      >
                        {spec(position)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="tiny muted">{t('做好后到出餐口自取，不配送。', 'Collect at the counter when ready. No delivery.')}</p>
              )}
              <hr className="divider" />
              <div className="store-ack">
                <Icon name="shield" size={16} />
                <span>{t('支付前会再次弹出门店确认，避免选错门店。', 'We will confirm this store again before payment.')}</span>
              </div>
            </section>
          )}
          <section className="mini-card">
            {retail
              ? retailLines.map((line) => (
                  <div className="checkout-item" key={line.key}>
                    <ProductArt
                      product={{
                        id: line.item.id,
                        name: line.item.name,
                        series: 'retail',
                        kind: 'retail',
                        categoryId: line.categoryId
                      }}
                    />
                    <div className="grow">
                      <h3>{line.item.name}</h3>
                      <p className="tiny muted">
                        {t('零售装', 'Retail pack')} · {t('任意门店领取', 'Any-store pickup')}
                      </p>
                      <span className="small">{money(line.item.price_cents * line.qty)}</span>
                    </div>
                    <div className="qty">
                      <button type="button" className="cart-qty" aria-label={t('减少', 'Decrease')} onClick={() => onQty(line.key, -1)}>
                        <Icon name="minus" size={12} />
                      </button>
                      <span>{line.qty}</span>
                      <button type="button" className="cart-qty" aria-label={t('增加', 'Increase')} onClick={() => onQty(line.key, 1)}>
                        <Icon name="plus" size={12} />
                      </button>
                    </div>
                  </div>
                ))
              : freshLines.map((line) => (
                  <div className="checkout-item" key={line.key}>
                    <ProductArt product={line.product} />
                    <div className="grow">
                      <h3>{pname(line.product)}</h3>
                      <p className="tiny muted">
                        {[line.temp, line.temp === '热' ? '' : line.ice].filter(Boolean).map(spec).join(' · ')}
                      </p>
                      <span className="small">{money(line.product.priceCents * line.qty)}</span>
                    </div>
                    <div className="qty">
                      <button type="button" className="cart-qty" aria-label={t('减少', 'Decrease')} onClick={() => onQty(line.key, -1)}>
                        <Icon name="minus" size={12} />
                      </button>
                      <span>{line.qty}</span>
                      <button type="button" className="cart-qty" aria-label={t('增加', 'Increase')} onClick={() => onQty(line.key, 1)}>
                        <Icon name="plus" size={12} />
                      </button>
                    </div>
                  </div>
                ))}
          </section>
          <section className="mini-card">
            {retail ? null : (
              <>
                {memberDiscount > 0 ? (
                  <span className="pill green">{t('已应用大会员演示权益', 'Demo member savings applied')}</span>
                ) : null}
              </>
            )}
            <div className="bill-line">
              <span>{t('商品金额', 'Subtotal')}</span>
              <span>{money(gross)}</span>
            </div>
            {memberCut ? (
              <div className="bill-line">
                <span>{t('大会员单杯权益', 'Member savings')}</span>
                <span>−{money(memberCut)}</span>
              </div>
            ) : null}
            <div className="bill-line bill-total">
              <span>{t('合计', 'Total')}</span>
              <strong>{money(total)}</strong>
            </div>
          </section>
          <div className="mini-pad">
            <label className="small muted" htmlFor="order-note">
              {t('给门店的话（选填）', 'A note for the store (optional)')}
            </label>
            <input
              id="order-note"
              className="section-space"
              value={note}
              maxLength={120}
              placeholder={t('例如少冰、分杯、加杯套', 'e.g. less ice, separate cups')}
              onChange={(event) => onNote(event.target.value)}
            />
            {payError ? <p className="note danger section-space">{payError}</p> : null}
            <button type="button" className="btn primary full section-space" disabled={paying} onClick={onPay}>
              {paying ? t('正在支付…', 'Paying…') : `${t('模拟微信支付', 'Simulate WeChat Pay')} · ${money(total)}`}
            </button>
            <p className="tiny muted centered section-space">
              {t('不会实际扣款，无需手机号。', 'No real charge. No phone number required.')}
            </p>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------- receipt ------------------------------- */

function ReceiptScreen({
  order,
  stores,
  onBack,
  onOrders
}: {
  order: Order | null;
  stores: Store[];
  onBack: () => void;
  onOrders: () => void;
}) {
  const { t, locale, pname, sname, spec, ostatus } = useLocale();
  if (!order) {
    return (
      <div className="empty">
        <h3>{t('还没有这笔订单', 'Order not found')}</h3>
        <p className="small">{t('可先选茶体验下单。', 'Choose a tea to begin.')}</p>
      </div>
    );
  }
  const retail = order.business === 'retail';
  const ready = order.status === 'ready';
  const done = order.status === 'delivered';
  const refunded = order.status === 'refunded';
  const units = (order.units || []).filter((unit) => unit.status !== 'refunded');
  const scanned = units.filter((unit) => unit.scannedAt || unit.status === 'ready').length;
  const pickupStore = stores.find((item) => item.id === order.pickupStoreId);

  return (
    <section className="receipt">
      <div className="receipt-circle">
        <Icon name={refunded ? 'refresh' : done || ready ? 'check' : retail ? 'package' : 'cup'} size={27} />
      </div>
      <div className="eyebrow">{retail ? 'A RITUAL TO TAKE HOME' : 'MADE FOR THIS MOMENT'}</div>
      <h2>
        {refunded
          ? t('本单已退款', 'This order is refunded')
          : retail
            ? done
              ? t('已交付，愿茶香常伴。', 'Collected. Enjoy your tea.')
              : t('喜欢的茶，等你带回家。', 'Your tea is waiting for you.')
            : ready
              ? t('你的茶，准备好了。', 'Your tea is ready.')
              : t('茶正在准备，请稍坐。', 'Your tea is being prepared.')}
      </h2>
      <p className="small muted">
        {retail
          ? done
            ? sname(pickupStore || stores[0])
            : t('任意门店领取 · 不支持邮寄', 'Pickup at any store · No shipping')
          : `${sname(stores.find((item) => item.id === order.storeId) || stores[0])} · ${orderLabel(order, locale, t)}`}
      </p>
      <div className={`order-number ${retail ? 'long' : ''}`}>{order.number}</div>
      {retail && !refunded ? (
        <div className="pickup-box">
          <span className="tiny muted">{t('提货码 · 到店出示', 'Pickup code · Show in store')}</span>
          <strong className="pickup-code full">{order.pickupCode || '—'}</strong>
          <div className="qr-wrap">
            <QrImage value={order.pickupCode || order.number} label={t('提货二维码', 'Pickup QR')} className="qr-svg" />
          </div>
          <p className="tiny muted">
            {t('伙伴扫描此码，或输入 4 位提货码后交付。', 'A partner scans this code or enters the four digits.')}
          </p>
        </div>
      ) : null}
      {!retail && units.length ? (
        <div className="cup-progress">
          <div className="flex between">
            <strong>{t('逐杯进度', 'Cup progress')}</strong>
            <span className={`pill ${scanned === units.length ? 'green' : ''}`}>
              {scanned}/{units.length}
            </span>
          </div>
          {units.map((unit) => (
            <div className={`cup-row ${unit.status}`} key={unit.id}>
              <span className="cup-no">{unit.label.slice(0, 2)}</span>
              <span className="grow">{unit.label}</span>
              {unit.scannedAt || unit.status === 'ready' ? (
                <span className="pill green">{t('已出餐', 'Ready')}</span>
              ) : (
                <span className="pill">{t('待制作', 'Pending')}</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
      <p className="small muted">
        {retail
          ? done
            ? t('提货码已核验，其他门店不可重复领取。', 'Pickup verified. Other stores cannot hand over again.')
            : t('伙伴核验提货码后交付，请当面确认品项。', 'A partner verifies the code before handover.')
          : t('逐杯扫码，全部完成后整单自动出餐。', 'Each cup is scanned; the order is ready when all cups are done.')}
      </p>
      <div className="steps">
        <span className="done">{t('已支付', 'Paid')}</span>
        <span className={!refunded ? 'done' : ''}>{retail ? t('待领取', 'To collect') : t('待出餐', 'Preparing')}</span>
        <span className={ready || done ? 'done' : ''}>{retail ? t('已交付', 'Collected') : t('已出餐', 'Ready')}</span>
      </div>
      <div className="mini-card">
        {order.items.map((item) => (
          <div className="bill-line" key={item.id}>
            <span>
              {locale === 'en' ? item.nameEn || item.name : item.name} ×{item.qty}
              {item.refundedQty ? ` (${t('已退', 'Refunded ')}${item.refundedQty})` : ''}
            </span>
            <span>{item.temp ? spec(item.temp) : ''}</span>
          </div>
        ))}
        <hr className="divider" />
        <div className="bill-line">
          <span>{t('净支付 · 模拟', 'Net payment · Demo')}</span>
          <strong>{money(order.totalCents - order.refundedCents)}</strong>
        </div>
        <p className="tiny muted">{ostatus(order.status)}</p>
      </div>
      <button type="button" className="text-btn full" onClick={onOrders}>
        {t('我的订单', 'My orders')}
      </button>
      <button type="button" className="btn primary full" onClick={onBack}>
        {t('回到此刻', 'Back to now')}
      </button>
      <p className="tiny muted section-space">
        {retail
          ? t('领取后全门店同步，避免重复交付。', 'Handover status is shared across stores.')
          : t('鲜酿不设置领取核销，已出餐不等于已领取。', 'Fresh tea needs no collection check-off. Ready does not mean collected.')}
      </p>
    </section>
  );
}

/* ------------------------------- orders ------------------------------- */

function OrdersScreen({
  orders,
  stores,
  loading,
  onOpen,
  onShop
}: {
  orders: Order[];
  stores: Store[];
  loading: boolean;
  onOpen: (order: Order) => void;
  onShop: () => void;
}) {
  const { t, sname, ostatus } = useLocale();
  const [kind, setKind] = useState<'all' | 'fresh' | 'retail' | 'awaiting'>('all');
  const list = orders.filter((order) => {
    if (kind === 'all') return true;
    if (kind === 'awaiting') return order.business === 'retail' && order.status === 'awaiting';
    return order.business === kind;
  });

  return (
    <>
      <PageHeading
        en="YOUR MOMENTS"
        title={t('每一杯，都有回响。', 'Your moments, saved.')}
        sub={t('鲜酿和零售分别记录。', 'Fresh tea and retail, clearly separated.')}
      />
      <div className="chips">
        {(
          [
            ['all', t('全部', 'All')],
            ['fresh', t('鲜酿', 'Fresh tea')],
            ['retail', t('零售记录', 'Retail')],
            ['awaiting', t('待领取', 'To collect')]
          ] as Array<['all' | 'fresh' | 'retail' | 'awaiting', string]>
        ).map(([key, label]) => (
          <button type="button" key={key} className={kind === key ? 'active' : ''} onClick={() => setKind(key)}>
            {label}
          </button>
        ))}
      </div>
      {loading ? <Spinner label={t('正在读取订单', 'Loading orders')} /> : null}
      {!loading && !list.length ? (
        <div className="empty">
          <Icon name="receipt" size={35} />
          <h3>{t('第一杯，还在等你', 'Your first moment awaits')}</h3>
          <p className="small">{t('模拟支付后，订单会出现在这里。', 'Your simulated orders will appear here.')}</p>
          <button type="button" className="btn" onClick={onShop}>
            {t('去茶单看看', 'Browse tea')}
          </button>
        </div>
      ) : null}
      {list.map((order) => (
        <section className="mini-card" key={order.id}>
          <div className="flex between">
            <h3>{order.number}</h3>
            <span className={`pill ${['ready', 'delivered'].includes(order.status) ? 'green' : ''}`}>{ostatus(order.status)}</span>
          </div>
          <p className="small muted">
            {order.business === 'retail'
              ? t('零售 · 任意门店领取', 'Retail · Any-store pickup')
              : sname(stores.find((store) => store.id === order.storeId) || ({ id: order.storeId, name: order.storeName, nameEn: order.storeName } as Store))}
          </p>
          <p className="small section-space">
            {order.items.map((item) => `${item.name} ×${item.qty}`).join(' / ')}
          </p>
          <div className="flex between">
            <strong>{money(order.totalCents - order.refundedCents)}</strong>
            <button type="button" className="text-btn" onClick={() => onOpen(order)}>
              {t('查看订单', 'View order')}
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
        </section>
      ))}
    </>
  );
}

/* ------------------------------- profile ------------------------------- */

function ProfileScreen({
  customer,
  pickups,
  onMember,
  onOrders,
  onStores,
  onHelp,
  onAbout
}: {
  customer: Customer;
  pickups: number;
  onMember: () => void;
  onOrders: () => void;
  onStores: () => void;
  onHelp: () => void;
  onAbout: () => void;
}) {
  const { t, locale, setLocale } = useLocale();
  const member = customer.discountPerCupCents > 0;
  return (
    <>
      <PageHeading
        en="A FULLER EVERYDAY"
        title={t('我的日常', 'Your everyday.')}
        sub={t('留点时间，给自己。', 'A little time for yourself.')}
      />
      <section className="mini-card profile-identity">
        <div className="profile-row">
          <span className="profile-avatar">
            <Icon name="user" size={28} />
          </span>
          <div className="grow">
            <strong>{customer.name}</strong>
            <small>{t('本地演示账户 · 无需手机号', 'Local demo account · No phone required')}</small>
          </div>
          <button
            type="button"
            className="icon-btn qr-shortcut"
            aria-label={t('打开会员码', 'Open member code')}
            title={t('会员码', 'Member code')}
            onClick={onMember}
          >
            <Icon name="qr" size={19} />
          </button>
          <button type="button" className="profile-edit-link" onClick={onMember}>
            {t('编辑', 'Edit')}
            <Icon name="chevronRight" size={15} />
          </button>
        </div>
      </section>
      <section className="member-card">
        <div className="eyebrow">FULL愈 MEMBERSHIP</div>
        <h2 className="serif">
          {member ? t('这一年，常常相见。', 'A year of little rituals.') : t('一份会员，更多日常。', 'One membership. More moments.')}
        </h2>
        <p>{t('全品牌共享身份与积分 · 接口模拟', 'One identity and points balance · Simulated')}</p>
        <button type="button" className="btn" onClick={onMember}>
          {member ? t('查看会员权益', 'View benefits') : t('了解大会员', 'Explore membership')}
        </button>
      </section>
      <div className="profile-assets">
        <button type="button" className="asset-item" onClick={onMember}>
          <strong>{money(customer.discountPerCupCents)}</strong>
          <span>{t('每杯立减', 'Per cup')}</span>
        </button>
        <button type="button" className="asset-item" onClick={onMember}>
          <strong>1</strong>
          <span>{t('会员码', 'Member code')}</span>
        </button>
        <button type="button" className="asset-item" onClick={onOrders}>
          <strong>{pickups}</strong>
          <span>{t('待领取', 'To collect')}</span>
        </button>
      </div>
      <section className="mini-card menu-group">
        <button type="button" className="profile-menu" onClick={onOrders}>
          <Icon name="receipt" size={19} />
          <span className="grow">{t('我的订单', 'My orders')}</span>
          <Icon name="chevronRight" size={15} />
        </button>
        <button type="button" className="profile-menu" onClick={onStores}>
          <Icon name="pin" size={19} />
          <span className="grow">{t('门店与营业时间', 'Stores & hours')}</span>
          <Icon name="chevronRight" size={15} />
        </button>
        <button type="button" className="profile-menu" onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>
          <Icon name="settings" size={19} />
          <span className="grow">{t('语言 / Language', 'Language / 语言')}</span>
          <Icon name="chevronRight" size={15} />
        </button>
        <button type="button" className="profile-menu" onClick={onHelp}>
          <Icon name="info" size={19} />
          <span className="grow">{t('联系与帮助', 'Help & contact')}</span>
          <Icon name="chevronRight" size={15} />
        </button>
        <button type="button" className="profile-menu" onClick={onAbout}>
          <Icon name="shield" size={19} />
          <span className="grow">{t('隐私与演示说明', 'Privacy & demo information')}</span>
          <Icon name="chevronRight" size={15} />
        </button>
      </section>
      <div className="mini-pad">
        <p className="note">
          {t(
            '不做储值；账户、积分与会员为本地模拟，未读取在场的真实个人资料。',
            'No stored-value wallet. Account, points and membership are local demos. No real personal profile is accessed.'
          )}
        </p>
      </div>
    </>
  );
}

/* ------------------------------- sheets ------------------------------- */

function Sheet({
  title,
  wide,
  onClose,
  children
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet ${wide ? 'wide' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="sheet-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="关闭"
          onClick={() => {
            ref.current?.close();
            onClose();
          }}
        >
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}

function StoreSheet({
  stores,
  currentId,
  onPick,
  onClose
}: {
  stores: Store[];
  currentId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t, locale, sname } = useLocale();
  const cities = Array.from(new Set(stores.map((store) => (locale === 'en' ? store.cityEn : store.city))));
  const [city, setCity] = useState(
    stores.find((store) => store.id === currentId)
      ? locale === 'en'
        ? stores.find((store) => store.id === currentId)!.cityEn
        : stores.find((store) => store.id === currentId)!.city
      : cities[0] || ''
  );
  const list = stores.filter((store) => (locale === 'en' ? store.cityEn : store.city) === city);
  return (
    <Sheet title={t('选择取茶门店', 'Choose a tea store')} onClose={onClose}>
      <p className="note">
        {t('跨城多店 · 地点均为示例。鲜酿在所选门店制作，零售可在任意门店领取。', 'Multi-city demo. Fresh tea is made at the selected store; retail can be collected anywhere.')}
      </p>
      <div className="chips section-space">
        {cities.map((item) => (
          <button type="button" key={item} className={city === item ? 'active' : ''} onClick={() => setCity(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="store-options">
        {list.map((store) => (
          <div className={`store-option ${store.id === currentId ? 'chosen' : ''}`} key={store.id}>
            <div className="grow">
              <strong>
                {sname(store)}
                {store.id === currentId ? <span className="pill green">{t('当前', 'Current')}</span> : null}
              </strong>
              <p className="tiny muted">
                {t(store.address, store.addressEn)} · {store.hours}
              </p>
            </div>
            <button type="button" className={store.id === currentId ? 'btn' : 'btn primary'} onClick={() => onPick(store.id)}>
              {store.id === currentId ? t('已选择', 'Selected') : t('选择', 'Choose')}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function TableSheet({
  stores,
  defaultStoreId,
  onApply,
  onClose
}: {
  stores: Store[];
  defaultStoreId: string;
  onApply: (storeId: string, position: string) => void;
  onClose: () => void;
}) {
  const { t, spec } = useLocale();
  const [storeId, setStoreId] = useState(defaultStoreId);
  const store = stores.find((item) => item.id === storeId) || stores[0];
  const [position, setPosition] = useState(store?.positions[0] || '吧台01');

  useEffect(() => {
    if (store && !store.positions.includes(position)) setPosition(store.positions[0] || '吧台01');
  }, [storeId, store?.id]);

  return (
    <Sheet title={t('扫描桌签', 'Scan table QR')} onClose={onClose}>
      <div className="scan-frame">
        <span className="scan-corners" aria-hidden="true" />
        <Icon name="qr" size={58} />
        <p className="tiny muted">{t('把桌签上的二维码放进取景框', 'Place the table QR inside the frame')}</p>
      </div>
      <p className="note section-space">
        {t(
          '扫码后自动带入门店与桌号，并默认店内享用；也可以手动选择，模拟扫码结果。',
          'Scanning fills in the store and table and selects dine-in. You can also choose manually to simulate a scan.'
        )}
      </p>
      <div className="form-row">
        <label htmlFor="table-store">{t('门店', 'Store')}</label>
        <select id="table-store" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
          {stores.map((item) => (
            <option key={item.id} value={item.id}>
              {t(item.name, item.nameEn)}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="table-seat">{t('桌号', 'Table')}</label>
        <select id="table-seat" value={position} onChange={(event) => setPosition(event.target.value)}>
          {(store?.positions || []).map((item) => (
            <option key={item} value={item}>
              {spec(item)}
            </option>
          ))}
        </select>
      </div>
      <div className="sheet-footer">
        <button type="button" className="btn" onClick={onClose}>
          {t('取消', 'Cancel')}
        </button>
        <button type="button" className="btn primary" onClick={() => onApply(storeId, position)}>
          {t('确认桌号', 'Confirm table')}
        </button>
      </div>
    </Sheet>
  );
}

function MemberSheet({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { t } = useLocale();
  const member = customer.discountPerCupCents > 0;
  return (
    <Sheet title={t('会员码', 'Member code')} onClose={onClose}>
      <div className="member-code-sheet">
        <div className="eyebrow">FULL愈 MEMBERSHIP</div>
        <div className="member-qr">
          <QrImage value={customer.memberCode} label={t('会员二维码', 'Member QR')} className="member-qr-img" />
        </div>
        <strong className="member-code">{customer.memberCode}</strong>
        <p className="tiny muted">{t('向门店伙伴出示，核验后享受会员权益。', 'Show this to a partner to apply member benefits.')}</p>
        <span className={`pill ${member ? 'green' : ''}`}>
          {member ? t(`每杯减 ¥${(customer.discountPerCupCents / 100).toFixed(0)}`, `¥${(customer.discountPerCupCents / 100).toFixed(0)} off per cup`) : t('普通会员', 'Member')}
        </span>
        <button type="button" className="btn primary full section-space" onClick={onClose}>
          {t('收好', 'Done')}
        </button>
      </div>
    </Sheet>
  );
}

function ProductSheet({
  product,
  onClose,
  onAdd
}: {
  product: Product;
  onClose: () => void;
  onAdd: (product: Product, options?: { temp?: string; ice?: string; qty?: number }) => void;
}) {
  const { t, pname, spec } = useLocale();
  const retail = product.kind === 'retail';
  const [temp, setTemp] = useState(product.temps?.[0] || '热');
  const [ice, setIce] = useState(product.ice ? '标准冰' : '热饮');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (temp === '热' || !product.ice) setIce('热饮');
    else setIce((current) => (current === '热饮' ? '标准冰' : current));
  }, [temp, product.ice]);

  return (
    <Sheet title={retail ? t('零售商品', 'Retail item') : t('选择这一杯', 'Choose your cup')} onClose={onClose}>
      <div className={`product-showcase ${SERIES[product.series]?.color || 'retail'}`}>
        <ProductArt product={product} className="sheet-art" />
      </div>
      <h3 className="serif">{pname(product)}</h3>
      <p className="small muted">
        {t(product.tag || product.spec, product.tagEn || product.specEn || product.nameEn || '')}
      </p>
      {!retail && product.temps?.length ? (
        <>
          <div className="option-title">{t('温度', 'Temperature')}</div>
          <div className="options">
            {product.temps.map((item) => (
              <button type="button" key={item} className={`option ${temp === item ? 'selected' : ''}`} onClick={() => setTemp(item)}>
                {spec(item)}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {!retail && product.ice && temp !== '热' ? (
        <>
          <div className="option-title">{t('冰量', 'Ice')}</div>
          <div className="options">
            {['标准冰', '少冰', '去冰'].map((item) => (
              <button type="button" key={item} className={`option ${ice === item ? 'selected' : ''}`} onClick={() => setIce(item)}>
                {spec(item)}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <p className="note section-space">
        {retail
          ? t('下单后获得 4 位提货码，可在任意支持零售的门店领取。', 'After payment you get a 4-digit pickup code for any supporting store.')
          : t('香气为研发灵感；投茶量与温度由门店按标准执行。', 'Aromas are inspiration; dose and temperature follow the store standard.')}
      </p>
      <div className="sheet-footer">
        <div className="qty">
          <button type="button" className="cart-qty" aria-label={t('减少', 'Decrease')} onClick={() => setQty((value) => Math.max(1, value - 1))}>
            <Icon name="minus" size={12} />
          </button>
          <span>{qty}</span>
          <button type="button" className="cart-qty" aria-label={t('增加', 'Increase')} onClick={() => setQty((value) => Math.min(20, value + 1))}>
            <Icon name="plus" size={12} />
          </button>
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={product.available === false}
          onClick={() => onAdd(product, { temp, ice, qty })}
        >
          {product.available === false
            ? t('本店售罄', 'Sold out')
            : `${t('加入购物袋', 'Add to bag')} · ${money(product.priceCents * qty)}`}
        </button>
      </div>
    </Sheet>
  );
}

function QrImage({ value, label, className }: { value: string; label: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    QRCode.toDataURL(value, { width: 520, margin: 1, color: { dark: '#352f2b', light: '#fffefa' } })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (src) return <img className={className} src={src} alt={label} />;
  return <span className="tiny muted">{failed ? label : '…'}</span>;
}
