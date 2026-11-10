/**
 * 分享海报绘制（375×500 逻辑尺寸，导出 750×1000）。
 * 只使用品牌底色、文字和二维码，不绘制远端封面，避免 H5 canvas 跨域污染。
 */
import { buildQrUrl } from './share'

export interface PosterInput {
  title: string
  subtitle: string
  label?: string
  scene: string
  palette?: 'warm' | 'sage' | 'ink'
}

interface Palette {
  bg: string
  bar: string
  ink: string
  muted: string
  accent: string
}

const PALETTES: Record<string, Palette> = {
  warm: { bg: '#f5f6ed', bar: '#683611', ink: '#3a2a1a', muted: '#756a55', accent: '#96581c' },
  sage: { bg: '#f2f3e9', bar: '#5c6b34', ink: '#2f3524', muted: '#6b705c', accent: '#5c6b34' },
  ink: { bg: '#f3f1ec', bar: '#2a211a', ink: '#2a211a', muted: '#6e6558', accent: '#3a2a1a' },
}

export const POSTER_WIDTH = 375
export const POSTER_HEIGHT = 500

function download(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error(`download failed: ${res.statusCode}`))
      },
      fail: reject,
    })
  })
}

/** 逐字换行：中英文混排时优先完整保留英文单词 */
function wrapText(
  ctx: any,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const source = (text || '').replace(/\s+/g, ' ').trim()
  if (!source) return []
  const lines: string[] = []
  let line = ''
  const width = (value: string) => {
    try {
      return ctx.measureText(value).width
    } catch {
      return value.length * 12
    }
  }
  for (const char of source) {
    const next = line + char
    if (line && width(next) > maxWidth) {
      lines.push(line)
      line = char
      if (lines.length === maxLines) return lines
    } else {
      line = next
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]
    if (width(`${last}…`) <= maxWidth + 6 && last.length < source.length) lines[maxLines - 1] = `${last}…`
  }
  return lines
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0)
  ctx.lineTo(x + w, y + h - r)
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2)
  ctx.lineTo(x + r, y + h)
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + r)
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5)
  ctx.closePath()
  ctx.fill()
}

function drawPoster(ctx: any, input: PosterInput, qrPath: string) {
  const p = PALETTES[input.palette || 'warm'] || PALETTES.warm
  const W = POSTER_WIDTH
  const H = POSTER_HEIGHT

  ctx.setFillStyle(p.bg)
  ctx.fillRect(0, 0, W, H)
  ctx.setFillStyle(p.bar)
  ctx.fillRect(0, 0, 10, H)

  ctx.setFillStyle(p.muted)
  ctx.setFontSize(11)
  ctx.fillText('FULL愈 · 在场', 36, 46)

  ctx.setFillStyle(p.accent)
  ctx.setFontSize(11)
  ctx.fillText(input.label || '分享', 36, 74)

  ctx.setFillStyle(p.ink)
  ctx.setFontSize(25)
  const titleLines = wrapText(ctx, input.title, W - 72, 2)
  titleLines.forEach((line, index) => ctx.fillText(line, 36, 118 + index * 35))

  ctx.setFillStyle(p.muted)
  ctx.setFontSize(13)
  const subtitleY = 118 + titleLines.length * 35 + 12
  wrapText(ctx, input.subtitle, W - 72, 2).forEach((line, index) => {
    ctx.fillText(line, 36, subtitleY + index * 22)
  })

  ctx.setFillStyle(p.bar)
  ctx.fillRect(36, H - 168, 28, 2)

  const card = 124
  const cardX = W - 36 - card
  const cardY = H - 36 - card
  ctx.setFillStyle('#ffffff')
  roundRect(ctx, cardX, cardY, card, card, 14)
  ctx.drawImage(qrPath, cardX + 11, cardY + 11, card - 22, card - 22)

  ctx.setFillStyle(p.ink)
  ctx.setFontSize(13)
  ctx.fillText('长按识别小程序码', 36, H - 104)
  ctx.setFillStyle(p.muted)
  ctx.setFontSize(11)
  ctx.fillText('打开 Full愈 · 进入同一页面', 36, H - 80)
  ctx.fillText('Full愈 · 城市微度假', 36, H - 58)
}

/** 绘制并导出海报临时文件；失败时抛出可展示的错误 */
export async function generateSharePoster(instance: any, input: PosterInput): Promise<string> {
  // 服务端已在小程序码不可用时回退为 H5 链接二维码，这里只处理下载失败
  const qrPath = await download(buildQrUrl(input.scene)).catch(() => {
    throw new Error('二维码加载失败，请检查网络后重试')
  })

  const ctx = uni.createCanvasContext('sharePoster', instance)
  drawPoster(ctx, input, qrPath)

  await new Promise<void>((resolve, reject) => {
    ctx.draw(false, () => setTimeout(() => resolve(), 120))
    // draw 无失败回调；超时保护由外层控制
    setTimeout(() => reject(new Error('海报绘制超时')), 8000)
  })

  const result: any = await new Promise((resolve, reject) => {
    uni.canvasToTempFilePath(
      {
        canvasId: 'sharePoster',
        x: 0,
        y: 0,
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        destWidth: POSTER_WIDTH * 2,
        destHeight: POSTER_HEIGHT * 2,
        fileType: 'jpg',
        quality: 0.92,
        success: resolve,
        fail: reject,
      },
      instance,
    )
  })
  return result.tempFilePath as string
}

/** 保存海报：小程序写入相册；H5 触发浏览器下载 */
export async function savePosterImage(path: string): Promise<void> {
  // #ifdef H5
  const anchor = document.createElement('a')
  anchor.href = path
  anchor.download = 'Full愈-分享海报.jpg'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  return
  // #endif
  // #ifndef H5
  await new Promise<void>((resolve, reject) => {
    uni.saveImageToPhotosAlbum({
      filePath: path,
      success: () => resolve(),
      fail: (error: any) => {
        const message = String(error?.errMsg || '')
        if (message.includes('auth') || message.includes('authorize')) {
          uni.showModal({
            title: '需要相册权限',
            content: '请在设置里允许保存图片到相册。',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) uni.openSetting({})
            },
          })
          reject(new Error('未获得相册权限'))
          return
        }
        reject(new Error(message || '保存失败'))
      },
    })
  })
  // #endif
}
