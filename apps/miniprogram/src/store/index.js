import { reactive } from 'vue';
import { api } from '@/api';
import { parseTableCode } from '@/lib/tableCode';
import { isTableEntryFresh } from '@/lib/visitDay';

const STORE_KEY = 'teahour.customer.store';
const CART_KEY = 'teahour.customer.bags';
const TABLE_KEY = 'teahour.customer.table';
const LAST_KEY = 'teahour.customer.lastOrder';
const CART_VERSION = 3;

export const state = reactive({
  loading: true,
  error: '',
  customer: null,
  stores: [],
  store: null,
  storeChosen: false,
  categories: [],
  products: [],
  retail: [],
  freshCart: [],
  retailCart: [],
  dining: 'takeaway',
  seat: '',
  lastOrder: null,
  submitting: false
});

let seq = 1;
const nextKey = (prefix) => `${prefix}${seq++}`;

const clampQty = (value) => Math.max(1, Math.min(20, Math.round(Number(value) || 1)));

/**
 * 用餐方式与桌号按门店分别保存，但只在扫码当天有效：
 * 顾客换店、当天退出小程序再回来时，仍回到上次选择的位置；
 * 隔天则自动失效，避免把昨天坐过的桌子带到今天。
 * 只存门店 id 与位置名，不缓存价格或商品对象。
 */
function readTables() {
  try {
    const saved = uni.getStorageSync(TABLE_KEY);
    if (saved && typeof saved === 'object' && saved.tables && typeof saved.tables === 'object') {
      return saved.tables;
    }
  } catch (error) {
    /* storage unavailable */
  }
  return {};
}

function writeTables(tables) {
  try {
    uni.setStorageSync(TABLE_KEY, { tables });
  } catch (error) {
    /* storage unavailable */
  }
}

function persistTable() {
  if (!state.store || !state.store.id) return;
  const tables = readTables();
  tables[state.store.id] = { seat: state.seat || '', dining: state.dining, at: Date.now() };
  writeTables(tables);
}

/** 目录加载完成后恢复本店上次的座位与用餐方式；隔天的记录直接丢弃。 */
function restoreTable() {
  if (!state.store || !state.store.id) return;
  const tables = readTables();
  const entry = tables[state.store.id];
  if (!entry) return;
  if (!isTableEntryFresh(entry)) {
    delete tables[state.store.id];
    writeTables(tables);
    return;
  }
  // 门店可能在后台删掉了某个位置，失效的桌号不再恢复。
  const positions = state.store.positions || [];
  if (entry.seat && (!positions.length || positions.includes(entry.seat))) state.seat = entry.seat;
  if (entry.dining === 'dine' || entry.dining === 'takeaway') state.dining = entry.dining;
}

/**
 * 清掉跨天失效的桌号（小程序在后台过夜后回到前台、或恰好在零点后下单时调用）。
 * 返回是否清掉了当前显示的桌号，页面可据此提示顾客重新扫码。
 */
export function expireStaleTable(now = Date.now()) {
  if (!state.store || !state.store.id) return false;
  const tables = readTables();
  const entry = tables[state.store.id];
  if (!entry || isTableEntryFresh(entry, now)) return false;
  delete tables[state.store.id];
  writeTables(tables);
  const hadSeat = Boolean(state.seat);
  state.seat = '';
  if (state.dining === 'dine') state.dining = 'takeaway';
  return hadSeat;
}

export function setDining(mode) {
  state.dining = mode === 'dine' ? 'dine' : 'takeaway';
  persistTable();
}

export function setSeat(seat) {
  const next = String(seat || '').trim();
  if (!next) return;
  state.seat = next;
  state.dining = 'dine';
  persistTable();
}

/**
 * 解析桌签启动参数。
 * 支持纯文本「门店ID|座位」、普通链接二维码 https 链接（微信放在 q 参数）
 * 以及小程序码 scene；统一交给 parseTableCode，写入选店与桌号缓存，
 * 首页初始化时直接落到对应门店，顾客无需再手动选店选桌。
 */
export function applyLaunchScene(raw) {
  const parsed = parseTableCode(raw);
  if (!parsed) return null;
  const { storeId, seat } = parsed;
  try {
    uni.setStorageSync(STORE_KEY, storeId);
    const tables = readTables();
    tables[storeId] = { seat, dining: 'dine', at: Date.now() };
    writeTables(tables);
  } catch (error) {
    /* storage unavailable */
  }
  return { storeId, seat };
}

