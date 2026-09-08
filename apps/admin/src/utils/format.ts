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

/** 金额：统一两位小数千分位，前面不带符号 */
export function money(value?: number | null): string {
  const n = Number(value ?? 0)
  return (Number.isFinite(n) ? n : 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
