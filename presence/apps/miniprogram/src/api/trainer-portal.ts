/**
 * 导师门户 API
 *
 * 对应后端 modules/trainer-portal：所有「我的」接口都不传 trainerId，
 * 由后端从导师令牌解析，前端拿不到也不允许指定他人 id。
 */
import { trainerGet, trainerPost, trainerPut } from '@/utils/trainer-request'

export interface TrainerMe {
  id: string
  displayName: string
  avatar?: string | null
  level: number
  headline?: string | null
  city?: string | null
  bio?: string | null
  specialties: string[]
  portfolio: Array<{ title: string; image: string; desc?: string }>
  certBadge?: string | null
  seedifyCert?: string | null
  hourlyRate?: number | null
  status: string
  phone: string
  mustChangePassword: boolean
  stats: {
    monthCourses: number
    upcomingCourses: number
    pendingProposals: number
    publishedProposals: number
    totalStudents: number
    rating: number
    reviewCount: number
  }
}

export interface PortalLoginResult {
  token: string
  mustChangePassword: boolean
  trainer: { id: string; displayName: string }
}

export interface PortalCourse {
  id: string
  title: string
  coverImage?: string | null
  status: string
  /** 后端 resolveCourseLifecycle 的英文枚举，前端映射中文 */
  phase: string
  startAt: string
  endAt: string
  startTime: string
  endTime: string
  enrolled: number
  minCapacity: number
  maxCapacity: number
  price: number | null
  venue?: { id: string; name: string; city?: string; address?: string } | null
  /** 开课前 3 小时才解锁名单，后端与前端双重控制 */
  rosterUnlocked: boolean
}

export interface RosterStudent {
  orderId: string
  orderNo: string
  seat: number
  userId: string
  name: string
  phone: string
  avatar?: string | null
  checkInStatus: 'CHECKED' | null
  orderedAt: string
}

export interface CourseRoster {
  course: {
    id: string
    title: string
    phase: string
    startAt: string
    venue?: { name: string; address?: string } | null
  }
  students: RosterStudent[]
}

export interface ProposalListItem {
  id: string
  title: string
  status: string
  statusText: string
  coverImage?: string | null
  durationMinutes: number
  totalSessions: number
  requestedPrice: number | null
  requestedMaxCapacity: number | null
  rejectReason?: string | null
  reviewerName?: string | null
  reviewedAt?: string | null
  publishedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProposalDetail extends ProposalListItem {
  theme?: string | null
  categories: string[]
  targetAudience: string[]
  description?: string | null
  goals?: string | null
  requirements?: string | null
  supportNeeds: string[]
  materials: string[]
  scheduledDate?: string | null
  scheduledStartTime?: string | null
  scheduledEndTime?: string | null
  finalPrice?: number | null
  finalMaxCapacity?: number | null
  reviewedAt?: string | null
  publishedAt?: string | null
  rejectReason?: string | null
  rejectFieldLabels: string[]
  publishedCourseId?: string | null
}

/** 提案表单：5 步合并提交，缺项由后端按 submit 决定是否校验 */
export interface ProposalInput {
  id?: string
  title?: string
  theme?: string
  coverImage?: string
  categories?: string[]
  targetAudience?: string[]
  durationMinutes?: number
  totalSessions?: number
  description?: string
  goals?: string
  requirements?: string
  supportNeeds?: string[]
  materials?: string[]
  requestedPrice?: number
  requestedMaxCapacity?: number
  submit?: boolean
}

export interface PortalOptions {
  venues: Array<{ id: string; name: string; city?: string }>
  policy: {
    enabled: boolean
    minLength: number
    requireLetter: boolean
    requireNumber: boolean
    requireSymbol: boolean
    /** 中文强度说明，门户直接展示，避免前端再拼一套文案 */
    hint: string
  }
}

export const portalLogin = (phone: string, password: string) =>
  trainerPost<PortalLoginResult>('/trainer-portal/login', { phone, password }, { auth: false })

export const portalApply = (form: Record<string, any>) =>
  trainerPost<{ applicationId: string; status: string; statusText: string; submittedAt: string }>(
    '/trainer-portal/apply',
    form,
    { auth: false },
  )

export const getOptions = () => trainerGet<PortalOptions>('/trainer-portal/options', undefined, { auth: false })

export const getMe = () => trainerGet<TrainerMe>('/trainer-portal/me')

export const updateMe = (body: Partial<Pick<TrainerMe, 'headline' | 'city' | 'bio' | 'avatar' | 'specialties' | 'portfolio'>>) =>
  trainerPut<{ ok: boolean }>('/trainer-portal/me', body)

export const changePassword = (oldPassword: string, newPassword: string) =>
  trainerPost<{ ok: boolean }>('/trainer-portal/password', { oldPassword, newPassword })

export const getCourses = (phase?: 'upcoming' | 'finished') =>
  trainerGet<PortalCourse[]>('/trainer-portal/courses', phase ? { phase } : undefined)

export const getCourseRoster = (courseId: string, silent = false) =>
  trainerGet<CourseRoster>(`/trainer-portal/courses/${courseId}/roster`, undefined, { silent })

export const getProposals = () => trainerGet<ProposalListItem[]>('/trainer-portal/proposals')

export const getProposal = (id: string) => trainerGet<ProposalDetail>(`/trainer-portal/proposals/${id}`)

export const saveProposal = (input: ProposalInput) =>
  trainerPost<{ id: string; status: string; statusText: string }>('/trainer-portal/proposals', input)

export const submitProposal = (id: string) =>
  trainerPost<{ id: string; status: string }>(`/trainer-portal/proposals/${id}/submit`)