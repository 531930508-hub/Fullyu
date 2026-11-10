/** 首页 Banner API */
import { get } from '@/utils/request'

export interface BannerItem {
  id: string
  title: string
  subtitle?: string
  bg?: string
  imageUrl?: string
  linkType?: string
  linkValue?: string
  sortOrder?: number
}

/** 首页 Banner 列表（公开，仅启用） */
export function listBanners() {
  // silent：后端未启动时静默降级，首页保留默认运营位
  return get<BannerItem[]>('/banners', undefined, { auth: false, silent: true })
}
