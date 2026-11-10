/**
 * 桌签二维码。
 *
 * 扫码内容与小程序 scanTable 约定一致：`门店 id|座位名`。
 * 编码器复用 qrcode 的纯 JS core（与小程序端同一套实现），
 * 输出 SVG 字符串，后台直接内联渲染或写入打印窗口，不依赖 canvas。
 */
import QRCore from 'qrcode/lib/core/qrcode';

export const seatCode = (storeId: string, seat: string) => `${storeId}|${seat}`;

/**
 * 桌签二维码内容。
 * 配置了链接前缀后生成 https 链接：顾客用微信原生「扫一扫」识别已登记的
 * 「扫普通链接二维码打开小程序」规则时，会直接打开小程序并把链接放进 q 参数。
 * 未配置时保留「门店ID|位置」纯文本码，供小程序内「扫桌签」识别。
 */
export const seatQrValue = (baseUrl: string, storeId: string, seat: string) => {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return seatCode(storeId, seat);
  const join = base.indexOf('?') === -1 ? '?' : '&';
  return `${base}${join}store=${encodeURIComponent(storeId)}&seat=${encodeURIComponent(seat)}`;
};

export function qrSvg(value: string, color = '#352f2b', background = '#fffefa') {
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
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${background}"/>` +
    `<g fill="${color}">${rects}</g></svg>`
  );
}

export const qrDataUrl = (value: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(value))}`;

type SeatTag = { seat: string; value: string; code?: string; native?: boolean };

const TAG_W = 720;
const TAG_H = 900;

function qrBox(ctx: CanvasRenderingContext2D, value: string, left: number, top: number, box: number) {
  const qr = QRCore.create(String(value || '—'), { errorCorrectionLevel: 'M' });
  const { size, data } = qr.modules;
  const margin = 4;
  const unit = box / (size + margin * 2);
  ctx.fillStyle = '#fffefa';
  ctx.fillRect(left, top, box, box);
  ctx.fillStyle = '#352f2b';
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < size && data[y * size + x + run]) run += 1;
      ctx.fillRect(left + (margin + x) * unit, top + (margin + y) * unit, run * unit, unit);
      x += run;
    }
  }
}

/** 在画布上画一张桌签：二维码 + 座位名 + 门店名。供下载 PNG 或拼整张 A4 图使用。 */
function drawSeatTag(ctx: CanvasRenderingContext2D, storeName: string, tag: SeatTag, x: number, y: number) {
  ctx.fillStyle = '#fffefa';
  ctx.fillRect(x, y, TAG_W, TAG_H);
  ctx.strokeStyle = '#d9d1c3';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, TAG_W - 2, TAG_H - 2);

  qrBox(ctx, tag.value, x + (TAG_W - 560) / 2, y + 40, 560);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#352f2b';
  ctx.font = '600 56px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText(tag.seat, x + TAG_W / 2, y + 700);
  ctx.font = '400 26px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText(storeName, x + TAG_W / 2, y + 748);
  ctx.fillStyle = '#706b65';
  ctx.font = '400 22px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText(tag.native ? '微信扫一扫 · 直接打开小程序点单' : '打开小程序 · 扫桌签点单', x + TAG_W / 2, y + 792);
  // 链接码不适合把整段 URL 印在桌签上，由调用方传入一句可读的 footer；
  // 纯文本码仍展示「门店ID|位置」，便于店员核对。
  const footer = tag.code == null ? tag.value : tag.code;
  if (footer) {
    let fontSize = 18;
    ctx.font = `400 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const maxWidth = TAG_W - 60;
    while (fontSize > 12 && ctx.measureText(footer).width > maxWidth) {
      fontSize -= 1;
      ctx.font = `400 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    }
    ctx.fillStyle = '#a29a8e';
    ctx.fillText(footer, x + TAG_W / 2, y + 840);
  }
}

function download(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const safeName = (value: string) => String(value || '').replace(/[\\/:*?"<>|\s]+/g, '-');

/** 下载单张桌签 PNG（2 倍尺寸，适合交给打印店）。 */
export function downloadSeatTagPng(storeName: string, tag: SeatTag) {
  const canvas = document.createElement('canvas');
  canvas.width = TAG_W * 2;
  canvas.height = TAG_H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持生成桌签图片');
  ctx.scale(2, 2);
  drawSeatTag(ctx, storeName, tag, 0, 0);
  download(canvas.toDataURL('image/png'), `${safeName(storeName)}-${safeName(tag.seat)}-桌签.png`);
}

/** 下载整店桌签拼图（2 列，便于打印店整版印刷后裁切）。 */
export function downloadSeatTagsPng(storeName: string, tags: SeatTag[]) {
  if (!tags.length) throw new Error('还没有可下载的桌签');
  const gap = 28;
  const pad = 36;
  const cols = 2;
  const rows = Math.ceil(tags.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = pad * 2 + cols * TAG_W + (cols - 1) * gap;
  canvas.height = pad * 2 + rows * TAG_H + (rows - 1) * gap;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持生成桌签图片');
  ctx.fillStyle = '#f3efe8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  tags.forEach((tag, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    drawSeatTag(ctx, storeName, tag, pad + col * (TAG_W + gap), pad + row * (TAG_H + gap));
  });
  download(
    canvas.toDataURL('image/png'),
    `${safeName(storeName)}-桌签-${tags.length}张.png`
  );
}

/**
 * 打开打印窗口，按 2 列 × 多行排桌签。
 * 只写标签内容，不继承后台样式，避免打印时带出导航与表单。
 */
export function printSeatTags(storeName: string, tags: SeatTag[]) {
  const win = window.open('', '_blank', 'width=900,height=760');
  if (!win) throw new Error('浏览器拦截了打印窗口，请允许弹窗后重试');
  const cards = tags
    .map((tag) => {
      const footer = tag.code == null ? tag.value : tag.code;
      return (
        `<article class="tag">` +
        `<img src="${qrDataUrl(tag.value)}" alt="${tag.seat}" />` +
        `<h2>${tag.seat}</h2>` +
        `<p>${storeName} · ${tag.native ? '微信扫一扫直接打开小程序点单' : '小程序内扫码点单'}</p>` +
        (footer ? `<small>${footer}</small>` : '') +
        `</article>`
      );
    })
    .join('');
  win.document.write(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${storeName} 桌签</title>` +
      `<style>` +
      `*{box-sizing:border-box}body{margin:0;padding:16px;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#fff;color:#352f2b}` +
      `.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}` +
      `.tag{border:1px solid #d9d1c3;border-radius:12px;padding:16px;text-align:center;page-break-inside:avoid}` +
      `.tag img{width:172px;height:172px;display:block;margin:0 auto 8px}` +
      `.tag h2{margin:0;font-size:24px;letter-spacing:.04em}` +
      `.tag p{margin:4px 0 0;font-size:12px;color:#706b65}` +
      `.tag small{display:block;margin-top:6px;font-size:10px;color:#a29a8e;letter-spacing:.06em}` +
      `@media print{body{padding:0}.grid{gap:10px}.tag{border-color:#bbb}}` +
      `</style></head><body><div class="grid">${cards}</div>` +
      `<script>window.onload=function(){window.print()}</script>` +
      `</body></html>`
  );
  win.document.close();
}
