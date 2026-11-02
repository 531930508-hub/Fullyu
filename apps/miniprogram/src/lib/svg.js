// V7 视觉基线里图标与商品图形均为内联 SVG。
// 微信小程序 WXML 不支持内联 <svg>，这里把同一份路径串序列化后作为
// background-image（base64 data URL）渲染，图形、线宽、颜色与参考实现一致。

import QRCore from 'qrcode/lib/core/qrcode';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code >= 0xd800 && code < 0xdc00) {
      const next = str.charCodeAt((i += 1));
      const point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
      out.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 63), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
  }
  return out;
}

function base64(str) {
  const bytes = utf8Bytes(str);
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triple = (a << 16) | ((b || 0) << 8) | (c || 0);
    result += B64[(triple >> 18) & 63] + B64[(triple >> 12) & 63];
    result += b === undefined ? '=' : B64[(triple >> 6) & 63];
    result += c === undefined ? '=' : B64[triple & 63];
  }
  return result;
}

export function svgUrl(svg) {
  return `url("data:image/svg+xml;base64,${base64(svg)}")`;
}

/* ------------------------------- icons ------------------------------- */

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  cup:
    '<path d="M5 8h12v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8Z"/><path d="M17 9h2.2a2.8 2.8 0 1 1 0 5.6H17"/><path d="M4 21h14"/><path d="M9.5 3.5c-.7.9-.7 1.8 0 2.7M13 3.5c-.7.9-.7 1.8 0 2.7"/>',
  bag: '<path d="M5.5 8h13l1 12.5h-15L5.5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  receipt:
    '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  qr:
    '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5h-2.5zM19 19h1.5v1.5H19zM14.5 20.5H17M20.5 14.5V17"/>',
  pin:
    '<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  store:
    '<path d="M4 9 5.5 4h13L20 9"/><path d="M5 9v11h14V9"/><path d="M9.5 20v-6h5v6"/><path d="M4 9a2.4 2.4 0 0 0 4 1.6A2.4 2.4 0 0 0 12 10a2.4 2.4 0 0 0 4 .6A2.4 2.4 0 0 0 20 9"/>',
  refresh:
    '<path d="M20 11a8 8 0 0 0-14.5-4L3 10"/><path d="M3 5v5h5M4 13a8 8 0 0 0 14.5 4L21 14"/><path d="M21 19v-5h-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.4 15.4 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  arrowRight: '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
  alert: '<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 9v5M12 17.2v.1"/>',
  shield:
    '<path d="m12 3 8 3.4V13c0 4.5-8 8-8 8s-8-3.5-8-8V6.4L12 3Z"/><path d="m8.8 12 2.2 2.2 4.4-4.4"/>',
  settings:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7"/>',
  logout: '<path d="M14.5 4H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4.5"/><path d="m9.5 8 4 4-4 4"/><path d="M13.5 12H4"/>',
  package:
    '<path d="m3.5 7 8.5-4.5L20.5 7 12 11.5 3.5 7Z"/><path d="M3.5 7v10l8.5 4.5 8.5-4.5V7"/><path d="M12 11.5v10M7.5 4.8l9 4.7"/>',
  share:
    '<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="m8.3 10.7 7.4-4.1M8.3 13.3l7.4 4.1"/>'
};

const iconCache = new Map();

export function iconUrl(name, color = '#352f2b', strokeWidth = 1.6) {
  const key = `${name}|${color}|${strokeWidth}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const inner = PATHS[name] || PATHS.cup;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const url = svgUrl(svg);
  iconCache.set(key, url);
  return url;
}

/* ------------------------------ motifs ------------------------------ */

const MOTIF = {
  xing: 'M20 49a18 18 0 0 1 36 0M12 50h53M38 13v9M13 27l7 7M63 27l-7 7M24 60h28',
  song: 'M8 30c12-18 18 18 30 0s18 18 30 0M8 44c12-18 18 18 30 0s18 18 30 0M8 58c12-18 18 18 30 0s18 18 30 0',
  qing: 'm16 20 20 7-7 23c-3 8-20 3-18-5l5-25Zm34 0-18 9 10 21c4 7 18 0 15-7l-7-23ZM20 54l-3 11m-8-3 17 5M47 54l5 11m-6 4 15-8',
  mian: 'M53 15C32 17 33 46 55 46A25 25 0 1 1 53 15ZM58 6v8m-4-4h8'
};

const motifCache = new Map();

export function motifUrl(series, color = '#352f2b') {
  const key = `${series}|${color}`;
  if (motifCache.has(key)) return motifCache.get(key);
  const shape = MOTIF[series] || MOTIF.xing;
  const url = svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 76" fill="none" stroke="${color}" ` +
      `stroke-width="1.3" stroke-linecap="round"><path d="${shape}"/></svg>`
  );
  motifCache.set(key, url);
  return url;
}

