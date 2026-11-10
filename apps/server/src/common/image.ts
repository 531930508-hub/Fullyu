/**
 * 上传图片的最小校验工具。
 * 服务端不引入 sharp（原生依赖会增加部署负担），只做三件事：
 * 1. 按文件头校验真实格式，避免伪造扩展名；
 * 2. 读取像素尺寸，首页运营图要求固定 1600×900；
 * 3. 控制体积，防止把大图直接塞进小程序首屏。
 */

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export function matchesImageSignature(buffer: Buffer, ext: string): boolean {
  if (ext === 'jpg') return buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (ext === 'png') {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return buffer.length > 8 && buffer.subarray(0, 8).equals(signature);
  }
  return (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

/** 读取 PNG / JPEG / WebP 的像素尺寸；无法识别时返回 null。 */
export function readImageSize(buffer: Buffer): { width: number; height: number } | null {
  try {
    if (matchesImageSignature(buffer, 'png')) {
      // IHDR 紧跟在 8 字节签名与 4 字节长度之后：16..23 为宽高。
      if (buffer.length < 24 || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (matchesImageSignature(buffer, 'jpg')) {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        let marker = buffer[offset + 1];
        // 填充字节与无长度的标记（RST/DHT 之外）逐个跳过。
        while (marker === 0xff && offset + 2 < buffer.length) {
          offset += 1;
          marker = buffer[offset + 1];
        }
        offset += 2;
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
        if (offset + 2 > buffer.length) return null;
        const length = buffer.readUInt16BE(offset);
        const isSof =
          marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof && offset + 7 <= buffer.length) {
          return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
        }
        offset += Math.max(2, length);
      }
      return null;
    }
    if (matchesImageSignature(buffer, 'webp') && buffer.length >= 30) {
      const format = buffer.subarray(12, 16).toString('ascii');
      if (format === 'VP8X') {
        return {
          width: 1 + buffer.readUIntLE(24, 3),
          height: 1 + buffer.readUIntLE(27, 3)
        };
      }
      if (format === 'VP8 ') {
        return {
          width: buffer.readUInt16LE(26) & 0x3fff,
          height: buffer.readUInt16LE(28) & 0x3fff
        };
      }
      if (format === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  } catch {
    /* 文件被截断时按无法识别处理 */
  }
  return null;
}
