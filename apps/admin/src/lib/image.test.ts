import { describe, expect, it } from 'vitest';
import { fitWithin, pickEncoding } from './image';

describe('商品图压缩', () => {
  it('长边超过上限时等比缩小，短边随比例变化', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('小图不放大，原尺寸返回', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('极端长图至少保留 1 像素短边', () => {
    expect(fitWithin(4000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });

  it('浏览器支持 WebP 时优先 WebP，否则回落到 JPEG', () => {
    expect(pickEncoding(true, 'image/png')).toBe('image/webp');
    expect(pickEncoding(false, 'image/png')).toBe('image/jpeg');
    expect(pickEncoding(false, 'image/jpeg')).toBe('image/jpeg');
  });
});
