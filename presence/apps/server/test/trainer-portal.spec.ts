import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { TrainerPortalService } from '../src/modules/trainer-portal/trainer-portal.service'
import { PasswordPolicyService } from '../src/common/password-policy.service'
import { StorageService } from '../src/common/storage/storage.service'
import { buildTestContext, Seeder, TestContext } from './helpers'

/**
 * 导师门户：归属隔离 / 提案草稿与提交流程 / 名单时间锁。
 * 重点验证「改个 id 就能看别人数据」与「提交后还能改」这两类最容易出事的边界。
 */
describe('导师门户：归属、提案与名单', () => {
  let ctx: TestContext
  let seeder: Seeder
  let service: TrainerPortalService
  const proposalIds: string[] = []
  const courseIds: string[] = []

  const token = (trainerId: string, userId: string, phone = '13800000000') => ({
    userId,
    trainerId,
    phone,
    displayName: '测试导师',
  })

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    const config = new ConfigService()
    service = new TrainerPortalService(
      ctx.prisma,
      new JwtService({ secret: 'test' }),
      config,
      new PasswordPolicyService(config),
      new StorageService(config),
    )
  })

  afterAll(async () => {
    await ctx.prisma.courseProposal.deleteMany({ where: { id: { in: proposalIds } } })
    await ctx.prisma.course.deleteMany({ where: { id: { in: courseIds } } })
    await seeder.cleanup()
    await ctx.app.close()
  })

  it('A. 别的导师看不到我的提案', async () => {
    const mine = await seeder.trainer()
    const other = await seeder.trainer()
    const saved = await service.saveProposal(
      token(mine.id, mine.userId),
      { title: '私密提案', categories: ['瑜伽'], targetAudience: ['零基础'] },
      false,
    )
    proposalIds.push(saved.id)

    await expect(service.getProposal(token(other.id, other.userId), saved.id)).rejects.toMatchObject({ bizCode: 4040 })
    // 本人读得到
    const detail = await service.getProposal(token(mine.id, mine.userId), saved.id)
    expect(detail.id).toBe(saved.id)
  })

  it('B. 草稿允许缺项，submit 才校验；提交后锁定不可再改', async () => {
    const t = await seeder.trainer()
    const tctx = token(t.id, t.userId)

    const draft = await service.saveProposal(tctx, { description: '随便写点' }, false)
    proposalIds.push(draft.id)
    expect(draft.status).toBe('DRAFT')

    // 存草稿不校验；点提交才报缺项，并给出可读清单
    await expect(service.saveProposal(tctx, { id: draft.id, submit: true } as any, true)).rejects.toMatchObject({
      bizCode: 4002,
    })

    const filled = {
      id: draft.id,
      title: '晨间舒展流',
      coverImage: 'course/cover.jpg',
      categories: ['瑜伽'],
      targetAudience: ['零基础'],
      durationMinutes: 90,
      totalSessions: 4,
      description: '以呼吸带动身体的慢流瑜伽，适合长期久坐人群。',
      goals: '学会三个基础呼吸法，缓解肩颈紧张。',
      materials: ['瑜伽砖', '毛毯'],
      supportNeeds: ['场地与设备', '助教配合'],
      requestedMaxCapacity: 16,
      requestedPrice: 128,
    }
    const submitted = await service.saveProposal(tctx, filled, true)
    expect(submitted.status).toBe('SUBMITTED')

    const detail = await service.getProposal(tctx, draft.id)
    expect(detail.description).toContain('慢流瑜伽')
    expect(detail.materials).toEqual(['瑜伽砖', '毛毯'])
    expect(detail.supportNeeds).toEqual(['场地与设备', '助教配合'])
    expect(detail.requestedPrice).toBe(128)

    await expect(service.saveProposal(tctx, { id: draft.id, title: '偷偷改名' }, false)).rejects.toMatchObject({
      bizCode: 4003,
    })
  })

  it('C. 被驳回后可改并重新提交，驳回角标要清空', async () => {
    const t = await seeder.trainer()
    const tctx = token(t.id, t.userId)
    const saved = await service.saveProposal(
      tctx,
      {
        title: '呼吸与冥想',
        coverImage: 'course/cover.jpg',
        categories: ['冥想'],
        targetAudience: ['久坐人群'],
        durationMinutes: 60,
        totalSessions: 1,
        description: '四十分钟呼吸练习，配合二十分钟静坐收尾，帮助长期紧绷的人慢下来。',
        goals: '掌握 4-7-8 呼吸法。',
        requestedMaxCapacity: 10,
      },
      true,
    )
    proposalIds.push(saved.id)

    await ctx.prisma.courseProposal.update({
      where: { id: saved.id },
      data: { status: 'REJECTED', rejectFields: ['coverImage'], rejectReason: '封面不清晰' },
    })
    const rejected = await service.getProposal(tctx, saved.id)
    expect(rejected.status).toBe('REJECTED')
    expect(rejected.rejectFieldLabels).toEqual(['封面图'])
    expect(rejected.rejectReason).toBe('封面不清晰')

    const resaved = await service.saveProposal(tctx, { id: saved.id, coverImage: 'course/cover2.jpg' }, true)
    expect(resaved.status).toBe('SUBMITTED')
    const row = await ctx.prisma.courseProposal.findUnique({ where: { id: saved.id } })
    expect(row?.rejectReason).toBeNull()
    expect(Array.isArray(row?.rejectFields) ? row?.rejectFields : []).toHaveLength(0)
  })

  it('D. 名单：非本人课程 4040，开课前 3 小时内才解锁', async () => {
    const t = await seeder.trainer()
    const other = await seeder.trainer()
    const venue = await seeder.venue()
    const startDate = new Date(Date.now() + 48 * 3600 * 1000)
    const endDate = new Date(startDate.getTime() + 3600 * 1000)
    const pad = (v: number) => String(v).padStart(2, '0')
    const clock = (at: Date) => {
      const local = new Date(at.getTime() + 8 * 3600 * 1000)
      return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
    }
    const course = await ctx.prisma.course.create({
      data: {
        title: '名单锁测试课程',
        coverImage: 'cover',
        type: 'SINGLE',
        categories: ['test'],
        description: '测试',
        targetAudience: ['all'],
        startDate,
        endDate,
        startTime: clock(startDate),
        endTime: clock(endDate),
        trainerId: t.id,
        minCapacity: 1,
        maxCapacity: 6,
        originalPrice: 100,
        venueId: venue.id,
        status: 'PUBLISHED',
        gallery: [],
        weekdays: [],
      },
    })
    courseIds.push(course.id)

    await expect(service.courseRoster(token(other.id, other.userId), course.id)).rejects.toMatchObject({ bizCode: 4040 })
    // 两天后开课：头像上了锁
    await expect(service.courseRoster(token(t.id, t.userId), course.id)).rejects.toMatchObject({ bizCode: 4003 })

    const upcoming = await service.myCourses(token(t.id, t.userId), { phase: 'upcoming' })
    expect(upcoming.find((c) => c.id === course.id)?.rosterUnlocked).toBe(false)

    // 拨到开课前 1 小时：同一接口放行
    const soonStart = new Date(Date.now() + 3600 * 1000)
    await ctx.prisma.course.update({
      where: { id: course.id },
      data: { startDate: soonStart, startTime: clock(soonStart), endDate: new Date(soonStart.getTime() + 3600 * 1000) },
    })
    const roster = await service.courseRoster(token(t.id, t.userId), course.id)
    expect(roster.course.id).toBe(course.id)
    const soon = await service.myCourses(token(t.id, t.userId), {})
    expect(soon.find((c) => c.id === course.id)?.rosterUnlocked).toBe(true)
  })
})