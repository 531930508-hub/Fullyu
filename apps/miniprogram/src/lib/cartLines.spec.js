import { describe, expect, test } from 'vitest';
import { productQtyInCart, repeatSpecFor } from './cartLines';

const line = (id, temp, ice, qty = 1) => ({
  key: `${id}-${temp}`,
  product: { id },
  temp,
  ice,
  qty
});

describe('repeatSpecFor', () => {
  test('同商品已在袋中时沿用上次的温度与冰量', () => {
    const lines = [line('tea-a', '冰', '少冰')];
    expect(repeatSpecFor(lines, 'tea-a')).toEqual({ temp: '冰', ice: '少冰' });
  });

  test('没有该商品时返回 null，让页面继续打开规格弹层', () => {
    expect(repeatSpecFor([line('tea-a', '热', null)], 'tea-b')).toBeNull();
    expect(repeatSpecFor([], 'tea-a')).toBeNull();
    expect(repeatSpecFor(null, 'tea-a')).toBeNull();
  });

  test('热饮不携带冰量', () => {
    expect(repeatSpecFor([line('tea-a', '热', null)], 'tea-a')).toEqual({ temp: '热', ice: null });
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
