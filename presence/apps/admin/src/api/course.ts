import { get, post, put, del } from './request'

export interface CourseListParams {
  page?: number
  pageSize?: number
  status?: string
  phase?: string
  keyword?: string
  startDateFrom?: string
  startDateTo?: string
}

/** 后台课程列表（全部状态） */
export function adminListCourses(params: CourseListParams) {
  return get('/courses/admin/list', params)
}

/** 课程详情 */
export function getCourse(id: string) {
  return get(`/courses/${id}`)
}

/** 创建课程 */
export function createCourse(body: any) {
  return post('/courses', body)
}

/** 更新课程 */
export function updateCourse(id: string, body: any) {
  return put(`/courses/${id}`, body)
}

/** 发布/下架/取消课程 */
export function setCourseStatus(id: string, status: string) {
  return post(`/courses/${id}/status`, { status })
}

/** 调整报名窗口：传未来时间开放补报名，传 null 恢复默认截止 */
export function setEnrollmentWindow(id: string, enrollEndAt: string | null) {
  return put(`/courses/${id}/enrollment-window`, { enrollEndAt })
}

/** 删除课程（仅草稿且无报名/候补） */
export function deleteCourse(id: string) {
  return del(`/courses/${id}`)
}

/** 保存课程阶梯价 */
export function savePriceTiers(id: string, tiers: any[]) {
  return put(`/courses/${id}/price-tiers`, { tiers })
}

/** 保存课程会员折扣 */
export function saveMemberDiscounts(id: string, discounts: any[]) {
  return put(`/courses/${id}/member-discounts`, { discounts })
}