/* ---------------------------- product art ---------------------------- */

const LIQUID = {
  xing: '#b88355',
  song: '#c29849',
  qing: '#9b985c',
  mian: '#96714b',
  retail: '#c6b789'
};

const SERIES_CHAR = { xing: '醒', song: '松', qing: '庆', mian: '眠', retail: '零售' };

export function retailTone(categoryId) {
  if (categoryId === 'boxes') return 'rose';
  if (categoryId === 'bags') return 'apricot';
  return 'sage';
}

export function productTone(product) {
  if (product.kind === 'retail') return retailTone(product.categoryId);
  return { xing: 'apricot', song: 'sage', qing: 'rose', mian: 'lilac' }[product.series] || 'apricot';
}

// 商品插画只由系列/类别决定：缓存后列表滚动和反复切换页面不再重复拼 SVG、转 base64。
const artCache = new Map();

export function productArtUrl(product) {
  const series = product.series || 'retail';
  const name = SERIES_CHAR[series] || SERIES_CHAR.retail;
  const cacheKey = `${product.kind}|${series}|${product.categoryId || ''}`;
  if (artCache.has(cacheKey)) return artCache.get(cacheKey);
  const url = buildProductArtUrl(product, series, name);
  artCache.set(cacheKey, url);
  return url;
}

function buildProductArtUrl(product, series, name) {
  if (product.kind === 'retail') {
    const fill = series === 'retail' ? { rose: '#edd9cf', apricot: '#f1deca', sage: '#dde5d9' }[retailTone(product.categoryId)] : '#dde5d9';
    return svgUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 140">` +
        `<path d="M25 31 39 20h61l8 11v84H25Z" fill="#fffefa" stroke="#a99a85"/>` +
        `<path d="M25 31h83M91 31v84" stroke="#a99a85"/>` +
        `<rect x="37" y="44" width="42" height="56" rx="3" fill="${fill}"/>` +
        `<text x="58" y="68" text-anchor="middle" fill="#352f2b" font-size="18" font-family="serif">${name}</text>` +
        `<text x="58" y="84" text-anchor="middle" fill="#352f2b" font-size="5">TEA HOUR</text>` +
        `<path d="M44 108h29" stroke="#a99a85"/>` +
        `</svg>`
    );
  }

  const liquid = LIQUID[series] || LIQUID.retail;
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 140">` +
      `<ellipse cx="65" cy="119" rx="28" ry="5" fill="#352f2b" opacity=".08"/>` +
      `<path d="M34 22h62l-6 90q-25 12-50 0Z" fill="#fffefa" opacity=".8" stroke="#b4ac9c"/>` +
      `<path d="M38 48h54l-4 61q-23 9-46 0Z" fill="${liquid}" opacity=".83"/>` +
      `<ellipse cx="65" cy="48" rx="27" ry="6" fill="${liquid}"/>` +
      `<ellipse cx="65" cy="22" rx="31" ry="7" fill="#fffcf4" stroke="#b4ac9c"/>` +
      `<path d="M39 56h52l-2 31H41Z" fill="#f7f1e4"/>` +
      `<text x="65" y="75" text-anchor="middle" fill="#694b3d" font-size="17" font-family="serif">${name}</text>` +
      `<text x="65" y="83" text-anchor="middle" fill="#706b65" font-size="4" letter-spacing="1">TEA HOUR</text>` +
      `<path d="M44 31 48 105" stroke="#fff" stroke-width="3" opacity=".6"/>` +
      `</svg>`
  );
}

/* -------------------------------- qr -------------------------------- */

// 会员码/取货码在弹层反复打开时值不变：缓存编码结果，避免重复跑 Reed-Solomon。
const qrCache = new Map();

export function qrSvgUrl(value, color = '#352f2b', background = '#fffefa') {
  const cacheKey = `${value}|${color}|${background}`;
  if (qrCache.has(cacheKey)) return qrCache.get(cacheKey);
  const url = buildQrSvgUrl(value, color, background);
  qrCache.set(cacheKey, url);
  // 二维码值基本只有会员码与订单号，保留最近 40 个足够，防止长时间使用无限增长。
  if (qrCache.size > 40) qrCache.delete(qrCache.keys().next().value);
  return url;
}

function buildQrSvgUrl(value, color, background) {
  // 与参考端相同的 qrcode 编码器（lib/core 为纯 JS，无 Node 依赖）。
  const qr = QRCore.create(String(value || '—'), { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const margin = 2;
  let rects = '';
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < size && data[y * size + x + run]) run += 1;
      rects += `<rect x="${x + margin}" y="${y + margin}" width="${run}" height="1"/>`;
      x += run;
    }
  }
  const total = size + margin * 2;
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
      `<rect width="${total}" height="${total}" fill="${background}"/>` +
      `<g fill="${color}">${rects}</g></svg>`
  );
}
