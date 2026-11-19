/**
 * 会员卡上「已排期」那一行：当前卡后面还排着一张（赠送码 / 续费单接在当前卡之后）。
 * CRM 只在「当前卡生效且另有一张 PENDING 卡」时下发 pendingCard；这里只拼它给的起止日期，
 * 不推算接续口径，两个日期缺一个就返回空串，卡面不渲染。纯函数，便于单测。
 */
export function pendingRenewalLine(pendingCard, tt) {
  if (!pendingCard || typeof pendingCard !== 'object') return '';
  const from = String(pendingCard.validFrom || '').slice(0, 10);
  const until = String(pendingCard.validUntil || '').slice(0, 10);
  if (!from || !until) return '';
  return tt(`已排期：${from} 起接续，权益至 ${until}`, `Scheduled: ${from} onward, valid until ${until}`);
}