import { maskPhone, normalizePhone, phoneSearchTerms } from './phone';

describe('normalizePhone', () => {
  it('大陆号码统一为 11 位，兼容 +86、86、0086 和分隔符', () => {
    expect(normalizePhone('13800138000')).toBe('13800138000');
    expect(normalizePhone('+86 138-0013-8000')).toBe('13800138000');
    expect(normalizePhone('8613800138000')).toBe('13800138000');
    expect(normalizePhone('008613800138000')).toBe('13800138000');
    expect(normalizePhone('+86 (138) 0013 8000')).toBe('13800138000');
  });

  it('境外号码保留 E.164，兼容 00 前缀和长途 0', () => {
    expect(normalizePhone('+852 9123 4567')).toBe('+85291234567');
    expect(normalizePhone('0085291234567')).toBe('+85291234567');
    expect(normalizePhone('+886 0976 106 846')).toBe('+886976106846');
    expect(normalizePhone('0049 176 62134483')).toBe('+4917662134483');
    expect(normalizePhone('+0049 176 62134483')).toBe('+4917662134483');
    expect(normalizePhone('+1 206 303 8028')).toBe('+12063038028');
    expect(normalizePhone('+39 392 424 5593')).toBe('+393924245593');
  });

  it('无法识别的非空号码保留，不变成空手机号', () => {
    expect(normalizePhone('13814066067906')).toBe('13814066067906');
    expect(normalizePhone('+820041791931063')).toBe('+8241791931063');
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
  });
});

describe('phoneSearchTerms', () => {
  it('大陆号码同时生成 11 位与 +86 两种搜索词', () => {
    expect(phoneSearchTerms('13800138000')).toEqual(
      expect.arrayContaining(['13800138000', '+8613800138000'])
    );
  });

  it('境外号码按 E.164 搜索', () => {
    expect(phoneSearchTerms('+852 9123 4567')).toEqual(
      expect.arrayContaining(['+852 9123 4567', '+85291234567'])
    );
  });
});

describe('maskPhone', () => {
  it('大陆与境外号码都保留前段和后四位', () => {
    expect(maskPhone('13800138000')).toBe('138****8000');
    expect(maskPhone('+85291234567')).toBe('+852****4567');
    expect(maskPhone('+886976106846')).toBe('+886****6846');
    expect(maskPhone(null)).toBeNull();
  });
});
