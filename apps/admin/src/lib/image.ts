/**
 * 商品图压缩：在浏览器端把长边压到 1600px 以内再上传。
 *
 * 门店用手机拍的图动辄 3–8MB，原样上传会让小程序首屏加载变慢；
 * 服务端不引入 sharp（原生依赖会拖累部署），压缩放在上传前最省事。
 * 文件名带随机后缀且内容不变，后端的长期强缓存因此是安全的。
 */
export const MAX_EDGE = 1600;
export const QUALITY = 0.82;
/** 小于这个体积且尺寸不超限的图直接原样上传，避免二次编码损失画质。 */
export const SKIP_COMPRESS_BYTES = 300 * 1024;
/** 与服务端上限一致。 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export type PreparedImage = {
  /** 带 data URL 前缀的 base64；服务端会自行剥离前缀。 */
  base64: string;
  contentType: string;
  /** 与 base64 相同，供 <img> 预览。 */
  preview: string;
};

/** 等比缩放到长边不超过 maxEdge；小图不放大，极端长图保留 1px 短边。 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

/** 优先 WebP；浏览器（Safari 旧版）不支持编码时回落 JPEG。 */
export function pickEncoding(webpSupported: boolean, _originalType: string): string {
  if (webpSupported) return 'image/webp';
  return 'image/jpeg';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败，请重新选择'));
    reader.readAsDataURL(file);
  });
}

function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('读取图片失败，请重新选择'));
    };
    img.src = url;
  });
}

function supportsWebp(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/**
 * 把用户选择的文件转成可直接上传的 base64。
 * 小图原样保留；大图或超大尺寸图片按长边 1600px、质量 0.82 重新编码。
 */
export async function prepareProductImage(
  file: File,
  options: { maxEdge?: number; quality?: number } = {}
): Promise<PreparedImage> {
  const maxEdge = options.maxEdge ?? MAX_EDGE;
  const quality = options.quality ?? QUALITY;
  const img = await decode(file);
  const fitted = fitWithin(img.naturalWidth, img.naturalHeight, maxEdge);

  const untouched =
    fitted.width === img.naturalWidth && fitted.height === img.naturalHeight && file.size <= SKIP_COMPRESS_BYTES;
  if (untouched) {
    const preview = await readAsDataUrl(file);
    return { base64: preview, contentType: file.type, preview };
  }

  const canvas = document.createElement('canvas');
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持图片处理，请换用新版浏览器');
  // 透明 PNG 转 WebP/JPEG 时铺白底，避免透明区变黑。
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, fitted.width, fitted.height);
  ctx.drawImage(img, 0, 0, fitted.width, fitted.height);

  let contentType = pickEncoding(supportsWebp(), file.type);
  let preview = canvas.toDataURL(contentType, quality);
  if (!preview.startsWith(`data:${contentType}`)) {
    contentType = 'image/jpeg';
    preview = canvas.toDataURL(contentType, quality);
  }
  const base64 = preview;
  const byteSize = Math.ceil((base64.length * 3) / 4);
  if (byteSize > MAX_UPLOAD_BYTES) {
    throw new Error('图片压缩后仍超过 2MB，请换一张更小的图片');
  }
  return { base64, contentType, preview };
}
