import dayjs from 'dayjs'

/** 日期时间（到分钟），后端返回的都是 ISO 串，直接渲染太长 */
export function dt(value?: string | Date | null): string {
  if (!value) return '-'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(value)
}

/** 仅日期 */
export function day(value?: string | Date | null): string {
  if (!value) return '-'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD') : String(value)
}

/**
 * 生日提醒：7 天内显示倒计时，当天显示「今天生日」，其余返回空串。
 * 只取「月-日」自己拼下一年的日期：dayjs('1990-02-29') 会先回滚成 3/1，
 * 导致闰年的 2/29 生日永远偏到 3/1（与 CRM/轻疗的「平年顺延、闰年当天」口径不一致）。
 */
export function birthdayCountdownLabel(value?: string | null, windowDays = 7): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!matched) return ''
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  const today = dayjs().startOf('day')
  // new Date(y, m - 1, d) 走本地时区：闰年保留 2/29，平年自动顺延到 3/1
  const atYear = (year: number) => dayjs(new Date(year, month - 1, day)).startOf('day')
  let next = atYear(today.year())
  if (next.isBefore(today)) next = atYear(today.year() + 1)
  const days = next.diff(today, 'day')
  if (days > windowDays) return ''
  return days === 0 ? '今天生日' : `还有 ${days} 天生日`
}

/** 金额：统一两位小数千分位，前面不带符号 */
export function money(value?: number | null): string {
  const n = Number(value ?? 0)
  return (Number.isFinite(n) ? n : 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
