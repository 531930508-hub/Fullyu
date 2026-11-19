import { describe, expect, test } from 'vitest';
import { pendingRenewalLine } from './memberCardLine';

const tt = (zh, en) => `${zh}|${en}`;
const card = (validFrom, validUntil) => ({ state: 'PENDING', validFrom, validUntil });

describe('pendingRenewalLine', () => {
  test('排期卡按 CRM 给的两端日期拼一句，中英都带', () => {
    expect(pendingRenewalLine(card('2026-12-18', '2027-03-17'), tt)).toBe(
      '已排期：2026-12-18 起接续，权益至 2027-03-17|Scheduled: 2026-12-18 onward, valid until 2027-03-17'
    );
  });
  test('没有待生效卡或不带日期时不渲染，避免卡面出现半句空话', () => {
    expect(pendingRenewalLine(null, tt)).toBe('');
    expect(pendingRenewalLine(undefined, tt)).toBe('');
    expect(pendingRenewalLine(card('', '2027-03-17'), tt)).toBe('');
    expect(pendingRenewalLine(card('2026-12-18', null), tt)).toBe('');
  });
  test('带时间的 ISO 只取日期段，和「至 X 到期」同一口径', () => {
    expect(pendingRenewalLine(card('2026-12-18T00:00:00.000Z', '2027-03-17T00:00:00.000Z'), tt)).toContain(
      '2026-12-18 起接续，权益至 2027-03-17'
    );
  });
});