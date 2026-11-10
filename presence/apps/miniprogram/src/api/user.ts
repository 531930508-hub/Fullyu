/** 用户相关 API */
import { get, put } from '@/utils/request'

export interface UserProfile {
  id: string
  phone: string
  nickname: string
  avatar?: string
  language?: string
  isTrainer: boolean
  points?: number
  /** 是否已有可用于签到核验的个人照片；接口不返回照片本身 */
  hasVerificationPhoto?: boolean
}

export interface PointsHistoryItem {
  id: string
  amount: number
  balance: number
  type: string
  reason: string
  createdAt: string
}

export interface PointsHistoryResult {
  items: PointsHistoryItem[]
  total: number
}

/** 个人信息 */
export function getProfile() {
  return get<UserProfile>('/user/profile')
}

/** 更新个人信息 */
export function updateProfile(body: { nickname?: string; avatar?: string; language?: string }) {
  return put<UserProfile>('/user/profile', body)
}

/** 积分余额 */
export function getPoints() {
  return get<{ balance: number }>('/user/points')
}

/** 积分明细 */
export function getPointsHistory() {
  return get<PointsHistoryResult>('/user/points/history')
}
