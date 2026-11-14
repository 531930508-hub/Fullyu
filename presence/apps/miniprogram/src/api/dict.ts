/**
 * 值集字典 API（对应后端 /dicts/items，公开接口）。
 *
 * 运营在后台「值集管理」里维护的可选项统一从这儿取，前端不再写死列表。
 * 取值请优先用 `@/utils/dict` 里的 `loadDict / dictText`（带缓存与语言回退）。
 */

import { get } from '@/utils/request'

export interface DictItem {
  value: string
  label: string
  /** 英文文案，后端未配置时为空，展示时回退 label */
  labelEn?: string | null
  color?: string | null
  enabled?: boolean
  sort?: number
}

/** 按值集 code 获取启用中的选项（按 sort 排序） */
export function getDictItems(code: string) {
  return get<DictItem[]>('/dicts/items', { code }, { auth: false, silent: true })
}