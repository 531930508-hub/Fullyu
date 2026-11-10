import { describe, expect, it } from 'vitest';
import { ICE_OPTIONS, changeLineTemp, resolveLineOptions } from './lineOptions';

const icedTea = { temps: ['热', '冰'], ice: true };
const hotOnly = { temps: ['热'], ice: false };

describe('resolveLineOptions', () => {
  it('热饮不默认带冰量，草稿里的旧冰量也会清掉', () => {
    expect(resolveLineOptions(icedTea, '热', '少冰')).toEqual({ temp: '热', ice: null });
    expect(resolveLineOptions(icedTea, undefined, '标准冰')).toEqual({ temp: '热', ice: null });
  });

  it('冰饮默认标准冰并保留合法冰量', () => {
    expect(resolveLineOptions(icedTea, '冰')).toEqual({ temp: '冰', ice: '标准冰' });
    expect(resolveLineOptions(icedTea, '冰', '少冰')).toEqual({ temp: '冰', ice: '少冰' });
  });

  it('非法保存值回落到商品可选温度与标准冰', () => {
    expect(resolveLineOptions(icedTea, '常温', '多冰')).toEqual({ temp: '热', ice: null });
    expect(resolveLineOptions({ temps: ['冰'], ice: true }, '热', '多冰')).toEqual({
      temp: '冰',
      ice: '标准冰'
    });
  });

  it('不支持冰量的商品不产生冰量字段', () => {
    expect(resolveLineOptions(hotOnly, '热', '标准冰')).toEqual({ temp: '热', ice: null });
  });
});

describe('changeLineTemp', () => {
  it('切到热饮立即清空冰量', () => {
    expect(changeLineTemp(icedTea, '热', '少冰')).toEqual({ temp: '热', ice: null });
  });

  it('切回冰饮恢复标准冰，不沿用热饮时的空值', () => {
    expect(changeLineTemp(icedTea, '冰', null)).toEqual({ temp: '冰', ice: '标准冰' });
  });

  it('切回冰饮时保留仍在合法列表里的冰量', () => {
    expect(changeLineTemp(icedTea, '冰', '去冰')).toEqual({ temp: '冰', ice: '去冰' });
    expect(changeLineTemp(icedTea, '冰', '热饮')).toEqual({ temp: '冰', ice: '标准冰' });
  });

  it('全部冰量枚举与后端一致', () => {
    expect(ICE_OPTIONS).toEqual(['标准冰', '少冰', '去冰']);
  });
});
