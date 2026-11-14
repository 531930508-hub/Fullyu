import { describe, expect, it } from 'vitest';
import { matchesQueueFilter, newPendingOrders, pendingOrderIds } from './queue';
import type { Order } from './types';

function order(id: string, patch: Partial<Order> = {}): Order {
  return {
    id,
    number: id.toUpperCase(),
    business: 'fresh',
    channel: 'mini',
    type: 'takeaway',
    status: 'pending',
    ...patch
  } as Order;
}

describe('matchesQueueFilter', () => {
  it('全部一栏不过滤', () => {
    expect(matchesQueueFilter(order('a', { type: 'dine' }), 'all')).toBe(true);
  });

  it('堂食 / 外带按订单类型区分', () => {
    expect(matchesQueueFilter(order('a', { type: 'dine' }), 'dine')).toBe(true);
    expect(matchesQueueFilter(order('a', { type: 'takeaway' }), 'dine')).toBe(false);
    expect(matchesQueueFilter(order('a', { type: 'takeaway' }), 'takeaway')).toBe(true);
  });

  it('平台外卖认类型也认渠道', () => {
    expect(matchesQueueFilter(order('a', { type: 'delivery' }), 'delivery')).toBe(true);
    expect(matchesQueueFilter(order('a', { type: 'takeaway', channel: 'meituan' }), 'delivery')).toBe(true);
    expect(matchesQueueFilter(order('a', { type: 'takeaway', channel: 'taobao' }), 'delivery')).toBe(true);
    expect(matchesQueueFilter(order('a', { type: 'takeaway', channel: 'mini' }), 'delivery')).toBe(false);
  });
});

describe('newPendingOrders', () => {
  it('首轮加载不把历史订单当新单', () => {
    expect(newPendingOrders(null, [order('a'), order('b')])).toEqual([]);
  });

  it('只挑出上一轮没见过的待制作订单', () => {
    const previous = pendingOrderIds([order('a')]);
    const arrivals = newPendingOrders(previous, [order('a'), order('b'), order('c', { status: 'ready' })]);
    expect(arrivals.map((item) => item.id)).toEqual(['b']);
  });

  it('同一张单连续两轮都在时不会重复提示', () => {
    const first = pendingOrderIds([order('a'), order('b')]);
    expect(newPendingOrders(first, [order('a'), order('b')])).toEqual([]);
  });
});