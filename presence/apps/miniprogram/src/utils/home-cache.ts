/**
 * 首页列表软缓存。
 *
 * 页面重建（切换 tab 后返回）仍能命中，应用整体重新加载时自然失效；
 * 只缓存公开列表，账号相关数据（会员卡、订单）始终静默刷新。
 */
export const HOME_CACHE_TTL = 5 * 60 * 1000

export interface HomeCacheEntry<T = any> {
  data: T
  at: number
}

export const homeCache: {
  courses?: HomeCacheEntry
  venues?: HomeCacheEntry
  banners?: HomeCacheEntry
  communities?: HomeCacheEntry
  managed?: HomeCacheEntry
} = {}

export function cacheFresh(entry?: { at: number } | null): boolean {
  return Boolean(entry && Date.now() - entry.at < HOME_CACHE_TTL)
}
