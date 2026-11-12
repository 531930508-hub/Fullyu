import { get, post, put } from './request'

/** 导师列表（后台：需 trainer:view，含手机号/时薪/积分） */
export function listTrainers(params?: { keyword?: string; level?: number; status?: string }) {
  return get('/trainers/admin/list', params)
}

/** 导师下拉选项（只取公开字段的子集，供课程/结算等表单使用） */
export function listTrainerOptions(params?: { keyword?: string; level?: number }) {
  return get('/trainers', params)
}

/** 导师详情（后台） */
export function getTrainer(id: string) {
  return get(`/trainers/admin/detail/${id}`)
}

/** 创建导师档案 */
export function createTrainer(body: any) {
  return post('/trainers', body)
}

/** 更新导师档案 */
export function updateTrainer(id: string, body: any) {
  return put(`/trainers/${id}`, body)
}

/** 调整导师积分 */
export function adjustTrainerSeeds(id: string, amount: number, reason: string) {
  return post(`/trainers/${id}/seeds`, { amount, reason })
}
