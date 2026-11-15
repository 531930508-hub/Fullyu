const BIRTHDAY_RE = /^(\d{4})-(\d{2})-(\d{2})/

/**
 * 生日只记月日，库里仍用日期列，所以年份统一写占位年 2000。
 * 选闰年是为了让 2/29 也能存下来；展示与倒计时都只看月-日。
 */
export const BIRTHDAY_PLACEHOLDER_YEAR = 2000

/**
 * 距下一次生日的天数（今天为 0，不含年份）。
 * 只按「月-日」计算，闰日 2/29 在平年顺延到 3/1。
 */
export function daysUntilBirthday(birthday, now = new Date()) {
  if (!birthday) return null
  const matched = String(birthday).match(BIRTHDAY_RE)
  if (!matched) return null
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const next = new Date(today.getFullYear(), month - 1, day)
  if (next.getTime() < today.getTime()) {
    next.setFullYear(today.getFullYear() + 1)
  }
  return Math.round((next.getTime() - today.getTime()) / 86400000)
}

/**
 * 今天是否生日：与 daysUntilBirthday 同一口径（2/29 在平年顺延到 3/1）。
 * 不要用「月-日字符串比对」自己实现，否则 2/29 生日平年永远不命中。
 */
export function isBirthdayToday(birthday, now = new Date()) {
  return daysUntilBirthday(birthday, now) === 0
}

/**
 * 生日提醒统一口径：7 天内显示倒计时，当天显示「今天生日」，其余返回空字符串。
 * 三端（轻疗建单 / 时叙出单 / 在场签到）保持同一窗口。
 */
export function birthdayCountdownLabel(birthday, now = new Date(), windowDays = 7) {
  const days = daysUntilBirthday(birthday, now)
  if (days === null || days > windowDays) return ''
  return days === 0 ? '今天生日' : `还有 ${days} 天生日`
}

/** 生日只展示月日，如「3月5日」；不显示占位年。 */
export function birthdayMonthDayLabel(birthday) {
  const matched = birthday ? String(birthday).match(BIRTHDAY_RE) : null
  if (!matched) return ''
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${month}月${day}日`
}