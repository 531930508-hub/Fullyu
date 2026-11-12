import { get, post } from './request'

/**
 * 导师门户的教务侧接口。
 *
 * 入驻审核与课程提案是两条独立单据，但共用同一套状态口径（见 shared/trainer-portal），
 * 后台每次只认后端返回的 statusText/color，前端不再自己拼中文。
 */

// ---------- 导师入驻 ----------

export function listTrainerApplications(params?: { status?: string; keyword?: string }) {
  return get<any[]>('/trainer-portal/admin/applications', params)
}

export function getTrainerApplication(id: string) {
  return get<any>(`/trainer-portal/admin/applications/${id}`)
}

/** 通过入驻：后端一次事务建导师档案 + 开通账号，返回初始账号信息 */
export function approveTrainerApplication(
  id: string,
  body: {
    level?: number
    hourlyRate?: number
    initialPassword: string
    certBadge?: string
    seedifyCert?: boolean
  },
) {
  return post<{ trainerId: string; phone: string; initialPassword: string; mustChangePassword: boolean }>(
    `/trainer-portal/admin/applications/${id}/approve`,
    body,
  )
}

export function rejectTrainerApplication(id: string, reason: string) {
  return post(`/trainer-portal/admin/applications/${id}/reject`, { reason })
}

/** 重置导师门户密码：重置后本人下次登录会被要求改密 */
export function resetTrainerPortalPassword(trainerId: string, newPassword: string) {
  return post<{ ok: boolean; mustChangePassword: boolean }>(
    `/trainer-portal/admin/trainers/${trainerId}/reset-password`,
    { newPassword },
  )
}

// ---------- 课程提案 ----------

export function listCourseProposals(params?: { status?: string; keyword?: string }) {
  return get<any[]>('/trainer-portal/admin/proposals', params)
}

export function getCourseProposal(id: string) {
  return get<any>(`/trainer-portal/admin/proposals/${id}`)
}

export function startReviewCourseProposal(id: string) {
  return post(`/trainer-portal/admin/proposals/${id}/review`)
}

export function rejectCourseProposal(id: string, reason: string, fields: string[]) {
  return post(`/trainer-portal/admin/proposals/${id}/reject`, { reason, fields })
}

/** 通过提案：选场地与排期，publish=true 直接上架，否则留下草稿给运营补齐 */
export function approveCourseProposal(
  id: string,
  body: {
    venueId: string
    date: string
    startTime: string
    endTime: string
    price: number
    maxCapacity: number
    minCapacity?: number
    publish?: boolean
    contentConfirmed?: boolean
  },
) {
  return post<{ courseId: string; status: string }>(
    `/trainer-portal/admin/proposals/${id}/approve`,
    body,
  )
}