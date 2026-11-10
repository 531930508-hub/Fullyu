import { describe, expect, it } from 'vitest';
import { isSameVisitDay, isTableEntryFresh } from './visitDay';

const cst = (value) => Date.parse(`${value}+08:00`);

describe('桌号按到店自然日失效', () => {
  it('同一天内（北京时间）仍有效', () => {
    expect(isSameVisitDay(cst('2026-11-02T00:00:00'), cst('2026-11-02T23:59:59'))).toBe(true);
  });

  it('跨过北京时间零点即失效', () => {
    expect(isSameVisitDay(cst('2026-11-01T23:59:59'), cst('2026-11-02T00:00:00'))).toBe(false);
  });

  it('按北京时间而不是设备本地时区划分日期', () => {
    // UTC 16:00 即北京时间次日 00:00。
    expect(isSameVisitDay(Date.parse('2026-11-01T15:59:59Z'), Date.parse('2026-11-01T16:00:00Z'))).toBe(false);
    expect(isSameVisitDay(Date.parse('2026-11-01T16:00:00Z'), Date.parse('2026-11-02T15:59:59Z'))).toBe(true);
  });

  it('缺失或非法时间戳视为过期', () => {
    expect(isSameVisitDay(undefined, Date.now())).toBe(false);
    expect(isSameVisitDay(Number.NaN, Date.now())).toBe(false);
    expect(isSameVisitDay(0, Date.now())).toBe(false);
  });

  it('缓存条目缺少扫码时间也视为过期', () => {
    expect(isTableEntryFresh({ seat: 'A013' }, Date.now())).toBe(false);
    expect(isTableEntryFresh(null, Date.now())).toBe(false);
  });

  it('当天扫码的条目可用，隔天的条目不可用', () => {
    const now = cst('2026-11-02T10:00:00');
    expect(isTableEntryFresh({ seat: 'A013', at: cst('2026-11-02T09:30:00') }, now)).toBe(true);
    expect(isTableEntryFresh({ seat: 'A013', at: cst('2026-11-01T21:00:00') }, now)).toBe(false);
  });
});
