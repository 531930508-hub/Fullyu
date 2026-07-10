/** 导师相关 API */
import { get } from '@/utils/request'

export interface TrainerItem {
  id: string
  displayName: string
  avatar?: string
  level?: number
  title?: string
  bio?: string
  specialties?: string[]
}

/** 导师列表（公开） */
export function listTrainers(query: { keyword?: string; level?: number } = {}) {
  return get<TrainerItem[]>('/trainers', query, { auth: false })
}

/** 导师详情（公开） */
export function getTrainer(id: string) {
  return get<TrainerItem>(`/trainers/${id}`, undefined, { auth: false })
}
