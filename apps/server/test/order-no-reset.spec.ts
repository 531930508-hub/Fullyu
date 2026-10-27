import { buildTestContext, Seeder, TestContext } from './helpers'
import { RedisService } from '../src/common/redis.service'

/**
 * 订单号生成健壮性回归。
 *
 * 生产环境出现过：Redis 中 order_seq 计数键丢失（重启/清空/手工补数据），
 * 计数从 1 重新开始，与当天已存在的 C26102700001 撞唯一约束，
 * 导致用户报名直接返回 400「Unique constraint failed on orders_order_no_key」。
 *
 * 期望：计数丢失时以库内当天最大流水兜底，绝不复用已占用订单号。
 */
describe('订单号生成在 Redis 计数丢失后的健壮性', () => {
  let ctx: TestContext
  let seeder: Seeder
  let redis: any

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    redis = ctx.moduleRef.get(RedisService) as any
  })

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.app.close()
  })

  function todayOrderNo(seq: number) {
    const now = new Date()
    const dateStr = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    return `C${dateStr}${String(seq).padStart(5, '0')}`
  }

  it('Redis 计数器归零后仍能生成不冲突的订单号', async () => {
    const user = await seeder.user()
    const course = await seeder.course({ maxCapacity: 5 })

    // 模拟当天已存在的订单（计数键丢失前生成的 00001）。
    // 共享测试库里可能已有当天真实订单，直接复用，避免重复创建。
    const occupied = todayOrderNo(1)
    const exists = await ctx.prisma.order.findUnique({ where: { orderNo: occupied } })
    if (!exists) {
      await ctx.prisma.order.create({
        data: {
          orderNo: occupied,
          userId: user.id,
          originalPrice: 0,
          actualPaid: 0,
          status: 'CANCELLED',
        },
      })
    }

    // 模拟 Redis 计数键被清空：下一次 INCR 从 1 开始
    const originalIncr = redis.incr
    let counter = 0
    redis.incr = async () => {
      counter += 1
      return counter
    }

    try {
      const result = await ctx.enrollment.enroll(course.id, user.id, {})
      const created = await ctx.prisma.order.findUnique({
        where: { id: result.orderId },
        select: { orderNo: true },
      })
      expect(created?.orderNo).not.toBe(occupied)
      expect(created?.orderNo).toMatch(/^C\d{11}$/)
    } finally {
      redis.incr = originalIncr
    }
  })
})
