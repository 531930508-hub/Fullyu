import { get, post, put } from './request'

/** 任务列表（后台） */
export function listTasks(status?: string) {
  return get('/tasks', { status })
}

/** 发布任务 */
export function createTask(body: any) {
  return post('/tasks', body)
}

/** 更新任务 */
export function updateTask(id: string, body: any) {
  return put(`/tasks/${id}`, body)
}

/** 取消任务 */
export function cancelTask(id: string) {
  return post(`/tasks/${id}/cancel`)
}

/** 审核完成任务（发放积分） */
export function completeTaskClaim(claimId: string) {
  return post(`/tasks/claims/${claimId}/complete`)
}
