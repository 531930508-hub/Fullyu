/**
 * 图片压缩与 data URL 读取。
 *
 * 头像 / 会员核验照片直接以 base64 上传，未压缩原图很容易超过 nginx 默认
 * 1MB 请求体限制，导致「上传失败」。这里统一先压缩到长边 720px 左右，
 * 并按真实文件头生成 MIME，避免把 PNG 误标成 JPEG。
 */

const DEFAULT_MAX_EDGE = 720
const DEFAULT_QUALITY = 0.82
/** 控制在 nginx 默认 1MB 请求体以内（含 base64 与 JSON 包装余量）。 */
const MAX_UPLOAD_BYTES = 900 * 1024

/** 图片处理失败提示：直接读本地语言，避免与 store 形成循环依赖 */
function imageError(zh: string, en: string): Error {
  return new Error(uni.getStorageSync('language') === 'en' ? en : zh)
}

function base64Bytes(base64: string): number {
  const payload = base64.replace(/\s/g, '')
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - padding
}

export function dataUrlBytes(dataUrl: string): number {
  const index = dataUrl.indexOf(',')
  return index >= 0 ? base64Bytes(dataUrl.slice(index + 1)) : 0
}

function mimeFromBase64(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png'
  if (base64.startsWith('UklGR')) return 'image/webp'
  if (base64.startsWith('R0lGOD')) return 'image/gif'
  return 'image/jpeg'
}

export interface CompressedImage {
  dataUrl: string
  bytes: number
}

/**
 * 读取并压缩本地图片，返回可直接提交后端的 data URL。
 * 压缩后仍超过约 900KB 时抛出可读错误，由页面提示重新选择。
 */
export async function compressImageToDataUrl(
  filePath: string,
  options: { maxEdge?: number; quality?: number } = {},
): Promise<string> {
  if (!filePath) throw imageError('未选择图片', 'No image selected.')
  const maxEdge = options.maxEdge || DEFAULT_MAX_EDGE
  const quality = options.quality || DEFAULT_QUALITY

  // #ifdef MP-WEIXIN
  const compressedPath = await new Promise<string>((resolve) => {
    const anyUni = uni as any
    if (typeof anyUni.compressImage !== 'function') return resolve(filePath)
    anyUni.compressImage({
      src: filePath,
      quality: Math.round(quality * 100),
      success: (res: any) => resolve(res.tempFilePath || filePath),
      fail: () => resolve(filePath),
    })
  })
  const base64 = await new Promise<string>((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath: compressedPath,
      encoding: 'base64',
      success: (r: any) => resolve(String(r.data || '')),
      fail: () => reject(imageError('图片读取失败，请重新选择', 'Could not read the image. Please choose another one.')),
    })
  })
  if (!base64) throw imageError('图片读取失败，请重新选择', 'Could not read the image. Please choose another one.')
  const dataUrl = `data:${mimeFromBase64(base64)};base64,${base64}`
  if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) {
    throw imageError('图片压缩后仍然过大，请换一张图片', 'The image is still too large after compression. Please choose another one.')
  }
  return dataUrl
  // #endif

  // #ifdef H5
  const source = await readH5Source(filePath)
  const image = await loadH5Image(source)
  let { width, height } = image
  if (width > maxEdge || height > maxEdge) {
    const ratio = Math.min(maxEdge / width, maxEdge / height)
    width = Math.max(1, Math.round(width * ratio))
    height = Math.max(1, Math.round(height * ratio))
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw imageError('当前浏览器无法处理图片，请更换浏览器', 'This browser cannot process the image. Please use another browser.')
  // 白底，避免 PNG 透明区域转 JPEG 后发黑
  ctx!.fillStyle = '#ffffff'
  ctx!.fillRect(0, 0, width, height)
  ctx!.drawImage(image, 0, 0, width, height)
  const qualities = [quality, 0.72, 0.6, 0.48, 0.36]
  for (const q of qualities) {
    const dataUrl = canvas.toDataURL('image/jpeg', q)
    if (dataUrlBytes(dataUrl) <= MAX_UPLOAD_BYTES) return dataUrl
  }
  throw imageError('图片压缩后仍然过大，请换一张图片', 'The image is still too large after compression. Please choose another one.')
  // #endif

  // 其它端（如 App）：无法压缩时直接读取原图
  return readGenericDataUrl(filePath)
}

// #ifdef H5
async function readH5Source(filePath: string): Promise<string> {
  if (filePath.startsWith('data:image/')) return filePath
  const response = await fetch(filePath)
  if (!response.ok) throw imageError('图片读取失败，请重新选择', 'Could not read the image. Please choose another one.')
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(imageError('图片读取失败，请重新选择', 'Could not read the image. Please choose another one.'))
    reader.readAsDataURL(blob)
  })
}

function loadH5Image(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(imageError('图片解析失败，请换一张图片', 'Could not read the image. Please choose another one.'))
    image.src = src
  })
}
// #endif

// #ifndef MP-WEIXIN
// #ifndef H5
async function readGenericDataUrl(filePath: string): Promise<string> {
  if (filePath.startsWith('data:image/')) return filePath
  const base64 = await new Promise<string>((resolve, reject) => {
    uni.getFileSystemManager?.().readFile({
      filePath,
      encoding: 'base64',
      success: (r: any) => resolve(String(r.data || '')),
      fail: () => reject(imageError('图片读取失败，请重新选择', 'Could not read the image. Please choose another one.')),
    })
  })
  if (!base64) throw imageError('图片读取失败，请重新选择', 'Could not read the image. Please choose another one.')
  return `data:${mimeFromBase64(base64)};base64,${base64}`
}
// #endif
// #endif
