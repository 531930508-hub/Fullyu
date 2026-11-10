export interface CourseFilters {
  category?: string
  date?: string
  venueId?: string
  venueIds?: string[]
  difficulty?: string
  onlyAvailable?: boolean
}

/** 只筛真实字段，不以 SINGLE / SERIES 区分课程。 */
export function filterCourseList<T extends {
  categories?: string[]; startDate?: string; venueId?: string; difficulty?: string
  maxCapacity?: number; currentEnrolled?: number
}>(courses: T[], filters: CourseFilters): T[] {
  return courses.filter(course =>
    (!filters.category || course.categories?.includes(filters.category)) &&
    (!filters.date || course.startDate?.slice(0, 10) === filters.date) &&
    (!filters.venueId || course.venueId === filters.venueId) &&
    (!filters.venueIds || filters.venueIds.includes(course.venueId || '')) &&
    (!filters.difficulty || course.difficulty === filters.difficulty) &&
    (!filters.onlyAvailable || Number(course.maxCapacity) > Number(course.currentEnrolled)),
  )
}

const CITY_EN: Record<string, string> = {
  上海: 'Shanghai',
  北京: 'Beijing',
  广州: 'Guangzhou',
  深圳: 'Shenzhen',
  杭州: 'Hangzhou',
  成都: 'Chengdu',
  南京: 'Nanjing',
  苏州: 'Suzhou',
}

/** 城市展示名：中文保留原名，英文使用常用译名，未知城市回退原名。 */
export function cityLabel(city: string, language: 'zh' | 'en' = 'zh'): string {
  return language === 'en' ? CITY_EN[city] || city : city
}

export interface CityVenueLike {
  id: string
  city?: string
}

/** 城市字段兜底为上海，避免历史数据或空值让场地从城市列表消失。 */
export function normalizeCity(value: unknown): string {
  return String(value ?? '').trim() || '上海'
}

/** 城市选项来自真实场地，保持接口返回顺序；无场地时保留当前城市。 */
export function cityOptionsFromVenues(venues: CityVenueLike[], fallback = '上海'): string[] {
  const cities = Array.from(new Set(venues.map(venue => normalizeCity(venue.city))))
  return cities.length ? cities : [normalizeCity(fallback)]
}

/** 当前城市对应的场地 ID；课程先按城市场地收敛，再应用场地筛选。 */
export function venueIdsForCity(venues: CityVenueLike[], city: string): string[] {
  const target = normalizeCity(city)
  return venues.filter(venue => normalizeCity(venue.city) === target).map(venue => venue.id)
}

export function paymentSeconds(expireAt: string, now: number): number {
  const expires = Date.parse(expireAt)
  return Number.isFinite(expires) ? Math.max(0, Math.floor((expires - now) / 1000)) : 0
}

export function attendanceLabel(order: { checkedIn?: boolean | null }, language: 'zh' | 'en' = 'zh'): string {
  if (order.checkedIn === true) return language === 'en' ? 'Checked in' : '已签到'
  if (order.checkedIn === false) return language === 'en' ? 'Not checked in' : '未签到'
  return language === 'en' ? 'Check-in syncing' : '签到记录待同步'
}

export function canReviewOrder(order: { status?: string; checkedIn?: boolean | null; reviewed?: boolean }): boolean {
  return order.status === 'COMPLETED' && order.checkedIn === true && !order.reviewed
}
