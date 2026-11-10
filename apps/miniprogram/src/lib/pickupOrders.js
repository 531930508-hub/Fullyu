/**
 * 首页「取茶票」只指向还需要顾客到店的订单：
 * 茶饮制作中三小时内/近一小时已出餐，零售待提货四十八小时内，且必须已支付。
 * 已完成、取消、退款、未支付都不再挂首页入口；昨天已出餐的茶也不会出现。
 */

/** 茶饮出餐后只在首页保留一小时，避免早上的旧取餐号到晚上还在。 */
export const READY_WINDOW_MS = 60 * 60 * 1000;

/** 茶饮制作中最多保留三小时；员工忘了点出餐也不会让旧单一直挂在首页。 */
export const PENDING_WINDOW_MS = 3 * 60 * 60 * 1000;

/** 零售待提货最多保留四十八小时，超过视为顾客已不需要首页提醒。 */
export const RETAIL_WINDOW_MS = 48 * 60 * 60 * 1000;

export function isReadyPickup(order) {
  if (!order || order.paymentStatus !== 'paid') return false;
  if (order.business === 'retail') return order.status === 'awaiting' || order.status === 'ready';
  return order.status === 'ready';
}

function timeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function readyAtValue(order) {
  if (!order) return 0;
  return timeValue(order.preparedAt || order.createdAt);
}

function isFreshReadyPickup(order, now) {
  if (!isReadyPickup(order)) return false;
  if (order.business === 'retail') return true;
  const readyAt = readyAtValue(order);
  return readyAt > 0 && now - readyAt <= READY_WINDOW_MS;
}

/** 首页取茶票的新鲜度：茶饮制作中三小时、已出餐一小时，零售待提货四十八小时。 */
function isFreshPickup(order, now) {
  if (!isPickupOrder(order)) return false;
  if (order.business === 'retail') {
    const created = createdAtValue(order);
    return created > 0 && now - created <= RETAIL_WINDOW_MS;
  }
  if (order.status === 'ready') return isFreshReadyPickup(order, now);
  const created = createdAtValue(order);
  return created > 0 && now - created <= PENDING_WINDOW_MS;
}

function pickupPriority(order) {
  if (!order) return 0;
  if (isReadyPickup(order)) return 2;
  if (order.status === 'pending') return 1;
  return 0;
}

function createdAtValue(order) {
  return timeValue(order && order.createdAt);
}

export function isPickupOrder(order) {
  if (!order || order.paymentStatus !== 'paid') return false;
  if (!['pending', 'ready', 'awaiting'].includes(order.status)) return false;
  if (order.business === 'retail') return order.status === 'awaiting' || order.status === 'ready';
  return order.status === 'pending' || order.status === 'ready';
}

/** 返回可去取茶/提货的订单，可取优先，其次按最新下单排序。 */
export function pickupOrders(orders, now = Date.now()) {
  return (orders || [])
    .filter((order) => isFreshPickup(order, now))
    .sort((a, b) => pickupPriority(b) - pickupPriority(a) || createdAtValue(b) - createdAtValue(a));
}

/**
 * 首页取茶票的点击目标：
 * 只有一单可取时直接打开它（哪怕还有别的在制作）；
 * 两单以上可取、或全部制作中且不止一单时返回 null，交给订单列表让顾客自己选。
 */
export function pickupTarget(orders, now = Date.now()) {
  const list = pickupOrders(orders, now);
  const ready = list.filter(isReadyPickup);
  if (ready.length === 1) return ready[0];
  if (!ready.length && list.length === 1) return list[0];
  return null;
}

/** 订单列表里把已出餐/待提货稳定地提到最前，其余保持服务端顺序。 */
export function readyFirst(orders) {
  return (orders || [])
    .slice()
    .sort((a, b) => Number(isReadyPickup(b)) - Number(isReadyPickup(a)));
}
