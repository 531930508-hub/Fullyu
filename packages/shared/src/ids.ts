import { randomInt, randomUUID } from 'node:crypto';

export const newId = (prefix: string) => `${prefix}-${randomUUID()}`;

export function dayStamp(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function shortDate(now = Date.now()): string {
  const d = new Date(now);
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function cupLabel(orderNumber: string, index: number): string {
  return `${orderNumber}-${index}`;
}

export function uniquePickupCode(isTaken: (code: string) => boolean): string {
  for (let i = 0; i < 200; i += 1) {
    const code = String(randomInt(1000, 10000));
    if (!isTaken(code)) return code;
  }
  throw new Error('无法生成唯一提货码，请稍后重试');
}
