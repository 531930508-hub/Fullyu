/** 评价相关 API */
import { get, post } from '@/utils/request'

export interface MyReview {
  id: string
  courseId: string
  rating: number
  content?: string | null
  createdAt: string
  course?: { id: string; title: string; coverImage?: string }
}

export interface TrainerReviewsResult {
  count: number
  avgRating: number
  reviews: Array<{
    id: string
    rating: number
    content?: string | null
    createdAt: string
    user?: { nickname?: string; avatar?: string }
    course?: { title?: string }
  }>
}

/** 提交课程评价（需已报名该课程） */
export function submitReview(body: { courseId: string; rating: number; content?: string }) {
  return post('/reviews', body)
}

/** 我的评价列表 */
export function listMyReviews() {
  return get<MyReview[]>('/reviews/mine')
}

/** 导师评价与评分（公开） */
export function getTrainerReviews(trainerId: string) {
  return get<TrainerReviewsResult>(`/reviews/trainer/${trainerId}`, undefined, { auth: false })
}