/**
 * 购物袋按门店拆分：鲜饮只能在本店下单，换店时各自保留各自的袋子；
 * 零售可跨店领取，保留一个全局袋子。
 * 只存商品 id 与选项，价格与可售状态以本次目录为准。
 */
function emptyBag() {
  return { v: CART_VERSION, freshByStore: {}, retail: [] };
}

let bag = null;

/** 读取本地购物袋，兼容旧版全局鲜饮袋（迁移到当前门店下）。 */
function readBag() {
  if (bag) return bag;
  let saved = null;
  try {
    saved = uni.getStorageSync(CART_KEY) || null;
  } catch (error) {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') {
    bag = emptyBag();
    return bag;
  }
  if (saved.v === CART_VERSION && saved.freshByStore && typeof saved.freshByStore === 'object') {
    bag = {
      v: CART_VERSION,
      freshByStore: saved.freshByStore,
      retail: Array.isArray(saved.retail) ? saved.retail : []
    };
    return bag;
  }
  const migrated = emptyBag();
  migrated.retail = Array.isArray(saved.retail) ? saved.retail : [];
  if (saved.freshByStore && typeof saved.freshByStore === 'object') {
    // v2 已按门店拆分，逐店搬运即可。
    Object.keys(saved.freshByStore).forEach((id) => {
      if (Array.isArray(saved.freshByStore[id])) migrated.freshByStore[id] = saved.freshByStore[id];
    });
  } else if (Array.isArray(saved.fresh) && saved.fresh.length && state.store && state.store.id) {
    // 更早的购物袋没有门店维度，只能记到当时打开的门店名下。
    migrated.freshByStore[state.store.id] = saved.fresh;
  }
  bag = migrated;
  return bag;
}

function persistCart() {
  const current = readBag();
  if (state.store && state.store.id) {
    current.freshByStore[state.store.id] = state.freshCart.map((line) => ({
      productId: line.product.id,
      qty: line.qty,
      temp: line.temp,
      ice: line.ice
    }));
  }
  current.retail = state.retailCart.map((line) => ({
    itemId: line.item.id,
    qty: line.qty,
    categoryId: line.categoryId
  }));
  try {
    uni.setStorageSync(CART_KEY, current);
  } catch (error) {
    /* storage unavailable */
  }
}

/** 目录加载完成后挂载本店购物袋：鲜饮只取当前门店，零售全局恢复。 */
function restoreCart() {
  const current = readBag();
  state.retailCart = [];
  (Array.isArray(current.retail) ? current.retail : []).forEach((entry) => {
    const item = state.retail.find((row) => row.id === entry.itemId);
    if (!item) return;
    state.retailCart.push({
      key: nextKey('r'),
      item,
      qty: clampQty(entry.qty),
      categoryId: entry.categoryId
    });
  });
  state.freshCart = [];
  const stored = state.store && state.store.id ? current.freshByStore[state.store.id] : null;
  (Array.isArray(stored) ? stored : []).forEach((entry) => {
    const product = state.products.find((item) => item.id === entry.productId);
    if (!product || product.available === false) return;
    const temp = product.temps && product.temps.includes(entry.temp)
      ? entry.temp
      : (product.temps && product.temps[0]) || '热';
    const ice = entry.ice || (temp === '热' || !product.ice ? '热饮' : '标准冰');
    state.freshCart.push({ key: nextKey('f'), product, qty: clampQty(entry.qty), temp, ice });
  });
  // 回写一次：清掉已下架/售罄的行，并把旧格式升级为新格式。
  persistCart();
}

export function freshCount() {
  return state.freshCart.reduce((n, line) => n + line.qty, 0);
}

export function retailCount() {
  return state.retailCart.reduce((n, line) => n + line.qty, 0);
}

export function freshGross() {
  return state.freshCart.reduce((n, line) => n + line.product.priceCents * line.qty, 0);
}

export function memberCut() {
  const perCup = (state.customer && state.customer.discountPerCupCents) || 0;
  return state.freshCart.reduce(
    (n, line) => n + (line.product.memberEligible ? perCup * line.qty : 0),
    0
  );
}

export function retailGross() {
  return state.retailCart.reduce((n, line) => n + line.item.priceCents * line.qty, 0);
}

export function cartTotal(kind) {
  if (kind === 'retail') return retailGross();
  return Math.max(0, freshGross() - memberCut());
}

