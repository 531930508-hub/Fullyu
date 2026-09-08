import { get, post, put, del } from './request'
import type {
  ApprovalBizType,
  ApprovalFlowScope,
  ApprovalInstanceStatus,
  ApprovalNodeMode,
  ApprovalNodeStatus,
} from '@fullyu/shared'

export interface FlowNode {
  id?: string
  name: string
  mode: ApprovalNodeMode
  /** 审批人登录名（手机号） */
  approvers: string[]
}

export interface FlowRule {
  id: string
  bizType: ApprovalBizType
  name: string
  scope: ApprovalFlowScope
  minAmount: number | null
  maxAmount: number | null
  enabled: boolean
  remark: string
  sortOrder: number
  nodes: FlowNode[]
}

export interface ApprovalDecision {
  approverName: string
  approver: string
  action: 'APPROVE' | 'REJECT'
  comment: string
  createdAt: string
}

export interface ApprovalInstanceNode {
  id: string
  name: string
  mode: ApprovalNodeMode
  approvers: string[]
  status: ApprovalNodeStatus
  decisions: ApprovalDecision[]
}

export interface ApprovalInstance {
  id: string
  bizType: ApprovalBizType
  bizId: string
  summary: string
  amount: number
  orgId: string | null
  requester: string
  requesterName: string
  flowId: string
  flowName: string
  currentIndex: number
  status: ApprovalInstanceStatus
  resultNote: string
  createdAt: string
  finishedAt: string | null
  nodes: ApprovalInstanceNode[]
}

// ===== 流程规则配置 =====

export function listFlowRules(params?: { bizType?: ApprovalBizType; enabled?: boolean }) {
  return get<FlowRule[]>('/approvals/rules', params)
}

export function createFlowRule(body: Partial<FlowRule>) {
  return post<FlowRule>('/approvals/rules', body)
}

export function updateFlowRule(id: string, body: Partial<FlowRule>) {
  return put<FlowRule>(`/approvals/rules/${id}`, body)
}

export function toggleFlowRule(id: string, enabled: boolean) {
  return put<FlowRule>(`/approvals/rules/${id}/toggle`, { enabled })
}

export function removeFlowRule(id: string) {
  return del(`/approvals/rules/${id}`)
}

/** 命中预览：返回 null 表示该组合免审直通 */
export function previewFlowRule(body: {
  bizType: ApprovalBizType
  amount: number
  scope: 'HQ' | 'STORE'
}) {
  return post<FlowRule | null>('/approvals/rules/preview', body)
}

// ===== 待办与实例 =====

export function listMyTodo() {
  return get<ApprovalInstance[]>('/approvals/todo')
}

export function getTodoCount() {
  return get<{ count: number }>('/approvals/todo/count')
}

export function listInstances(params?: {
  status?: ApprovalInstanceStatus
  bizType?: ApprovalBizType
  keyword?: string
}) {
  return get<ApprovalInstance[]>('/approvals/instances', params)
}

export function getInstance(id: string) {
  return get<ApprovalInstance>(`/approvals/instances/${id}`)
}

export function approveInstance(id: string, comment?: string) {
  return post<ApprovalInstance>(`/approvals/instances/${id}/approve`, { comment })
}

export function rejectInstance(id: string, comment?: string) {
  return post<ApprovalInstance>(`/approvals/instances/${id}/reject`, { comment })
}

export function cancelInstance(id: string) {
  return post<ApprovalInstance>(`/approvals/instances/${id}/cancel`, {})
}
