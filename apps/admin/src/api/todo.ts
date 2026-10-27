import { get, post } from './request'
import type {
  ApprovalDetailResult,
  RefundDetailResult,
  TodoCounts,
  TodoListResult,
} from '@fullyu/shared'

/** 统一待办列表（后端按权限裁剪来源） */
export function listTodos() {
  return get<TodoListResult>('/todos')
}

/** 侧边栏红点：只数条数 */
export function getTodoCounts() {
  return get<TodoCounts>('/todos/count')
}

/** 审批详情（含业务上下文与是否可表决） */
export function getTodoApproval(id: string) {
  return get<ApprovalDetailResult>(`/todos/approvals/${id}`)
}

/** 退款跟进详情 */
export function getTodoRefund(orderId: string) {
  return get<RefundDetailResult>(`/todos/refunds/${orderId}`)
}

/** 复用审批引擎的表决接口 */
export function approveTodo(id: string, comment?: string) {
  return post(`/approvals/instances/${id}/approve`, { comment })
}

export function rejectTodo(id: string, comment?: string) {
  return post(`/approvals/instances/${id}/reject`, { comment })
}

export function cancelTodo(id: string) {
  return post(`/approvals/instances/${id}/cancel`, {})
}
