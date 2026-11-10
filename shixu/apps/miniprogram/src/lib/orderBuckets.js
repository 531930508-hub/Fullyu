/**
 * 顾客端订单列表按生命周期分档，避免把「茶饮 / 零售」这种品类
 * 和「待领取」这种状态放在同一排筛选里。
 *
 * active    进行中：制作中、待取餐、待提货、待支付
 * completed 已完成：已交付（含凌晨自动确认的取茶单）
 * closed    已关闭：取消、退款，不再混进有效订单
 */
export const ORDER_BUCKETS = ['active', 'completed', 'closed'];

export function orderBucket(order) {
  const status = order && order.status;
  if (status === 'cancelled' || status === 'refunded') return 'closed';
  if (status === 'delivered') return 'completed';
  // 其余状态都留在进行中，服务端以后新增中间态时订单不会凭空消失。
  return 'active';
}

export function bucketOrders(orders, bucket) {
  return (orders || []).filter((order) => orderBucket(order) === bucket);
}

export function orderBucketCounts(orders) {
  const counts = { active: 0, completed: 0, closed: 0 };
  (orders || []).forEach((order) => {
    counts[orderBucket(order)] += 1;
  });
  return counts;
}
