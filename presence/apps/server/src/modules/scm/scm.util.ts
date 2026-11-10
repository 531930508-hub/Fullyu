/** 进销存数量/金额换算工具。Prisma Decimal 统一在 Service 边界转成 number。 */

export function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** 数量保留三位小数 */
export function qty3(value: unknown): number {
  return Math.round(num(value) * 1000) / 1000
}

/** 金额保留两位小数 */
export function money2(value: unknown): number {
  return Math.round(num(value) * 100) / 100
}
