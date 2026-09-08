import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { PrismaService } from '../src/common/prisma.service'
import { CourseService } from '../src/modules/course/course.service'
import { Seeder } from './helpers'

/**
 * 课程生命周期与场地占用 集成测试（真实 MySQL）。
 * 覆盖业务规则：
 * - 发布校验场地可用性 + 场地时间冲突（课程排期 ⇄ 场地预约 双向互斥）
 * - 发布成功自动登记场地占用，下架/过期释放占用
 * - 状态流转合法性：下架后禁止再上架、终态不可逆
 * - 下架前置：存在已支付报名时拦截
 */
describe('课程生命周期与场地占用', () => {
  let app: INestApplication
  let prisma: PrismaService
  let courseSvc: CourseService
  let seeder: Seeder

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, CourseService],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = moduleRef.get(PrismaService)
    courseSvc = moduleRef.get(CourseService)
    seeder = new Seeder(prisma)
  })

  afterAll(async () => {
    await seeder.cleanup()
    await app.close()
  })

  it('A. 发布成功后自动登记场地占用', async () => {
    const course = await seeder.course({ status: 'DRAFT' })
    const updated = await courseSvc.setStatus(course!.id, 'PUBLISHED')
    expect(updated.status).toBe('PUBLISHED')

    const res = await prisma.venueReservation.findFirst({ where: { courseId: course!.id } })
    expect(res).toBeTruthy()
    expect(res!.eventName).toContain('课程占用')
  })

  it('B. 场地不可用（isAvailable=false）禁止发布', async () => {
    const venue = await seeder.venue()
    await prisma.venue.update({ where: { id: venue.id }, data: { isAvailable: false } })
    const course = await seeder.course({ status: 'DRAFT', venueId: venue.id })

    await expect(courseSvc.setStatus(course!.id, 'PUBLISHED')).rejects.toThrow(/不可用/)
  })

  it('C. 同场地同时段与其他已发布课程冲突则拦截，错峰可发布', async () => {
    const venue = await seeder.venue()
    const c1 = await seeder.course({ status: 'DRAFT', venueId: venue.id, startTime: '10:00', endTime: '11:00' })
    await courseSvc.setStatus(c1!.id, 'PUBLISHED') // 占用 10:00-11:00

    const c2 = await seeder.course({ status: 'DRAFT', venueId: venue.id, startTime: '10:30', endTime: '11:30' })
    await expect(courseSvc.setStatus(c2!.id, 'PUBLISHED')).rejects.toThrow(/已被课程/)

    const c3 = await seeder.course({ status: 'DRAFT', venueId: venue.id, startTime: '12:00', endTime: '13:00' })
    const ok = await courseSvc.setStatus(c3!.id, 'PUBLISHED')
    expect(ok.status).toBe('PUBLISHED')
  })

  it('D. 同场地同时段与手动场地预约冲突则拦截', async () => {
    const venue = await seeder.venue()
    await seeder.reservation({ venueId: venue.id, startTime: '10:00', endTime: '11:00' })
    const course = await seeder.course({ status: 'DRAFT', venueId: venue.id, startTime: '10:30', endTime: '11:30' })

    await expect(courseSvc.setStatus(course!.id, 'PUBLISHED')).rejects.toThrow(/已被预约/)
  })

  it('E. 下架释放场地占用，且下架后禁止再上架', async () => {
    const course = await seeder.course({ status: 'DRAFT' })
    await courseSvc.setStatus(course!.id, 'PUBLISHED')
    expect(await prisma.venueReservation.count({ where: { courseId: course!.id } })).toBe(1)

    await courseSvc.setStatus(course!.id, 'CANCELLED') // 无已支付报名，可下架
    expect(await prisma.venueReservation.count({ where: { courseId: course!.id } })).toBe(0)

    await expect(courseSvc.setStatus(course!.id, 'PUBLISHED')).rejects.toThrow(/已下架/)
  })

  it('F. 拦截明显非法流转（已结束 → 草稿）', async () => {
    const course = await seeder.course({ status: 'DRAFT' })
    await courseSvc.setStatus(course!.id, 'PUBLISHED')
    await courseSvc.setStatus(course!.id, 'COMPLETED')

    await expect(courseSvc.setStatus(course!.id, 'DRAFT')).rejects.toThrow(/不允许变更/)
  })

  it('G. 存在已支付报名时禁止下架，处理退款后可下架', async () => {
    const course = await seeder.course({ status: 'DRAFT' })
    await courseSvc.setStatus(course!.id, 'PUBLISHED')

    const user = await seeder.user()
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        courseId: course!.id,
        orderType: 'COURSE',
        originalPrice: 100,
        actualPaid: 100,
        status: 'PAID',
      },
    })

    await expect(courseSvc.setStatus(course!.id, 'CANCELLED')).rejects.toThrow(/已支付报名/)

    // 处理退款后放行
    await prisma.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } })
    const done = await courseSvc.setStatus(course!.id, 'CANCELLED')
    expect(done.status).toBe('CANCELLED')
  })

  it('H. 更新已发布课程到冲突时段被拦截，错峰更新同步占用登记', async () => {
    const venue = await seeder.venue()
    const a = await seeder.course({ status: 'DRAFT', venueId: venue.id, startTime: '09:00', endTime: '10:00' })
    await courseSvc.setStatus(a!.id, 'PUBLISHED')
    const b = await seeder.course({ status: 'DRAFT', venueId: venue.id, startTime: '14:00', endTime: '15:00' })
    await courseSvc.setStatus(b!.id, 'PUBLISHED')

    // 把 b 改到与 a 冲突的 09:30-10:30 → 拦截
    await expect(
      courseSvc.update(b!.id, { startTime: '09:30', endTime: '10:30' }),
    ).rejects.toThrow(/已被课程/)

    // 改到错峰 16:00-17:00 → 成功且占用登记同步
    await courseSvc.update(b!.id, { startTime: '16:00', endTime: '17:00' })
    const res = await prisma.venueReservation.findFirst({ where: { courseId: b!.id } })
    expect(res!.startTime).toBe('16:00')
  })
})
