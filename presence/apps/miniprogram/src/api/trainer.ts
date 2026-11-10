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

export interface TrainerUpcomingCourse {
  id: string
  name: string
  date: string
  time: string
  venue: string
  seats: number
}

export interface TrainerDetail extends TrainerItem {
  certBadge?: string
  stats?: { totalStudents: number; totalCourses: number }
  upcomingCourses?: TrainerUpcomingCourse[]
}

/** 导师列表（公开） */
export function listTrainers(query: { keyword?: string; level?: number } = {}) {
  return get<TrainerItem[]>('/trainers', query, { auth: false })
}

/** 导师详情（公开） */
export function getTrainer(id: string) {
  return get<TrainerDetail>(`/trainers/${id}`, undefined, { auth: false })
}

export interface TrainerWorkspace {
  hourlyRate: number
  stats: { monthHours: number; monthIncome: number; rating: number }
  todaySchedule: Array<{
    id: string
    name: string
    startTime: string
    endTime: string
    venue: string
    enrolled: number
    maxCapacity: number
    current: boolean
    past: boolean
  }>
  upcomingCourses: Array<{
    id: string
    day: string
    weekday: string
    name: string
    time: string
    venue: string
    enrolled: number
    max: number
  }>
  incomeRecords: Array<{
    id: string
    course: string
    date: string
    students: number
    hours: number
    amount: number
  }>
  checkin: { weekAttendanceRate: number; weekAbsent: number; weekStudents: number }
}

/** 导师工作台（需导师登录） */
export function getTrainerWorkspace() {
  return get<TrainerWorkspace>('/trainers/me/workspace')
}
