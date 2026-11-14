/**
 * 小程序侧值集读取层。
 *
 * - 内存缓存（reactive，值集到达后引用它的页面会自动重渲染）+ 本地存储双缓存：
 *   冷启动先吃上一次成功结果，避免首屏闪回中文默认值；
 * - 同一 code 并发请求会合并，页面各自 onShow 里调用也不会重复打接口；
 * - 拉取失败时退回上次缓存（没有缓存则返回空数组），由页面自行兜底展示。
 *
 * 选项文案的中英文都在值集里配：英文取 labelEn，为空回退 label。
 */

import { reactive } from 'vue'
import { getDictItems, type DictItem } from '@/api/dict'
import { isEnglish } from '@/locale'

export type { DictItem }

/** 社群分类（值集里不含「全部」，筛选项由页面自己补） */
export const DICT_COMMUNITY_CATEGORY = 'community_category'
/** 社群标签 */
export const DICT_COMMUNITY_TAG = 'community_tag'

/** 启动时预热的常用值集 */
const WARMUP_CODES = [DICT_COMMUNITY_CATEGORY, DICT_COMMUNITY_TAG]

const EMPTY: DictItem[] = []
/** 用 reactive 存，值集晚到时已渲染的页面（标签、分类等）会自动更新 */
const cache = reactive<Record<string, DictItem[]>>({})
const inflight = new Map<string, Promise<DictItem[]>>()

function storageKey(code: string) {
  return `dict:${code}`
}

function readStorage(code: string): DictItem[] {
  try {
    const cached = uni.getStorageSync(storageKey(code))
    return Array.isArray(cached) ? (cached as DictItem[]) : []
  } catch {
    return []
  }
}

/** 同步吃本地缓存（App onLaunch 调用，让首屏就能拿到上次的选项） */
export function hydrateDicts(codes: string[] = WARMUP_CODES) {
  for (const code of codes) {
    if (cache[code]) continue
    const cached = readStorage(code)
    if (cached.length) cache[code] = cached
  }
}

/** 同步读取已缓存选项；未加载过返回空数组 */
export function dictItems(code: string): DictItem[] {
  return cache[code] || EMPTY
}

/** 拉取值集（默认走缓存；force=true 强制刷新，失败仍有缓存兜底） */
export function loadDict(code: string, force = false): Promise<DictItem[]> {
  const cached = cache[code]
  if (cached?.length && !force) return Promise.resolve(cached)
  const pending = inflight.get(code)
  if (pending) return pending

  const task = getDictItems(code)
    .then((items) => {
      const list = (items || []).filter((i) => i && i.value)
      cache[code] = list
      try {
        uni.setStorageSync(storageKey(code), list)
      } catch {
        // 存储写满等异常不影响本次展示
      }
      return list
    })
    .catch((error) => {
      if (cached) return cached
      throw error
    })
    .finally(() => {
      inflight.delete(code)
    })

  inflight.set(code, task)
  return task
}

/** 语言感知的选项文案：英文界面取 labelEn，缺失回退 label */
export function dictItemText(item: DictItem): string {
  if (isEnglish()) return item.labelEn || item.label || item.value
  return item.label || item.value
}

/** 按 value 取展示文案；值集里没有该值（如运营已下线）时按原值展示 */
export function dictText(code: string, value: string): string {
  if (!value) return ''
  const item = dictItems(code).find((i) => i.value === value)
  return item ? dictItemText(item) : value
}

/** App 启动时静默预热，失败不打扰用户 */
export function warmupDicts() {
  for (const code of WARMUP_CODES) {
    loadDict(code).catch(() => undefined)
  }
}