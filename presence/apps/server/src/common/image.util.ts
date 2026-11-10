/**
 * 图片 data URL 校验与规范化。
 *
 * 会员核验照片、头像等以 base64 存 MySQL LONGTEXT，必须防止：
 * - 前端把临时路径 / 任意字符串当图片提交（后台显示裂图）
 * - 伪造 MIME 或截断的 base64
 * - 超大 payload 拖垮接口与数据库
 *
 * 校验以文件头（magic bytes）为准，不信任声明的 MIME。
 */

export const IMAGE_DATA_URL_MAX_BYTES = 5 * 1024 * 1024 // 单张图 ≤ 5MB
const IMAGE_DATA_URL_MIN_BYTES = 512

function detectMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png'
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

/**
 * 校验并规范化 data URL；非法返回 null。
 * 返回的字符串统一为 `data:image/<真实格式>;base64,<无空白 payload>`。
 */
export function normalizeImageDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(trimmed)
  if (!match) return null
  const payload = match[1].replace(/\s/g, '')
  if (!payload || payload.length % 4 !== 0) return null
  let buffer: Buffer
  try {
    buffer = Buffer.from(payload, 'base64')
  } catch {
    return null
  }
  if (buffer.length < IMAGE_DATA_URL_MIN_BYTES || buffer.length > IMAGE_DATA_URL_MAX_BYTES) {
    return null
  }
  // base64 往返必须一致，拒绝损坏/截断内容
  if (buffer.toString('base64').replace(/=+$/, '') !== payload.replace(/=+$/, '')) return null
  const mime = detectMime(buffer)
  if (!mime) return null
  return `data:image/${mime};base64,${payload}`
}

/** 是否为可展示的有效图片 data URL */
export function isValidImageDataUrl(value: unknown): boolean {
  return normalizeImageDataUrl(value) !== null
}

/**
 * 头像字段：允许已有 http(s) 图片地址，或合法 data URL；其它值拒绝。
 * 返回规范化后的值。
 */
export function normalizeAvatarValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\/\S+$/i.test(trimmed) && trimmed.length <= 2048) return trimmed
  return normalizeImageDataUrl(trimmed)
}
