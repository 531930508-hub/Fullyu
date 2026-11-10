/**
 * 分享海报：把微信小程序码画在品牌底色上，输出一张可以直接存进相册的图。
 *
 * 只在微信小程序里真正绘制（canvas 2d）。H5 预览没有相册与 canvas 节点，
 * 页面会退回复制链接，不会假装已经保存。
 */

export const POSTER_WIDTH = 750;
export const POSTER_HEIGHT = 1000;

const COPY = {
  zh: {
    brand: 'FULL愈',
    sub: '时叙 · TEA HOUR',
    title: '一杯茶，回到此刻。',
    subtitle: 'A moment, all yours.',
    hint: '微信扫一扫 · 进入时叙',
    footer: 'Full愈 · 时叙 · 纯茶鲜酿'
  },
  en: {
    brand: 'FULL愈',
    sub: 'TEA HOUR',
    title: 'A moment, all yours.',
    subtitle: 'Freshly brewed, pure tea',
    hint: 'Scan with WeChat to open Tea Hour',
    footer: 'Full愈 · Tea Hour'
  }
};

export function posterCopy(lang) {
  return COPY[lang] || COPY.zh;
}

/**
 * LOGO 的候选路径：包内资源在不同基础库下既接受 `/static/x.png`，
 * 也接受去掉前导斜杠的写法；canvas.createImage 对两种写法兼容性不同，
 * 逐个尝试，避免一张海报因为取图失败退回文字。
 */
export function logoSrcCandidates(src) {
  const value = String(src || '').trim();
  if (!value) return [];
  const list = value.startsWith('/') ? [value, value.slice(1)] : [value, `/${value}`];
  return list.filter((item, index) => item && list.indexOf(item) === index);
}

/** 海报元素坐标：纯函数，方便在没有 canvas 的环境核对版式。 */
export function posterLayout(width = POSTER_WIDTH, height = POSTER_HEIGHT) {
  const scale = Math.min(width / POSTER_WIDTH, height / POSTER_HEIGHT);
  const codeSize = Math.round(380 * scale);
  const padding = Math.round(26 * scale);
  const codeX = (width - codeSize) / 2;
  const codeY = Math.round(460 * scale);
  return {
    width,
    height,
    scale,
    bandHeight: Math.round(300 * scale),
    // 顶部品牌位优先放 LOGO；加载失败时才回退到文字。
    logo: { x: width / 2, y: Math.round(104 * scale), height: Math.round(72 * scale), maxWidth: Math.round(340 * scale) },
    brand: { x: width / 2, y: Math.round(152 * scale), size: Math.round(62 * scale) },
    sub: { x: width / 2, y: Math.round(206 * scale), size: Math.round(22 * scale) },
    divider: { x: width / 2, y: Math.round(250 * scale), width: Math.round(64 * scale) },
    title: { x: width / 2, y: Math.round(342 * scale), size: Math.round(44 * scale) },
    subtitle: { x: width / 2, y: Math.round(396 * scale), size: Math.round(24 * scale) },
    card: { x: codeX, y: codeY, size: codeSize, radius: Math.round(26 * scale) },
    code: { x: codeX + padding, y: codeY + padding, size: codeSize - padding * 2 },
    hint: { x: width / 2, y: codeY + codeSize + Math.round(66 * scale), size: Math.round(24 * scale) },
    footer: { x: width / 2, y: height - Math.round(52 * scale), size: Math.round(18 * scale) }
  };
}

export function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * 绘制海报。ctx 为小程序 canvas 2d 上下文，codeImage 为已加载的小程序码图片。
 * 配色沿用小程序现有米色与棕色，不引入新的品牌色。
 */
export function drawSharePoster(ctx, codeImage, options = {}) {
  const layout = posterLayout(options.width, options.height);
  const copy = posterCopy(options.lang);

  ctx.fillStyle = '#f5ede3';
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.fillStyle = 'rgba(105, 75, 61, 0.06)';
  ctx.fillRect(0, 0, layout.width, layout.bandHeight);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const logo = options.logoImage;
  const logoWidth = Number(logo && logo.width) || 0;
  const logoHeight = Number(logo && logo.height) || 0;
  if (logo && logoWidth > 0 && logoHeight > 0) {
    let drawHeight = layout.logo.height;
    let drawWidth = (drawHeight * logoWidth) / logoHeight;
    if (drawWidth > layout.logo.maxWidth) {
      drawWidth = layout.logo.maxWidth;
      drawHeight = (drawWidth * logoHeight) / logoWidth;
    }
    ctx.drawImage(logo, layout.logo.x - drawWidth / 2, layout.logo.y, drawWidth, drawHeight);
  } else {
    ctx.fillStyle = '#58411f';
    ctx.font = `600 ${layout.brand.size}px "Songti SC", "Noto Serif SC", serif`;
    ctx.fillText(copy.brand, layout.brand.x, layout.brand.y);
  }

  ctx.fillStyle = '#8a6a40';
  ctx.font = `400 ${layout.sub.size}px sans-serif`;
  ctx.fillText(copy.sub, layout.sub.x, layout.sub.y);

  ctx.strokeStyle = '#c9b19a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(layout.divider.x - layout.divider.width / 2, layout.divider.y);
  ctx.lineTo(layout.divider.x + layout.divider.width / 2, layout.divider.y);
  ctx.stroke();

  ctx.fillStyle = '#4a3520';
  ctx.font = `600 ${layout.title.size}px "Songti SC", "Noto Serif SC", serif`;
  ctx.fillText(copy.title, layout.title.x, layout.title.y);

  ctx.fillStyle = '#8a6a40';
  ctx.font = `italic 400 ${layout.subtitle.size}px "Iowan Old Style", Georgia, serif`;
  ctx.fillText(copy.subtitle, layout.subtitle.x, layout.subtitle.y);

  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, layout.card.x, layout.card.y, layout.card.size, layout.card.size, layout.card.radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(88, 65, 31, 0.08)';
  ctx.lineWidth = 1;
  roundedRect(ctx, layout.card.x, layout.card.y, layout.card.size, layout.card.size, layout.card.radius);
  ctx.stroke();

  ctx.drawImage(codeImage, layout.code.x, layout.code.y, layout.code.size, layout.code.size);

  ctx.fillStyle = '#58411f';
  ctx.font = `500 ${layout.hint.size}px sans-serif`;
  ctx.fillText(copy.hint, layout.hint.x, layout.hint.y);

  ctx.fillStyle = '#a08a70';
  ctx.font = `400 ${layout.footer.size}px sans-serif`;
  ctx.fillText(copy.footer, layout.footer.x, layout.footer.y);

  return layout;
}