// 目录请求代次（UI-08）：切店或刷新只接受最新一次响应，
// 慢请求 A/B 反转时旧响应直接丢弃，不会把旧门店/旧目录写回状态。
let catalogSeq = 0;

export function setCustomer(customer) {
  state.customer = customer || null;
}

/**
 * 退出会员登录：清本地令牌与会员态。
 * 订单、优惠券和积分属于会员数据，保留在服务端；重新用同一手机号登录即可恢复。
 * 购物袋与选店属于本机草稿，按产品设计不随退出清空。
 */
export function logout() {
  api.clearSession();
  state.customer = null;
  state.lastOrder = null;
  forgetLastOrder();
}

export async function init(force = false) {
  if (state.store && !force) {
    // 已初始化（UI-08）：本次启动复用现有状态，但静默刷新目录，
    // 让后台改价/停售在回前台时可见；失败不打断使用，提交仍由服务端核验。
    refreshCatalog().catch(() => undefined);
    return;
  }
  state.loading = true;
  state.error = '';
  try {
    let stored = '';
    try {
      stored = uni.getStorageSync(STORE_KEY) || '';
    } catch (error) {
      stored = '';
    }
    // 会话恢复与门店目录互不依赖，并行请求可少等一个往返；任一失败仍按原逻辑报错。
    let sessionError = null;
    let catalogError = null;
    const sessionPromise = api.ensureCustomerSession().catch((error) => {
      sessionError = error;
      return null;
    });
    const catalogPromise = loadCatalog(stored).catch((error) => {
      catalogError = error;
    });
    const [customer] = await Promise.all([sessionPromise, catalogPromise]);
    if (sessionError) throw sessionError;
    if (catalogError) throw catalogError;
    state.customer = customer;
  } catch (error) {
    state.error = (error && error.message) || '暂时连不上茶席';
  } finally {
    state.loading = false;
  }
}

/**
 * 静默刷新当前门店目录（UI-08）：回前台 / 进结算页前调用。
 * 返回袋内变化 { removed, priceChanged }，由页面负责提示；请求失败静默返回空。
 */
export async function refreshCatalog() {
  if (!state.store) return { removed: [], priceChanged: [] };
  const id = ++catalogSeq;
  try {
    const boot = await api.bootstrap(state.store.id);
    if (id !== catalogSeq) return { removed: [], priceChanged: [] };
    const before = [
      ...state.freshCart.map((line) => line.product),
      ...state.retailCart.map((line) => line.item)
    ];
    applyCatalog(boot, { silent: true });
    const afterIds = new Set([
      ...state.freshCart.map((line) => line.product.id),
      ...state.retailCart.map((line) => line.item.id)
    ]);
    const afterPrice = new Map([
      ...state.freshCart.map((line) => [line.product.id, line.product.priceCents]),
      ...state.retailCart.map((line) => [line.item.id, line.item.priceCents])
    ]);
    const removed = before.filter((product) => !afterIds.has(product.id));
    const priceChanged = before.filter(
      (product) => afterIds.has(product.id) && afterPrice.get(product.id) !== product.priceCents
    );
    return { removed, priceChanged };
  } catch (error) {
    return { removed: [], priceChanged: [] };
  }
}

async function loadCatalog(storeId) {
  const id = ++catalogSeq;
  const boot = await api.bootstrap(storeId || undefined);
  // 只接受最新一次目录请求（UI-08）：快速连点两家店时，先返回的旧响应作废。
  if (id !== catalogSeq) return;
  applyCatalog(boot, { silent: false, requestedStoreId: storeId || '' });
}

function applyCatalog(boot, opts = {}) {
  state.stores = boot.stores || [];
  state.store = boot.store || null;
  state.categories = boot.categories || [];
  state.products = boot.products || [];
  state.retail = boot.retail || [];
  // 缓存里的门店已下线时，后端会兜底返回门店；改写缓存，避免每次启动都试错。
  if (opts.requestedStoreId && state.store && state.store.id !== opts.requestedStoreId) {
    try {
      uni.setStorageSync(STORE_KEY, state.store.id);
    } catch (error) {
      /* ignore */
    }
  }
  // 换店时先回到默认用餐方式，再按本店缓存恢复，避免沿用上一家店的桌号。
  // 没扫过桌签就不预填座位：堂食按吧台取餐口自取，扫码后才固定桌号。
  state.seat = '';
  state.dining = 'takeaway';
  restoreTable();
  if (!opts.silent) {
    state.storeChosen = Boolean(opts.requestedStoreId && state.store && state.store.id === opts.requestedStoreId);
  }
  restoreCart();
}

