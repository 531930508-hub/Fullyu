import { get, post, put } from './request'

/** 导师列表 */
export function listTrainers(params?: { keyword?: string; level?: number }) {
  return get('/trainers', params)
}

/** 导师详情 */
export function getTrainer(id: string) {
  return get(`/trainers/${id}`)
}

/** 创建导师档案 */
export function createTrainer(body: any) {
  return post('/trainers', body)
}

/** 更新导师档案 */
export function updateTrainer(id: string, body: any) {
  return put(`/trainers/${id}`, body)
}

/** 调整导师 Seeds */
export function adjustTrainerSeeds(id: string, amount: number, reason: string) {
  return post(`/trainers/${id}/seeds`, { amount, reason })
}
