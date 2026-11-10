import { CourseService } from '../src/modules/course/course.service'

function course(overrides: Record<string, any>) {
  return {
    id: overrides.id,
    status: 'PUBLISHED',
    startDate: new Date(2026, 9, 26),
    endDate: null,
    startTime: '16:00',
    endTime: '17:00',
    enrollStartAt: null,
    enrollEndAt: null,
    title: overrides.id,
    trainer: null,
    venue: null,
    ...overrides,
  }
}

function buildService(rows: any[]) {
  const prisma = {
    course: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  }
  return new CourseService(prisma as any, {} as any)
}

describe('发现流课程生命周期过滤', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 26, 18, 0, 0))
  })
  afterEach(() => jest.useRealTimers())

  it('16–17 点的课在 18 点不再出现在发现列表', async () => {
    const service = buildService([
      course({ id: 'ended' }),
      course({ id: 'ongoing', startTime: '17:30', endTime: '19:00' }),
    ])
    const result = await service.findPublished({ page: 1, pageSize: 10 })
    expect(result.items.map((item) => item.id)).toEqual(['ongoing'])
    expect(result.total).toBe(1)
    expect(result.items[0].phase).toBe('ONGOING')
  })

  it('报名截止的课程仍展示状态，草稿/已完成不进入发现流', async () => {
    const service = buildService([
      course({
        id: 'closed',
        startTime: '20:00',
        endTime: '21:00',
        enrollEndAt: new Date(2026, 9, 26, 11, 0, 0),
      }),
      course({ id: 'draft', status: 'DRAFT', startTime: '20:00', endTime: '21:00' }),
      course({ id: 'completed', status: 'COMPLETED' }),
    ])
    const result = await service.findPublished({ page: 1, pageSize: 10 })
    expect(result.items.map((item) => item.id)).toEqual(['closed'])
    expect(result.items[0].phase).toBe('ENROLL_CLOSED')
    expect(result.items[0].bookable).toBe(false)
  })

  it('过滤已结束课程后再分页，总数与实际可见课程一致', async () => {
    const service = buildService([
      course({ id: 'ended-1' }),
      course({ id: 'live-1', startTime: '17:30', endTime: '19:00' }),
      course({ id: 'ended-2' }),
      course({ id: 'live-2', startTime: '18:30', endTime: '20:00' }),
      course({ id: 'live-3', startTime: '19:00', endTime: '20:30' }),
    ])
    const first = await service.findPublished({ page: 1, pageSize: 2 })
    const second = await service.findPublished({ page: 2, pageSize: 2 })
    expect(first.total).toBe(3)
    expect(first.totalPages).toBe(2)
    expect(first.items.map((item) => item.id)).toEqual(['live-1', 'live-2'])
    expect(second.items.map((item) => item.id)).toEqual(['live-3'])
  })
})
