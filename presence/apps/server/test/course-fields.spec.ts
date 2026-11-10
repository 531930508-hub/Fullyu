import { CourseService } from '../src/modules/course/course.service'
import { buildTestContext, Seeder, TestContext } from './helpers'

/**
 * 课程后台补充字段持久化 round-trip：
 * 验证 create/update 的白名单能把表单补充字段（detailDesc/duration/materials/syllabus 等）
 * 完整写库并可回读，避免“存草稿后重进为空值”。同时覆盖 scheduleType 的映射（SINGLE→ONE_TIME、APPOINTMENT）。
 */
describe('课程后台补充字段持久化 round-trip', () => {
  let ctx: TestContext
  let seeder: Seeder
  let service: CourseService
  const createdCourseIds: string[] = []

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    service = new CourseService(ctx.prisma)
  })

  afterAll(async () => {
    // 先清理本用例通过 service 直接创建的课程（seeder.cleanup 不追踪它们）
    await ctx.prisma.venueReservation.deleteMany({ where: { courseId: { in: createdCourseIds } } })
    await ctx.prisma.courseMemberDiscount.deleteMany({ where: { courseId: { in: createdCourseIds } } })
    await ctx.prisma.coursePriceTier.deleteMany({ where: { courseId: { in: createdCourseIds } } })
    await ctx.prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } })
    await seeder.cleanup()
    await ctx.app.close()
  })

  it('A. 创建草稿：14 个补充字段应完整持久化并可回读', async () => {
    const trainer = await seeder.trainer()
    const venue = await seeder.venue()
    const gd = new Date(Date.now() + 24 * 3600 * 1000)
    const created: any = await service.create({
      title: 'RT测试课程',
      trainerId: trainer.id,
      venueId: venue.id,
      type: 'SINGLE',
      scheduleType: 'SINGLE',
      status: 'DRAFT',
      detailDesc: '课程详细介绍',
      learningGoals: '课程目标文本',
      difficulty: 'BEGINNER',
      coverType: 'gradient',
      coverColor: 'linear-gradient(135deg, #6B463C, #8B6354)',
      duration: 90,
      totalSessions: 12,
      materials: ['瑜伽垫', '毛巾'],
      groupDeadline: gd.toISOString(),
      voucherPolicy: 'ALL',
      seedsReward: 10,
      reviewSeeds: 5,
      syllabus: [{ title: '第一节', content: '基础体式' }],
      notice: '学员须知文本',
    })
    createdCourseIds.push(created.id)

    const back: any = await service.findById(created.id)
    expect(back.detailDesc).toBe('课程详细介绍')
    expect(back.learningGoals).toBe('课程目标文本')
    expect(back.difficulty).toBe('BEGINNER')
    expect(back.coverType).toBe('gradient')
    expect(back.coverColor).toContain('linear-gradient')
    expect(back.duration).toBe(90)
    expect(back.totalSessions).toBe(12)
    expect(back.materials).toEqual(['瑜伽垫', '毛巾'])
    expect(back.voucherPolicy).toBe('ALL')
    expect(back.seedsReward).toBe(10)
    expect(back.reviewSeeds).toBe(5)
    expect(back.syllabus).toEqual([{ title: '第一节', content: '基础体式' }])
    expect(back.notice).toBe('学员须知文本')
    expect(back.groupDeadline).toBeInstanceOf(Date)
    // 前端 SINGLE 排期 → 数据库 ONE_TIME
    expect(back.scheduleType).toBe('ONE_TIME')
  })

  it('B. scheduleType=APPOINTMENT 应可保存并回读', async () => {
    const trainer = await seeder.trainer()
    const venue = await seeder.venue()
    const created: any = await service.create({
      title: 'RT预约课',
      trainerId: trainer.id,
      venueId: venue.id,
      scheduleType: 'APPOINTMENT',
      status: 'DRAFT',
    })
    createdCourseIds.push(created.id)
    const back: any = await service.findById(created.id)
    expect(back.scheduleType).toBe('APPOINTMENT')
  })

  it('C. 更新：补充字段变更应持久化', async () => {
    const trainer = await seeder.trainer()
    const venue = await seeder.venue()
    const created: any = await service.create({
      title: 'RT待更新',
      trainerId: trainer.id,
      venueId: venue.id,
      status: 'DRAFT',
      duration: 60,
    })
    createdCourseIds.push(created.id)
    await service.update(created.id, { duration: 120, notice: '更新后的须知', materials: ['新物料'] })
    const back: any = await service.findById(created.id)
    expect(back.duration).toBe(120)
    expect(back.notice).toBe('更新后的须知')
    expect(back.materials).toEqual(['新物料'])
  })
})
