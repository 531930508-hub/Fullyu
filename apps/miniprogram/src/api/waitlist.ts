/** 候补相关 API */
import { get, post } from '@/utils/request'

export interface WaitlistQuote {
  courseId: string
  seatType: 'MEMBER' | 'NORMAL'
  position: number
  lockedPrice: number
  memberWaitlistSeats?: number
  deadlineHours?: number
}

export interface WaitlistJoinResult {
  orderId: string
  actualPaid: number
  position: number
  seatType: string
  expireInSeconds?: number
}

export interface WaitlistEntry {
  id: string
  courseId: string
  seatType: string
  position: number
  lockedPrice: number
  status: string
  createdAt: string
  course?: any
}

/** 候补询价 */
export function quoteWaitlist(courseId: string) {
  return get<WaitlistQuote>(`/waitlist/quote/${courseId}`)
}

/** 加入候补 */
export function joinWaitlist(courseId: string) {
  return post<WaitlistJoinResult>(`/waitlist/join/${courseId}`)
}

/** 我的候补列表 */
export function listMyWaitlist() {
  return get<WaitlistEntry[]>('/waitlist/mine')
}
