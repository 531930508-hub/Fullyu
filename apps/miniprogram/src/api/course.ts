/** 课程相关 API */
import { get } from '@/utils/request'

export interface CourseListItem {
  id: string
  title: string
  coverImage: string
  type: string
  categories: string[]
  startDate: string
  startTime: string
  endTime: string
  originalPrice: number
  maxCapacity: number
  currentEnrolled: number
  trainer?: { displayName: string; avatar?: string; level?: number }
  venue?: { name: string; address?: string }
}

export interface CourseListResult {
  items: CourseListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CourseDetail extends CourseListItem {
  gallery?: string[]
  description?: string
  detailDesc?: string
  targetAudience?: string[]
  learningGoals?: string
  materials?: string[]
  notice?: string
  tags?: string[]
  difficulty?: string
  duration?: number
  endDate?: string
  minCapacity?: number
  waitlistEnabled?: boolean
  waitlistDeadlineHours?: number
  memberWaitlistSeats?: number
  allowDeduction?: boolean
  priceTiers?: { seatFrom: number; seatTo: number; price: number }[]
  refundRules?: { hoursFrom: number; hoursTo: number | null; refundPercent: number }[]
  seedsReward?: number
  reviewSeeds?: number
  /** 生命周期展示字段（后端按日期推导） */
  phase?: string
  phaseLabel?: string
  bookable?: boolean
  discoverable?: boolean
  startAt?: string
  endAt?: string
  enrollDeadline?: string | null
  enrollStartAt?: string | null
  enrollEndAt?: string | null
  trainer?: any
  venue?: any
}

export interface CourseListQuery {
  page?: number
  pageSize?: number
  time?: 'today' | 'week' | 'month'
  category?: string
  sortPrice?: 'asc' | 'desc'
  memberOnly?: boolean
}

/** 课程列表（公开） */
export function listCourses(query: CourseListQuery = {}) {
  // silent：后端未启动时静默降级，首页课程列表显示为空
  return get<CourseListResult>('/courses', query, { auth: false, silent: true })
}

/** 课程详情（公开） */
export function getCourseDetail(id: string) {
  return get<CourseDetail>(`/courses/${id}`, undefined, { auth: false })
}
