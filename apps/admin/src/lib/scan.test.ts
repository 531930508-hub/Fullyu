import { describe, expect, it } from 'vitest';
import { memberCodeFromScan, pickupCodeFromScan } from './scan';

describe('memberCodeFromScan', () => {
  it('识别纯会员码并统一大写', () => {
    expect(memberCodeFromScan(' th-261029-0001 ')).toBe('TH-261029-0001');
  });

  it('从链接或附带文字中提取 TH- 会员码', () => {
    expect(memberCodeFromScan('https://teahour.fullyu.cn/m?code=th-261029-0001')).toBe(
      'TH-261029-0001'
    );
  });

  it('不是会员码时返回空串，避免误提交', () => {
    expect(memberCodeFromScan('A001-1')).toBe('');
    expect(memberCodeFromScan('')).toBe('');
  });
});

describe('pickupCodeFromScan', () => {
  it('接受 4 位提货码', () => {
    expect(pickupCodeFromScan('0428')).toBe('0428');
  });

  it('从带前缀的二维码文本里取最后 4 位数字', () => {
    expect(pickupCodeFromScan('TH-R-261031-0428')).toBe('0428');
  });

  it('不足 4 位时不猜测', () => {
    expect(pickupCodeFromScan('428')).toBe('');
    expect(pickupCodeFromScan('no digits')).toBe('');
  });
});
