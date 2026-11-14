import type { Order } from './types';

/** 营业台队列的筛选口径，与后端 storeQueue 返回的 fresh 列表一一对应。 */
export type QueueFilter = 'all' | 'dine' | 'takeaway' | 'delivery';

/** 平台外卖在库里既可能是 delivery 类型，也可能挂在第三方渠道上，两者都算「平台外卖」。 */
export function matchesQueueFilter(order: Order, filter: QueueFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'delivery') {
    return order.type === 'delivery' || order.channel === 'meituan' || order.channel === 'taobao';
  }
  return order.type === filter;
}

/** 当前仍在制作的订单 id 集合，用作「有没有新单」的比较基准。 */
export function pendingOrderIds(fresh: Order[]): Set<string> {
  return new Set(fresh.filter((order) => order.status === 'pending').map((order) => order.id));
}

/**
 * 挑出这一轮新出现的待制作订单。
 * previous 为 null 表示首轮加载（页面刚打开），历史订单不算新单，避免一进页面就响铃。
 */
export function newPendingOrders(previous: Set<string> | null, fresh: Order[]): Order[] {
  if (!previous) return [];
  return fresh.filter((order) => order.status === 'pending' && !previous.has(order.id));
}