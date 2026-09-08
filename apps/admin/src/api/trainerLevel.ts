import { get, post, put, del } from './request'

/** 导师等级列表 */
export function listTrainerLevels() {
  return get('/trainer-levels')
}

/** 新增导师等级 */
export function createTrainerLevel(body: { level: number; name: string; hourlyRate?: number; sort?: number }) {
  return post('/trainer-levels', body)
}

/** 更新导师等级 */
export function updateTrainerLevel(id: string, body: { name?: string; hourlyRate?: number; sort?: number }) {
  return put(`/trainer-levels/${id}`, body)
}

/** 删除导师等级 */
export function removeTrainerLevel(id: string) {
  return del(`/trainer-levels/${id}`)
}
