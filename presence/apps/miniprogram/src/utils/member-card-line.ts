/**
 * 会员卡上「已排期」那一行：当前卡后面还排着一张（赠送码 / 续费单接在当前卡之后）。
 * 只拼 CRM 下发的起止日期，不在这里推算接续口径；两个日期缺一个就返回空串，卡面不渲染。
 * 纯函数、不引依赖，便于单测（member-card-line.test.cjs）。
 */
export interface PendingCardDates {
  validFrom?: string
  validUntil?: string
}

export function pendingRenewalLine(
  pending: PendingCardDates | null | undefined,
  tr: (zh: string, en: string) => string
): string {
  if (!pending || typeof pending !== 'object') return ''
  const from = String(pending.validFrom || '').slice(0, 10)
  const until = String(pending.validUntil || '').slice(0, 10)
  if (!from || !until) return ''
  return tr(
    `已排期：${from} 起接续，权益至 ${until}`,
    `Scheduled: ${from} onward, valid until ${until}`
  )
}