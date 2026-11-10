import { describe, expect, it } from 'vitest';
import {
  POSTER_HEIGHT,
  POSTER_WIDTH,
  drawSharePoster,
  logoSrcCandidates,
  posterCopy,
  posterLayout
} from './sharePoster';

/** 只记录调用与文字的假 canvas 上下文，用来核对版式与文案。 */
function fakeCtx() {
  const texts = [];
  const images = [];
  const rects = [];
  return {
    texts,
    images,
    rects,
    fillRect: (...args) => rects.push(args),
    fillText: (text, x, y) => texts.push({ text, x, y }),
    drawImage: (...args) => images.push(args),
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {}
  };
}

describe('分享海报版式', () => {
  it('小程序码在白色卡片内水平居中，提示文字在小程序码下方', () => {
    const layout = posterLayout();

    expect(layout.width).toBe(POSTER_WIDTH);
    expect(layout.height).toBe(POSTER_HEIGHT);
    // 卡片居中，小程序码在卡片内四周留白。
    expect(layout.card.x).toBe((POSTER_WIDTH - layout.card.size) / 2);
    expect(layout.code.x).toBeGreaterThan(layout.card.x);
    expect(layout.code.y - layout.card.y).toBe(layout.code.x - layout.card.x);
    expect(layout.code.y).toBeGreaterThan(layout.card.y);
    expect(layout.code.x + layout.code.size).toBeLessThan(layout.card.x + layout.card.size);
    expect(layout.hint.y).toBeGreaterThan(layout.code.y + layout.code.size);
    expect(layout.footer.y).toBeLessThan(POSTER_HEIGHT);
  });

  it('等比缩小时版式仍居中且不溢出', () => {
    const layout = posterLayout(375, 500);

    expect(layout.code.x).toBeCloseTo((375 - layout.code.size) / 2, 5);
    expect(layout.code.y + layout.code.size).toBeLessThan(500);
    expect(layout.footer.y).toBeLessThan(500);
    expect(layout.bandHeight).toBe(150);
  });

  it('中文海报绘制品牌、标题、提示与小程序码', () => {
    const ctx = fakeCtx();
    const codeImage = { width: 430, height: 430 };

    drawSharePoster(ctx, codeImage);

    expect(ctx.texts.map((item) => item.text)).toEqual([
      'FULL愈',
      '时叙 · TEA HOUR',
      '一杯茶，回到此刻。',
      'A moment, all yours.',
      '微信扫一扫 · 进入时叙',
      'Full愈 · 时叙 · 纯茶鲜酿'
    ]);
    expect(ctx.images).toHaveLength(1);
    expect(ctx.images[0][0]).toBe(codeImage);
    // 先铺底色，再画顶部浅色带。
    expect(ctx.rects[0]).toEqual([0, 0, POSTER_WIDTH, POSTER_HEIGHT]);
    expect(ctx.rects[1]).toEqual([0, 0, POSTER_WIDTH, 300]);
  });

  it('提供品牌图时顶部画 LOGO，不再画文字', () => {
    const ctx = fakeCtx();
    const codeImage = { width: 430, height: 430 };
    const logoImage = { width: 449, height: 83 };

    drawSharePoster(ctx, codeImage, { logoImage });

    expect(ctx.texts).not.toContain('FULL愈');
    expect(ctx.images).toHaveLength(2);
    expect(ctx.images[0][0]).toBe(logoImage);
    // LOGO 水平居中，保持原始宽高比。
    const [image, x, y, width, height] = ctx.images[0];
    expect(image).toBe(logoImage);
    expect(x + width / 2).toBeCloseTo(POSTER_WIDTH / 2, 5);
    expect(width / height).toBeCloseTo(449 / 83, 3);
    expect(y).toBeGreaterThan(0);
  });

  it('LOGO 路径同时给出带与不带前导斜杠两种写法', () => {
    expect(logoSrcCandidates('/static/logo-zh.png')).toEqual([
      '/static/logo-zh.png',
      'static/logo-zh.png'
    ]);
    expect(logoSrcCandidates('static/logo-zh.png')).toEqual([
      'static/logo-zh.png',
      '/static/logo-zh.png'
    ]);
    expect(logoSrcCandidates('')).toEqual([]);
    expect(logoSrcCandidates(null)).toEqual([]);
  });

  it('LOGO 缺失时回退到品牌文字，海报仍然可用', () => {
    const ctx = fakeCtx();

    drawSharePoster(ctx, { width: 430, height: 430 });

    expect(ctx.texts[0].text).toBe('FULL愈');
    expect(ctx.images).toHaveLength(1);
  });

  it('英文海报切换文案但保留同一版式', () => {
    const ctx = fakeCtx();

    drawSharePoster(ctx, { width: 430, height: 430 }, { lang: 'en' });

    expect(posterCopy('en').title).toBe('A moment, all yours.');
    expect(ctx.texts[2].text).toBe('A moment, all yours.');
    expect(ctx.texts[4].text).toBe('Scan with WeChat to open Tea Hour');
  });
});
