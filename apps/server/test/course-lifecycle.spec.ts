import {
  courseEndAt,
  coursePhaseLabel,
  resolveCourseLifecycle,
} from '@fullyu/shared'

/**
 * 课程生命周期纯函数测试：
 * 列表是否可见、能否报名、后台补报名都以同一套时间口径推导，
 * 避免“课程结束后小程序仍展示、仍可下单”或“提前把未开始课程判为已结束”。
 */
describe('课程生命周期推导', () => {
  const published = {
    status: 'PUBLISHED',
    startDate: new Date(2026, 9, 26),
    endDate: new Date(2026, 9, 26),
    startTime: '16:00',
    endTime: '17:00',
    enrollStartAt: null,
    enrollEndAt: null,
  }
  const at = (hour: number, minute = 0) => new Date(2026, 9, 26, hour, minute, 0, 0)

  it('开课前处于报名中：可发现、可报名', () => {
    const phase = resolveCourseLifecycle(published, at(15))
    expect(phase.phase).toBe('ENROLLING')
    expect(phase.bookable).toBe(true)
    expect(phase.discoverable).toBe(true)
  })

  it('超过默认报名截止（开课时刻）但尚未开课：报名截止', () => {
    const phase = resolveCourseLifecycle(
      { ...published, startTime: '19:00', endTime: '20:00', enrollEndAt: at(17) },
      at(18),
    )
    expect(phase.phase).toBe('ENROLL_CLOSED')
    expect(phase.bookable).toBe(false)
    expect(phase.discoverable).toBe(true)
  })

  it('课程进行中：仍可发现，但默认不能再报名', () => {
    const phase = resolveCourseLifecycle(published, at(16, 30))
    expect(phase.phase).toBe('ONGOING')
    expect(phase.bookable).toBe(false)
    expect(phase.discoverable).toBe(true)
  })

  it('课程结束后：不再进入发现列表，也不能报名', () => {
    const phase = resolveCourseLifecycle(published, at(17, 1))
    expect(phase.phase).toBe('ENDED')
    expect(phase.bookable).toBe(false)
    expect(phase.discoverable).toBe(false)
  })

  it('开课后把截止时间延到未来：补报名中，可报名', () => {
    const phase = resolveCourseLifecycle(
      { ...published, enrollEndAt: at(17, 30) },
      at(16, 30),
    )
    expect(phase.phase).toBe('LATE_ENROLLING')
    expect(phase.bookable).toBe(true)
    expect(phase.discoverable).toBe(true)
  })

  it('报名开始时间未到：报名未开始', () => {
    const phase = resolveCourseLifecycle(published, at(12))
    const upcoming = resolveCourseLifecycle(
      { ...published, enrollStartAt: at(14) },
      at(12),
    )
    expect(phase.phase).toBe('ENROLLING')
    expect(upcoming.phase).toBe('ENROLL_UPCOMING')
    expect(upcoming.bookable).toBe(false)
  })

  it('草稿/下架不进入发现列表', () => {
    for (const status of ['DRAFT', 'CANCELLED', 'COMPLETED', 'EXPIRED']) {
      const phase = resolveCourseLifecycle({ ...published, status }, at(15))
      expect(phase.phase).toBe(status)
      expect(phase.discoverable).toBe(false)
      expect(phase.bookable).toBe(false)
    }
  })

  it('只有日期没有结束时间时按当天结束，不误判为已结束', () => {
    const dateOnly = {
      ...published,
      startTime: '',
      endTime: '',
    }
    expect(courseEndAt(dateOnly).getHours()).toBe(23)
    const phase = resolveCourseLifecycle(dateOnly, at(20))
    expect(phase.phase).toBe('ONGOING')
    expect(phase.discoverable).toBe(true)
  })

  it('展示文案随语言切换，未知阶段回落英文/中文兜底', () => {
    expect(coursePhaseLabel('LATE_ENROLLING', 'zh')).toBe('补报名中')
    expect(coursePhaseLabel('LATE_ENROLLING', 'en')).toBe('Late enrollment')
    expect(coursePhaseLabel('ENDED', 'en')).toBe('Ended')
  })
})
