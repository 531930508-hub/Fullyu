import { badRequest } from './errors.js';

export function yuanToCents(value: unknown): number {
  const raw = String(value ?? '').trim().replace(/[¥￥,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw badRequest('金额应为正数，最多两位小数', { field: 'amount' });
  }
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000) {
    throw badRequest('金额超出有效范围（0.01–1,000,000 元）', { field: 'amount' });
  }
  return cents;
}

export function centsToYuan(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2
  });
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  return `${sign}¥${centsToYuan(Math.abs(cents))}`;
}
