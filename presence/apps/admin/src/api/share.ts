import { get, post } from './request'

export type ShareType = 'course' | 'community' | 'event' | 'host' | 'invite'

export interface ShareArtwork {
  source: 'custom' | 'cover' | 'brand'
  palette: 'warm' | 'sage' | 'ink'
  layout: 'left' | 'center'
  imageUrl?: string
  updatedAt?: string
}

export interface SharePayload {
  type: ShareType
  id: string
  available: boolean
  state: 'normal' | 'ended' | 'restricted' | 'unavailable'
  reason?: string
  title: string
  subtitle: string
  description?: string
  path: string
  scene: string
  imageUrl: string
  qrUrl: string
  artwork: ShareArtwork
}

export interface SharePreviewTarget {
  type: ShareType
  id: string
  title: string
  date?: string
}

export interface SharePreviewTargets {
  community: SharePreviewTarget | null
  host: SharePreviewTarget | null
  events: SharePreviewTarget[]
}

/** 分享目标（卡片标题、落地路径、二维码、视觉配置） */
export function getShareTarget(type: ShareType, id: string) {
  return get<SharePayload>('/share/target', { type, id })
}

/** 扫码 scene 落地解析（与小程序同源逻辑） */
export function resolveShareScene(scene: string) {
  return get<{ available: boolean; state: string; reason?: string; type: ShareType; id: string; title: string; subtitle: string; path: string; imageUrl: string }>('/share/resolve', { scene })
}

/** 后台预览候选：社群、主理人、活动 */
export function previewShareTargets(communityId: string) {
  return get<SharePreviewTargets>('/share/preview-targets', { communityId })
}

/** 保存社群 / 活动的分享视觉配置 */
export function saveShareArtwork(body: { communityId?: string; eventId?: string; artwork: Partial<ShareArtwork> }) {
  return post<{ artwork: ShareArtwork }>('/share/artwork', body)
}

/** 默认品牌 5:4 分享图 */
export function defaultShareArtUrl() {
  return '/api/v1/share/art/default-5x4.jpg'
}
