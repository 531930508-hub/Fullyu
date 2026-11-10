import { get, post } from './request'

/** 近2小时待开课的课程及报名名单（默认签到视图） */
export function upcomingCheckins() {
  return get('/checkin/upcoming')
}

/** 签到可检索课程（尚未结课 + 近3日内结课） */
export function checkinCourses(keyword?: string) {
  return get('/checkin/courses', keyword ? { keyword } : undefined)
}

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
