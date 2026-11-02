export class MoneyError extends Error {
  readonly field: string;

  constructor(message: string, field = 'amount') {
    super(message);
    this.name = 'MoneyError';
    this.field = field;
  }
}

/** 元（字符串/数字）→ 分。非法输入抛 MoneyError，不返回 null。 */
export function yuanToCents(value: unknown): number {
  const raw = String(value ?? '').trim().replace(/[¥￥,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new MoneyError('金额应为正数，最多两位小数');
  }
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000) {
    throw new MoneyError('金额超出有效范围（0.01–1,000,000 元）');
  }
  return cents;
}

export function centsToYuan(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2
  });
}

/** 负号用 U+2212（−），与已验收的既有显示口径一致。 */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  return `${sign}¥${centsToYuan(Math.abs(cents))}`;
}
