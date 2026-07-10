import { get, post } from './request'

/** 课程签到名单 */
export function courseRoster(courseId: string) {
  return get(`/checkin/course/${courseId}`)
}

/** 手工签到 */
export function manualCheckIn(courseId: string, userId: string) {
  return post('/checkin', { courseId, userId })
}

/** 取消签到 */
export function cancelCheckIn(courseId: string, userId: string) {
  return post('/checkin/cancel', { courseId, userId })
}
