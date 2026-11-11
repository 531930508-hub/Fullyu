/**
 * 课程生命周期（前后端共用口径）。
 *
 * 数据库仍只有 DRAFT / PUBLISHED / CANCELLED / COMPLETED / EXPIRED 五个存量状态；
 * 面向用户与运营的「报名中 / 报名截止 / 进行中 / 已结束」等展示状态由日期时间推导，
 * 避免新增枚举导致历史数据与后台筛选失配。
 *
 * 口径：
 * - 课程开始 = startDate + startTime
 * - 课程结束 = endDate（缺省 startDate）+ endTime（缺省 startTime）
 * - 报名截止 = enrollEndAt；未配置时按开始时刻截止
 * - enrollEndAt 晚于开始时刻 = 显式「补报名」，属于后台特批场景
 * - PUBLISHED 且已过结束时刻 = ENDED：小程序发现列表不展示，详情只读，订单历史保留
 */

export type CourseDisplayPhase =
  | 'DRAFT'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'ENROLL_UPCOMING'
  | 'ENROLLING'
  | 'ENROLL_CLOSED'
  | 'LATE_ENROLLING'
  | 'ONGOING'
  | 'ENDED'

export interface CourseLifecycleInput {
  status: string
  startDate: string | Date
  endDate?: string | Date | null
  startTime?: string | null
  endTime?: string | null
  enrollStartAt?: string | Date | null
  enrollEndAt?: string | Date | null
}

export interface CourseLifecycle {
  phase: CourseDisplayPhase
  startAt: Date
  endAt: Date
  enrollDeadline: Date
  bookable: boolean
  discoverable: boolean
}

const PHASE_LABELS: Record<CourseDisplayPhase, { zh: string; en: string }> = {
  DRAFT: { zh: '草稿', en: 'Draft' },
  CANCELLED: { zh: '已下架', en: 'Cancelled' },
  COMPLETED: { zh: '已结束', en: 'Completed' },
  EXPIRED: { zh: '已过期', en: 'Expired' },
  ENROLL_UPCOMING: { zh: '报名未开始', en: 'Enrollment soon' },
  ENROLLING: { zh: '报名中', en: 'Enrolling' },
  ENROLL_CLOSED: { zh: '报名截止', en: 'Enrollment closed' },
  LATE_ENROLLING: { zh: '补报名中', en: 'Late enrollment' },
  ONGOING: { zh: '进行中', en: 'In progress' },
  ENDED: { zh: '已结束', en: 'Ended' },
}

/** 展示状态中文/英文文案 */
export function coursePhaseLabel(phase: CourseDisplayPhase, language: string = 'zh'): string {
  const item = PHASE_LABELS[phase] || PHASE_LABELS.ENROLLING
  return language === 'en' ? item.en : item.zh
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function parseClock(value: string | null | undefined): { h: number; m: number } | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value).trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null
  return { h, m }
}

/** 日期 + HH:mm，缺省时间时按当日 00:00 */
export function combineCourseDateTime(
  dateValue: string | Date | null | undefined,
  timeValue?: string | null,
  fallback?: Date,
): Date {
  const date = parseDate(dateValue)
  if (!date) return fallback ? new Date(fallback.getTime()) : new Date(NaN)
  const clock = parseClock(timeValue)
  date.setHours(clock?.h ?? 0, clock?.m ?? 0, 0, 0)
  return date
}

/** 课程开始时刻 */
export function courseStartAt(course: CourseLifecycleInput): Date {
  return combineCourseDateTime(course.startDate, course.startTime)
}

/** 课程结束时刻；结束日期缺省时沿用开始日期 */
export function courseEndAt(course: CourseLifecycleInput): Date {
  const start = courseStartAt(course)
  const endDate = parseDate(course.endDate) || parseDate(course.startDate)
  const end = combineCourseDateTime(endDate, course.endTime, start)
  // 仅有日期没有时间时，默认持续到当天结束，避免 00:00 就被判定结束
  if (!parseClock(course.endTime)) {
    end.setHours(23, 59, 59, 999)
  }
  return end
}

