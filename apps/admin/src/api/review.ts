import { get, del } from './request'

/** 评价列表（后台） */
export function listReviews(courseId?: string) {
  return get('/reviews', { courseId })
}

/** 课程评价列表 */
export function courseReviews(courseId: string) {
  return get(`/reviews/course/${courseId}`)
}

/** 删除评价 */
export function removeReview(id: string) {
  return del(`/reviews/${id}`)
}
