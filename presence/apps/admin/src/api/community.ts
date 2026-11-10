import { get, post, put, del } from './request'

/** 后台社群列表（全部状态） */
export function adminListCommunities(params?: { status?: string; keyword?: string }) {
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

// ---------- 活动 ----------

/** 后台活动列表 */
export function adminListEvents(communityId?: string) {
  return get('/communities/admin/events', communityId ? { communityId } : undefined)
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

/** 后台动态列表（可按状态过滤） */
export function adminListPosts(status?: string) {
  return get('/communities/admin/posts', status ? { status } : undefined)
}

/** 动态审核：通过发布 / 驳回 */
export function auditPost(id: string, approved: boolean) {
  return post(`/communities/admin/posts/${id}/audit`, { approved })
}
