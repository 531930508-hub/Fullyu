import { describe, expect, test } from 'vitest';
import { lastSpecFor, needsSpecChoice, productQtyInCart } from './cartLines';

const line = (id, temp, ice, qty = 1) => ({
  key: `${id}-${temp}`,
  product: { id },
  temp,
  ice,
  qty
});

describe('lastSpecFor', () => {
  test('同商品已在袋中时返回上次的温度与冰量，用于弹层预选', () => {
    const lines = [line('tea-a', '冰', '少冰')];
    expect(lastSpecFor(lines, 'tea-a')).toEqual({ temp: '冰', ice: '少冰' });
  });

  test('没有该商品时返回 null', () => {
    expect(lastSpecFor([line('tea-a', '热', null)], 'tea-b')).toBeNull();
    expect(lastSpecFor([], 'tea-a')).toBeNull();
    expect(lastSpecFor(null, 'tea-a')).toBeNull();
  });

  test('同款已分成冷热两行时，预选最后加入的那一行', () => {
    const lines = [line('tea-a', '热', null), line('tea-a', '冰', '少冰')];
    expect(lastSpecFor(lines, 'tea-a')).toEqual({ temp: '冰', ice: '少冰' });
  });

  test('热饮不携带冰量', () => {
    expect(lastSpecFor([line('tea-a', '热', null)], 'tea-a')).toEqual({ temp: '热', ice: null });
  });
});

describe('needsSpecChoice', () => {
  test('多温度或可选冰量的茶必须先选规格，不能直接沿用上一杯', () => {
    expect(needsSpecChoice({ temps: ['热', '冰'], ice: true })).toBe(true);
    expect(needsSpecChoice({ temps: ['冰'], ice: true })).toBe(true);
    expect(needsSpecChoice({ temps: ['热', '冰'], ice: false })).toBe(true);
  });

  test('只有一种温度且没有冰量选择时可以直接加购', () => {
    expect(needsSpecChoice({ temps: ['热'], ice: false })).toBe(false);
    // 后端给眠系列保留了 ice 标记，但只有热饮，实际没有可选项。
    expect(needsSpecChoice({ temps: ['热'], ice: true })).toBe(false);
    expect(needsSpecChoice({})).toBe(false);
    expect(needsSpecChoice(null)).toBe(false);
  });
});

describe('productQtyInCart', () => {
  test('同一商品的热饮与冰饮两行合并计数', () => {
    const lines = [line('tea-a', '热', null, 2), line('tea-a', '冰', '标准冰', 1), line('tea-b', '热', null, 4)];
    expect(productQtyInCart(lines, 'tea-a')).toBe(3);
    expect(productQtyInCart(lines, 'tea-b')).toBe(4);
    expect(productQtyInCart(lines, 'tea-c')).toBe(0);
  });
});
