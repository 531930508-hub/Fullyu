import {
  IMAGE_DATA_URL_MAX_BYTES,
  normalizeAvatarValue,
  normalizeImageDataUrl,
} from '../src/common/image.util'

function pngDataUrl(payloadBytes = 800): string {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const body = Buffer.concat([header, Buffer.alloc(payloadBytes, 0x01)])
  return `data:image/png;base64,${body.toString('base64')}`
}

describe('图片 data URL 校验', () => {
  it('接受真实 PNG 并规范 MIME', () => {
    const result = normalizeImageDataUrl(pngDataUrl())
    expect(result?.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('以文件头为准纠正伪造的 MIME', () => {
    const result = normalizeImageDataUrl(pngDataUrl().replace('image/png', 'image/jpeg'))
    expect(result?.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('拒绝临时路径和损坏的 base64', () => {
    expect(normalizeImageDataUrl('wxfile://tmp_avatar.jpg')).toBeNull()
    expect(normalizeImageDataUrl('data:image/png;base64,not-base64!!')).toBeNull()
  })

  it('拒绝小于有效下限的占位图', () => {
    const tiny = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(normalizeImageDataUrl(`data:image/png;base64,${tiny.toString('base64')}`)).toBeNull()
  })

  it('拒绝超过数据库承载上限的图片', () => {
    const oversized = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(IMAGE_DATA_URL_MAX_BYTES, 0x01),
    ])
    expect(normalizeImageDataUrl(`data:image/png;base64,${oversized.toString('base64')}`)).toBeNull()
  })

  it('头像字段允许 http(s) 地址，但拒绝临时文件路径', () => {
    expect(normalizeAvatarValue('https://cdn.example.com/avatar.jpg')).toBe(
      'https://cdn.example.com/avatar.jpg',
    )
    expect(normalizeAvatarValue('wxfile://tmp_avatar.jpg')).toBeNull()
    expect(normalizeAvatarValue(pngDataUrl())?.startsWith('data:image/png;base64,')).toBe(true)
  })
})
