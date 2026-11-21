/** 往期课程许愿 API */
import { get, post, del } from '@/utils/request'

export interface CourseWishSummary {
  count: number
  wished: boolean
  wishedAt?: string | null
}

export interface MyCourseWish {
  id: string
  createdAt: string
  notifiedAt?: string | null
  course: {
    id: string
    title: string
    coverImage?: string
    categories?: string[]
    startDate?: string
    startTime?: string
    endTime?: string
    startAt?: string
    phase?: string
    bookable?: boolean
    trainer?: { displayName?: string; avatar?: string } | null
    venue?: { name?: string; address?: string } | null
  }
}

export interface MyCourseWishResult {
  items: MyCourseWish[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 许愿概况（未登录只返回数量） */
export function getCourseWishSummary(courseId: string) {
  return get<CourseWishSummary>('/course-wishes/summary', { courseId }, { auth: false, silent: true })
}

/** 许愿：想再上一节该往期课程（幂等） */
export function addCourseWish(courseId: string) {
  return post<CourseWishSummary>('/course-wishes', { courseId })
}

/** 取消许愿（幂等） */
export function removeCourseWish(courseId: string) {
  return del<CourseWishSummary>(`/course-wishes/${courseId}`)
}

/** 我的心愿列表 */
export function listMyCourseWishes(page = 1, pageSize = 20) {
  return get<MyCourseWishResult>('/course-wishes/mine', { page, pageSize })
}