/** 报名截止时刻：显式 enrollEndAt 优先，否则到课程开始为止 */
export function courseEnrollDeadline(course: CourseLifecycleInput): Date {
  return parseDate(course.enrollEndAt) || courseStartAt(course)
}

/**
 * 推导课程面向用户的展示状态与可报名/可发现性。
 * 传入 now 便于前后端在同一时刻得到一致结论，也便于单元测试。
 */
export function resolveCourseLifecycle(
  course: CourseLifecycleInput,
  now: Date = new Date(),
): CourseLifecycle {
  const startAt = courseStartAt(course)
  const endAt = courseEndAt(course)
  const enrollDeadline = courseEnrollDeadline(course)
  const status = String(course.status || '').toUpperCase()

  const base = (phase: CourseDisplayPhase): CourseLifecycle => ({
    phase,
    startAt,
    endAt,
    enrollDeadline,
    bookable: phase === 'ENROLLING' || phase === 'LATE_ENROLLING',
    discoverable: (
      phase === 'ENROLL_UPCOMING' ||
      phase === 'ENROLLING' ||
      phase === 'ENROLL_CLOSED' ||
      phase === 'LATE_ENROLLING' ||
      phase === 'ONGOING'
    ),
  })

  if (status === 'DRAFT') return base('DRAFT')
  if (status === 'CANCELLED') return base('CANCELLED')
  if (status === 'COMPLETED') return base('COMPLETED')
  if (status === 'EXPIRED') return base('EXPIRED')

  // PUBLISHED 及未知旧值：按时间推导，避免旧数据整条不可见
  if (now.getTime() >= endAt.getTime()) {
    return base('ENDED')
  }
  if (now.getTime() >= startAt.getTime()) {
    // 已开课仍处于显式补报名窗口内
    if (parseDate(course.enrollEndAt) && now.getTime() < enrollDeadline.getTime()) {
      return base('LATE_ENROLLING')
    }
    return base('ONGOING')
  }
  if (now.getTime() < enrollDeadline.getTime()) {
    const enrollStart = parseDate(course.enrollStartAt)
    if (enrollStart && now.getTime() < enrollStart.getTime()) {
      return base('ENROLL_UPCOMING')
    }
    return base('ENROLLING')
  }
  return base('ENROLL_CLOSED')
}

/** 给课程 DTO 附加生命周期字段（不改变原始字段） */
export function decorateCourseLifecycle<T extends CourseLifecycleInput>(
  course: T,
  now: Date = new Date(),
  language: string = 'zh',
) {
  const lifecycle = resolveCourseLifecycle(course, now)
  return {
    ...course,
    phase: lifecycle.phase,
    phaseLabel: coursePhaseLabel(lifecycle.phase, language),
    bookable: lifecycle.bookable,
    discoverable: lifecycle.discoverable,
    startAt: lifecycle.startAt,
    endAt: lifecycle.endAt,
    enrollDeadline: lifecycle.enrollDeadline,
  }
}

/** 小程序发现列表是否展示：已结束/下架/未发布的课程不进入发现流 */
export function isCourseDiscoverable(course: CourseLifecycleInput, now: Date = new Date()): boolean {
  const phase = resolveCourseLifecycle(course, now).phase
  return (
    phase === 'ENROLL_UPCOMING' ||
    phase === 'ENROLLING' ||
    phase === 'ENROLL_CLOSED' ||
    phase === 'LATE_ENROLLING' ||
    phase === 'ONGOING'
  )
}

/** 当前是否允许报名（含后台开口的补报名） */
export function isCourseBookable(course: CourseLifecycleInput, now: Date = new Date()): boolean {
  return resolveCourseLifecycle(course, now).bookable
}
