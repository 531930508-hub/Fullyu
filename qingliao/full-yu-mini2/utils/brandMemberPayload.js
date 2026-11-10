/**
 * 品牌会员响应归一化。
 *
 * 会员页直接渲染 member / points / dice / prizes / benefits，任一子对象缺失都会
 * 让小程序在渲染阶段抛错、整页变白。CRM 与本端版本可能短暂不一致，因此这里把
 * 可缺省字段补齐默认值；身份三要素（member / card.state / points.balance）缺失时
 * 单独判定为不完整，由调用方显示“连不上、可重试”，绝不臆断为“未开通”。
 */

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function numeric(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function hasBrandIdentity(raw) {
  return !!(
    isObject(raw) &&
    isObject(raw.member) &&
    isObject(raw.card) &&
    typeof raw.card.state === 'string' &&
    isObject(raw.points) &&
    typeof raw.points.balance === 'number'
  )
}

function yuanText(cents) {
  const value = numeric(cents) / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/**
 * 骰子进度条：金额全部由 CRM 计算，这里只做展示兜底。
 * 每颗骰子门槛缺失或非正数时整条不渲染，避免出现 NaN% 或“再消费 ¥0”。
 */
export function normalizeDiceProgress(raw) {
  if (!isObject(raw)) return null
  const perDieCents = numeric(raw.perDieCents)
  if (perDieCents <= 0) return null
  const progressCents = Math.max(0, Math.min(perDieCents, numeric(raw.progressCents)))
  const remainingCents =
    raw.remainingCents === undefined || raw.remainingCents === null
      ? perDieCents - progressCents
      : Math.max(0, numeric(raw.remainingCents))
  const pctSource =
    raw.percent === undefined || raw.percent === null
      ? Math.round((progressCents / perDieCents) * 100)
      : numeric(raw.percent)
  const percent = Math.max(0, Math.min(100, Math.round(pctSource)))
  const headline =
    typeof raw.headline === 'string' && raw.headline
      ? raw.headline
      : `再消费 ¥${yuanText(remainingCents)} 可再得一次游戏机会`
  const tip =
    isObject(raw.tip) && typeof raw.tip.title === 'string' && raw.tip.title ? raw.tip : null
  return { ...raw, perDieCents, progressCents, remainingCents, percent, headline, tip }
}

function cents(value) {
  return Math.max(0, Math.round(numeric(value)))
}

/**
 * 退款试算展示：金额与是否可退只认服务端（CRM）试算结果。
 * 7 天内 = 实付 − 已领年卡礼；7 天后 = 实付 − 已享会员优惠 − 已领年卡礼；≤0 不可退。
 * 只有 allowed === true 且 0 < 可退 ≤ 实付 时才允许提交，其余一律给出原因并禁用按钮。
 */
export function normalizeRefundQuote(raw) {
  const source = isObject(raw) ? raw : {}
  const paidCents = cents(source.paidCents)
  const savedCents = cents(source.savedCents)
  const redeemedGiftCents = cents(source.redeemedGiftCents)
  const refundCents = cents(source.refundCents)
  const within7Days = source.within7Days === true
  const allowed = source.allowed === true
  const policy = typeof source.policy === 'string' ? source.policy : ''
  const quoteError = typeof source.refundQuoteError === 'string' ? source.refundQuoteError : ''
  const canSubmit = allowed && !quoteError && refundCents > 0 && refundCents <= paidCents
  let blockText = ''
  if (!canSubmit) {
    if (quoteError) blockText = quoteError
    else if (!allowed && policy) blockText = policy
    else if (refundCents > paidCents) blockText = '退款金额与支付记录不一致，请联系工作人员核对'
    else blockText = '当前可退金额为 ¥0，不可在线退款；如有特殊情况请联系工作人员'
  }
  return {
    orderSn: typeof source.orderSn === 'string' ? source.orderSn : '',
    paidCents,
    savedCents,
    redeemedGiftCents,
    refundCents,
    within7Days,
    allowed,
    reasonCode: typeof source.reasonCode === 'string' ? source.reasonCode : '',
    deadline: typeof source.deadline === 'string' ? source.deadline : '',
    policy,
    showSaved: !within7Days,
    canSubmit,
    blockText
  }
}

export function normalizeBrandMember(raw, fallbackBenefits = []) {
  const source = isObject(raw) ? raw : {}
  const member = isObject(source.member) ? source.member : {}
  const card = isObject(source.card) ? source.card : {}
  const points = isObject(source.points) ? source.points : {}
  const dice = isObject(source.dice) ? source.dice : {}
  const prizes = isObject(source.prizes) ? source.prizes : {}
  const game = isObject(source.game) ? source.game : {}
  const benefits =
    Array.isArray(source.benefits) && source.benefits.length ? source.benefits : fallbackBenefits
  return {
    ...source,
    member: {
      memberNo: '',
      name: 'Full愈会员',
      phoneMasked: '',
      ...member
    },
    card: {
      state: 'NONE',
      ...card
    },
    points: {
      expireAt: '',
      spend: {},
      ...points,
      balance: numeric(points.balance),
      expiring: numeric(points.expiring)
    },
    dice: {
      ...dice,
      balance: numeric(dice.balance),
      station: numeric(dice.station),
      monthlyEarned: numeric(dice.monthlyEarned),
      progress: normalizeDiceProgress(dice.progress)
    },
    renewal: isObject(source.renewal) && source.renewal.show === true
      ? { ...source.renewal, savedCents: numeric(source.renewal.savedCents) }
      : { show: false },
    vouchers: Array.isArray(source.vouchers)
      ? source.vouchers.filter((item) => isObject(item) && typeof item.code === 'string' && item.code)
      : [],
    // 会员公告只对有效会员下发；字段缺失时给空数组，页面按“无公告”降级而不是白屏。
    notices: Array.isArray(source.notices)
      ? source.notices.filter((item) => isObject(item) && typeof item.title === 'string' && item.title)
      : [],
    prizes: {
      ...prizes,
      pending: numeric(prizes.pending)
    },
    savedCents: numeric(source.savedCents),
    benefits: Array.isArray(benefits) ? benefits : fallbackBenefits,
    businessCards: Array.isArray(source.businessCards) ? source.businessCards : [],
    game: {
      ...game,
      enabled: game.enabled === true,
      dice: numeric(game.dice)
    }
  }
}
