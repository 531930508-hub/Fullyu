import { get, post } from './request'

/** 某课程的候补名单（后台） */
export function listCourseWaitlist(courseId: string) {
  return get(`/waitlist-admin/course/${courseId}`)
}

/** 手动递补（不受最大人数限制，可超额开课） */
export function promoteWaitlistEntry(id: string) {
  return post(`/waitlist-admin/${id}/promote`, {})
}

/** 候补退出退款（全额退回微信 / 取消待支付） */
export function cancelWaitlistEntry(id: string, reason?: string) {
  return post(`/waitlist-admin/${id}/cancel`, { reason })
}
