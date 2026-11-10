/**
 * 代金券兑换码：生成字母表与输入归一规则。
 * 生成时避开易混字符 I/L/O；用户输入时把 O→0、I/L→1 归一，
 * 保证「看到的码」和「敲进去的码」指向同一张券。
 */

export const VOUCHER_CODE_LENGTH = 8

/** 生成用字母表：A-Z 去掉 I/L/O + 数字 0-9（33 选 8 ≈ 1.4 万亿组合） */
export const VOUCHER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ0123456789'

/** 归一用户输入：大写、去分隔符、易混字符映射 */
export function normalizeVoucherCode(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

/** 校验归一后的码：8 位，不含 I/L/O */
export function isValidVoucherCode(code: string): boolean {
  return /^[A-HJ-KM-NP-Z0-9]{8}$/.test(code)
}

/** 展示格式：ABCD-EFGH，便于抄写与核对 */
export function formatVoucherCode(code: string): string {
  const normalized = normalizeVoucherCode(code)
  return normalized.length === VOUCHER_CODE_LENGTH
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized
}