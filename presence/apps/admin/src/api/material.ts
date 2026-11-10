import { get, post, put, del } from './request'

/** 物料列表 */
export function listMaterials() {
  return get('/materials')
}

/** 创建物料 */
export function createMaterial(body: any) {
  return post('/materials', body)
}

/** 更新物料 */
export function updateMaterial(id: string, body: any) {
  return put(`/materials/${id}`, body)
}

/** 删除物料 */
export function removeMaterial(id: string) {
  return del(`/materials/${id}`)
}
