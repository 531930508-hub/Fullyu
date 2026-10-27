import { get, post, put, del } from './request'

/** 后台社群列表（全部状态；hostUserId 用于主理人工作台数据范围） */
export function adminListCommunities(params?: { status?: string; keyword?: string; hostUserId?: string }) {
  return get('/communities/admin/list', params)
}

/** 后台创建社群 */
export function createCommunity(body: any) {
  return post('/communities/admin/create', body)
}

/** 后台更新社群 */
export function updateCommunity(id: string, body: any) {
  return put(`/communities/${id}`, body)
}

/** 社群审核：通过上架 / 驳回 */
export function auditCommunity(id: string, approved: boolean) {
  return post(`/communities/${id}/audit`, { approved })
}

/** 上架/下架社群 */
export function setCommunityStatus(id: string, isActive: boolean) {
  return post(`/communities/${id}/status`, { isActive })
}

/** 删除社群 */
export function deleteCommunity(id: string) {
  return del(`/communities/${id}`)
}

// ---------- 主理人角色 ----------

/** 主理人列表（基础 / 扩展） */
export function adminListHosts(keyword?: string) {
  return get('/communities/admin/hosts', keyword ? { keyword } : undefined)
}

/** 平台人工设置主理人角色（null = 取消主理人身份） */
export function adminSetHostRole(userId: string, role: 'BASIC' | 'EXTENDED' | null) {
  return post(`/communities/admin/hosts/${userId}/role`, { role })
}

// ---------- 入群申请 ----------

/** 入群申请队列 */
export function adminListJoinRequests(params?: { communityId?: string; status?: string; hostUserId?: string }) {
  return get('/communities/admin/join-requests', params)
}

/** 审核入群申请 */
export function reviewJoinRequest(id: string, body: { approved: boolean; note?: string; hostUserId?: string }) {
  return post(`/communities/admin/join-requests/${id}/review`, body)
}

// ---------- 邀请 / 礼遇 ----------

export interface CommunityInviteBody {
  communityId?: string
  name?: string
  kind?: 'NORMAL' | 'WAIVER' | 'REDUCE'
  amount?: number
  expiresAt?: string | null
  quota?: number
  note?: string
  isActive?: boolean
  hostUserId?: string
}

/** 邀请/礼遇列表 */
export function adminListInvites(communityId: string, hostUserId?: string) {
  return get('/communities/admin/invites', hostUserId ? { communityId, hostUserId } : { communityId })
}

/** 创建邀请/礼遇 */
export function createInvite(body: CommunityInviteBody) {
  return post('/communities/admin/invites', body)
}

/** 更新邀请/礼遇 */
export function updateInvite(id: string, body: CommunityInviteBody) {
  return put(`/communities/admin/invites/${id}`, body)
}

/** 停用邀请/礼遇 */
export function removeInvite(id: string, hostUserId?: string) {
  return del(`/communities/admin/invites/${id}`, hostUserId ? { hostUserId } : undefined)
}

// ---------- 内容治理 ----------

/** 内容治理（隐藏/恢复/删除，必须填写原因） */
export function moderateContent(body: {
  communityId: string
  targetType: 'POST' | 'COMMENT'
  targetId: string
  action: 'HIDE' | 'RESTORE' | 'DELETE'
  reason: string
  hostUserId?: string
}) {
  return post('/communities/admin/moderation', body)
}

/** 内容治理日志 */
export function adminListModerationLogs(communityId: string, hostUserId?: string) {
  return get('/communities/admin/moderation-logs', hostUserId ? { communityId, hostUserId } : { communityId })
}

// ---------- 活动 ----------

/** 后台活动列表 */
export function adminListEvents(communityId?: string, hostUserId?: string) {
  const params: Record<string, string> = {}
  if (communityId) params.communityId = communityId
  if (hostUserId) params.hostUserId = hostUserId
  return get('/communities/admin/events', Object.keys(params).length ? params : undefined)
}

/** 创建活动 */
export function createEvent(body: any) {
  return post('/communities/admin/events', body)
}

/** 更新活动 */
export function updateEvent(id: string, body: any) {
  return put(`/communities/admin/events/${id}`, body)
}

/** 删除活动 */
export function deleteEvent(id: string) {
  return del(`/communities/admin/events/${id}`)
}

// ---------- 动态审核 ----------

/** 后台动态列表（可按状态 / 社群 / 主理人过滤） */
export function adminListPosts(status?: string, communityId?: string, hostUserId?: string) {
  const params: Record<string, string> = {}
  if (status) params.status = status
  if (communityId) params.communityId = communityId
  if (hostUserId) params.hostUserId = hostUserId
  return get('/communities/admin/posts', Object.keys(params).length ? params : undefined)
}

/** 动态审核：通过发布 / 驳回 */
export function auditPost(id: string, approved: boolean) {
  return post(`/communities/admin/posts/${id}/audit`, { approved })
}
