import { get, post, put, del } from './request'

/** 按 code 获取启用选项（公开） */
export function getDictItems(code: string) {
  return get('/dicts/items', { code })
}

/** 全部值集 */
export function listDictSets() {
  return get('/dicts')
}

/** 创建值集 */
export function createDictSet(body: { code: string; name: string; desc?: string }) {
  return post('/dicts', body)
}

/** 更新值集 */
export function updateDictSet(id: string, body: any) {
  return put(`/dicts/${id}`, body)
}

/** 删除值集 */
export function removeDictSet(id: string) {
  return del(`/dicts/${id}`)
}

/** 保存值集选项 */
export function saveDictItems(id: string, items: any[]) {
  return put(`/dicts/${id}/items`, { items })
}
