import { describe, expect, test } from 'vitest';
import { bucketOrders, orderBucket, orderBucketCounts } from './orderBuckets';

const order = (status, extra = {}) => ({ id: status + Math.random(), status, ...extra });

describe('orderBucket', () => {
  test('进行中的订单包含制作中、待取餐、待提货', () => {
    expect(orderBucket(order('pending'))).toBe('active');
    expect(orderBucket(order('ready'))).toBe('active');
    expect(orderBucket(order('awaiting'))).toBe('active');
  });

  test('已交付归入已完成', () => {
    expect(orderBucket(order('delivered'))).toBe('completed');
  });

  test('取消与退款归入已关闭，不与有效订单混排', () => {
    expect(orderBucket(order('cancelled'))).toBe('closed');
    expect(orderBucket(order('refunded'))).toBe('closed');
  });

  test('未知状态仍留在进行中，避免订单凭空消失', () => {
    expect(orderBucket(order('refund_pending'))).toBe('active');
    expect(orderBucket(null)).toBe('active');
  });
});

describe('bucketOrders', () => {
  test('只返回指定分档且保持原有顺序', () => {
    const list = [order('pending', { id: 'a' }), order('cancelled', { id: 'b' }), order('ready', { id: 'c' })];
    expect(bucketOrders(list, 'active').map((row) => row.id)).toEqual(['a', 'c']);
    expect(bucketOrders(list, 'closed').map((row) => row.id)).toEqual(['b']);
  });

  test('三个分档互斥且覆盖全部订单', () => {
    const list = [
      order('pending'),
      order('ready'),
      order('awaiting'),
      order('delivered'),
      order('cancelled'),
      order('refunded')
    ];
    const counts = orderBucketCounts(list);
    expect(counts).toEqual({ active: 3, completed: 1, closed: 2 });
    expect(counts.active + counts.completed + counts.closed).toBe(list.length);
  });
});
