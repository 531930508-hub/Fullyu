import { get, post, put, del } from './request'

export interface CourseListParams {
  page?: number
  pageSize?: number
  status?: string
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