export async function chooseStore(storeId) {
  if (!storeId) return;
  if (state.store && state.store.id === storeId) {
    state.storeChosen = true;
    try {
      uni.setStorageSync(STORE_KEY, storeId);
    } catch (error) {
      /* ignore */
    }
    return;
  }
  try {
    uni.setStorageSync(STORE_KEY, storeId);
  } catch (error) {
    /* ignore */
  }
  await loadCatalog(storeId);
  state.storeChosen = true;
}

export function applyTable(storeId, seat) {
  return chooseStore(storeId).then(() => {
    setSeat(seat);
  });
}

export function addFresh(product, options = {}) {
  const temp = options.temp || (product.temps && product.temps[0]) || '热';
  // 热饮与固定规格商品不选冰量：不再用“热饮”占位提交，避免后端当成非法冰量。
  const ice = product.ice && temp !== '热' ? options.ice || '标准冰' : null;
  const qty = options.qty || 1;
  const found = state.freshCart.find(
    (line) => line.product.id === product.id && line.temp === temp && line.ice === ice
  );
  if (found) {
    found.qty = Math.min(20, found.qty + qty);
    persistCart();
    return found;
  }
  const line = { key: nextKey('f'), product, qty: Math.min(20, qty), temp, ice };
  state.freshCart.push(line);
  persistCart();
  return line;
}

export function addRetail(item, qty = 1, categoryId) {
  const found = state.retailCart.find((line) => line.item.id === item.id);
  if (found) {
    found.qty = Math.min(20, found.qty + qty);
    persistCart();
    return found;
  }
  const line = { key: nextKey('r'), item, qty: Math.min(20, qty), categoryId };
  state.retailCart.push(line);
  persistCart();
  return line;
}

export function changeQty(kind, key, delta) {
  const list = kind === 'retail' ? state.retailCart : state.freshCart;
  const line = list.find((entry) => entry.key === key);
  if (!line) return;
  line.qty = Math.max(0, Math.min(20, line.qty + delta));
  if (line.qty === 0) {
    const index = list.indexOf(line);
    list.splice(index, 1);
  }
  persistCart();
}

export function clearCart(kind) {
  if (kind === 'retail') state.retailCart = [];
  else state.freshCart = [];
  persistCart();
}

export async function submitOrder(kind, options = {}) {
  if (!state.store) throw new Error('请先选择门店');
  // 零点后可能还留着昨天的桌号：提交前再校验一次，避免把堂食送到旧桌。
  expireStaleTable();
  const couponId = options.couponId || undefined;
  const body =
    kind === 'retail'
      ? {
          storeId: state.store.id,
          business: 'retail',
          type: 'retail',
          couponId,
          items: state.retailCart.map((line) => ({ productId: line.item.id, qty: line.qty }))
        }
      : {
          storeId: state.store.id,
          business: 'fresh',
          type: state.dining,
          seat: state.dining === 'dine' ? state.seat : null,
          couponId,
          memberCode: state.customer ? state.customer.memberCode : undefined,
          items: state.freshCart.map((line) => ({
            productId: line.product.id,
            qty: line.qty,
            temp: line.temp,
            ...(line.ice ? { ice: line.ice } : {})
          }))
        };
  state.submitting = true;
  try {
    const result = await api.createOrder(body);
    state.lastOrder = result.order;
    rememberLastOrder(result.order);
    clearCart(kind);
    return result;
  } finally {
    state.submitting = false;
  }
}

/** 只记订单号：首页据此提供「继续查看取茶凭证」，订单内容仍以后端为准。 */
function rememberLastOrder(order) {
  if (!order || !order.id) return;
  try {
    uni.setStorageSync(LAST_KEY, order.id);
  } catch (error) {
    /* storage unavailable */
  }
}

export function lastOrderId() {
  try {
    const id = uni.getStorageSync(LAST_KEY);
    return typeof id === 'string' ? id : '';
  } catch (error) {
    return '';
  }
}

/** 订单已失效或查询不到时清掉缓存，避免首页一直挂着打不开的入口。 */
export function forgetLastOrder() {
  try {
    uni.removeStorageSync(LAST_KEY);
  } catch (error) {
    /* storage unavailable */
  }
}
