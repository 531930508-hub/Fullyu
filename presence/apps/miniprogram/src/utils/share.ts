/**
 * 分享链路通用工具：
 * - 目标 → 页面路径
 * - 登录前记住落地页，登录成功后继续原目标
 * - 二维码 / H5 链接地址（优先同源，便于 H5 端画海报）
 */
import { BASE_URL } from './request'
import type { ShareType } from '@/api/skool'

const PENDING_KEY = 'pendingShareJump'

/** 小程序卡片与海报共用的 5:4 品牌视觉 */
export const BRAND_SHARE_IMAGE = '/static/brand/share-card.png'

/** 右上角「发送给朋友」卡片：默认分享整个小程序首页 */
export function brandShareMessage(
  title?: string,
  path = '/pages/index/index',
  imageUrl = BRAND_SHARE_IMAGE,
) {
  return {
    title: title || 'Full愈 · 在场',
    path,
    imageUrl,
  }
}

/** 右上角「分享到朋友圈」卡片 */
export function brandShareTimeline(
  title?: string,
  query = '',
  imageUrl = BRAND_SHARE_IMAGE,
) {
  return {
    title: title || 'Full愈 · 在场',
    query,
    imageUrl,
  }
}

export interface ShareTarget {
  type: ShareType
  id: string
}

/** 分享面板里的可切换目标 */
export interface ShareTargetOption extends ShareTarget {
  label: string
}

/** 每个分享目标对应的站内页面 */
export function shareTargetPath(type: ShareType, id: string, extra?: Record<string, string>): string {
  if (type === 'course') return `/pages/course-detail/index?id=${encodeURIComponent(id)}`
  if (type === 'community') return `/pages/community-detail/index?id=${encodeURIComponent(id)}`
  if (type === 'event') return `/pages/community-event-detail/index?id=${encodeURIComponent(id)}`
  if (type === 'host') return `/pages/community-detail/index?host=${encodeURIComponent(id)}`
  const query = new URLSearchParams({ ...(extra || {}) }).toString()
  return `/pages/share-landing/index?${query ? `${query}&` : ''}scene=${encodeURIComponent(`i${id}`)}`
}

/** 扫码 scene 可能被 URL 编码，统一解码并去掉空白 */
export function normalizeScene(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

/** 登录前记住要去的页面，登录成功后消费 */
export function rememberShareJump(url: string): void {
  if (!url) return
  try {
    uni.setStorageSync(PENDING_KEY, url)
  } catch {
    // 存储失败时不阻断主流程
  }
}

export function peekShareJump(): string {
  try {
    return uni.getStorageSync(PENDING_KEY) || ''
  } catch {
    return ''
  }
}

export function consumeShareJump(): string {
  const url = peekShareJump()
  if (url) {
    try {
      uni.removeStorageSync(PENDING_KEY)
    } catch {
      // ignore
    }
  }
  return url
}

/** 未登录：记录目标后去登录页（个人中心承载手机号登录） */
export function goLoginFor(url: string): void {
  rememberShareJump(url)
  uni.switchTab({ url: '/pages/profile/index' })
}

/** 二维码图片地址：H5 走同源代理，小程序走完整域名 */
export function buildQrUrl(scene: string): string {
  return `${BASE_URL}/share/qrcode?scene=${encodeURIComponent(scene)}`
}

/** H5 海报里的落地链接（小程序码不可用时由服务端回退为同一路径） */
export function buildH5SceneUrl(scene: string): string {
  const origin = BASE_URL.replace(/\/api\/v1\/?$/, '')
  return `${origin}/#/pages/share-landing/index?scene=${encodeURIComponent(scene)}`
}

/** 分享标题兜底：避免空标题导致微信卡片只显示“网页” */
export function safeShareTitle(title: string | undefined, fallback: string): string {
  const value = (title || '').trim()
  return value || fallback
}
