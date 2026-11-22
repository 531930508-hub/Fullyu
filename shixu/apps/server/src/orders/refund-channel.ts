/**
 * 退款走哪条路：钱怎么收进来的，就怎么退回去。
 *
 * 只有经收银渠道（汇付）收的单在渠道侧有原交易、能按 paymentRef 原路退回；
 * 现金单是门店当面收的钱，渠道里根本没有这笔交易，硬调网关只会得到
 * 「原交易不存在」——11-22 门店现金退款全部失败就是这个原因。
 * 现金单必须走本地落账：确认退款、回补库存与财务流水照旧，钱由店员当面交还。
 */
export type RefundChannel = 'gateway' | 'cash';

export function refundChannelOf(order: {
  paymentMethod?: string | null;
  paymentRef?: string | null;
}): RefundChannel {
  // 以支付方式为准：mock/同步模式下的现金单也会拿到一个渠道流水号，
  // 只看 paymentRef 会把现金单误送进网关。CASH- 前缀兜底历史数据。
  if (order.paymentMethod === 'cash') return 'cash';
  if ((order.paymentRef || '').startsWith('CASH-')) return 'cash';
  return 'gateway';
}