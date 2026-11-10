import { get, post, put, del } from './request'

/** 后台 Banner 列表（全部状态） */
export function adminListBanners() {
  return get('/banners/admin/list')
}

/** 创建 Banner */
export function createBanner(body: any) {
  return post('/banners', body)
}

/** 更新 Banner */
export function updateBanner(id: string, body: any) {
  return put(`/banners/${id}`, body)
}

/** 启用/停用 Banner */
export function setBannerStatus(id: string, isActive: boolean) {
  return post(`/banners/${id}/status`, { isActive })
}

/** 删除 Banner */
export function deleteBanner(id: string) {
  return del(`/banners/${id}`)
}
