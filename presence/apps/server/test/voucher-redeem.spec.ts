import { buildTestContext, Seeder, TestContext, createRedisMock, refundNotify } from './helpers'
import { VoucherService } from '../src/modules/voucher/voucher.service'
import { BusinessException } from '../src/common/exceptions/business.exception'
import { normalizeVoucherCode, isValidVoucherCode } from '@fullyu/shared'

/**
 * 代金券升级回归：
 * 1. 减额券面额大于课程价时，抵扣封顶到应付为 0，绝不出现负数；
 *    0 元订单不走支付网关，取消/退款后券回补。
 * 2. 兑换码批量发券：每批 N 张各带唯一密码，未兑换前不归属任何用户；
 *    兑换原子抢占、同人重放幂等、跨人拒绝、过期/作废/格式校验、频率限制。
 */
describe('代金券抵扣封顶与兑换码', () => {
  let ctx: TestContext
  let seeder: Seeder
  let vouchers: VoucherService
  const batchNos: string[] = []
  const extraVoucherIds: string[] = []

  // 直通审批 mock：本 suite 验证发券/兑换机制本身；审批快照路径由 approval-voucher-flows 覆盖
  const approvalMock = { submit: async () => null } as any
  // 频率限制计数从 0 起（helpers 的 incr 为订单号随机基址，不适用）
  const counters = new Map<string, number>()
  const redis = {
    ...createRedisMock(),
    incr: async (k: string) => {
      const next = (counters.get(k) ?? 0) + 1
      counters.set(k, next)
      return next
    },
  }

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    vouchers = new VoucherService(ctx.prisma, approvalMock, redis as any)
  })

  afterAll(async () => {
    if (batchNos.length) {
      await ctx.prisma.voucher.deleteMany({ where: { batchNo: { in: batchNos } } })
    }
    if (extraVoucherIds.length) {
      await ctx.prisma.voucher.deleteMany({ where: { id: { in: extraVoucherIds } } })
    }
    await seeder.cleanup()
    await ctx.app.close()
  })

  function timing(hoursAhead: number) {
    const start = new Date(Date.now() + hoursAhead * 3600 * 1000)
    const end = new Date(start.getTime() + 3600 * 1000)
    const clock = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return { startDate: start, endDate: end, startTime: clock(start), endTime: clock(end) }
  }

  async function makeVoucher(
    userId: string,
    courseId: string,
    opts: { mode?: 'REDUCE_BY' | 'REDUCE_TO'; amount?: number; targetPrice?: number } = {},
  ) {
    const v = await ctx.prisma.voucher.create({
      data: {
        userId,
        mode: opts.mode ?? 'REDUCE_BY',
        amount: opts.amount ?? 299,
        targetPrice: opts.targetPrice ?? null,
        applicableCourseIds: [courseId],
        applicableAll: false,
        expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
        status: 'UNUSED',
        source: '测试发放',
      },
    })
    extraVoucherIds.push(v.id)
    return v
  }

  const getOrder = (id: string) => ctx.prisma.order.findUnique({ where: { id } })
  const getVoucher = (id: string) => ctx.prisma.voucher.findUnique({ where: { id } })

  // ===== 1. 抵扣封顶：减到 0 而不是负数 =====

  it('减 299 元券用在 200 元课程：应付 0，抵扣额=课程价而非券面额', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 20000 })
    const user = await seeder.user({ openId: true })
    const voucher = await makeVoucher(user.id, course!.id, { amount: 299 })

    const { orderId, actualPaid } = await ctx.enrollment.enroll(course!.id, user.id, { voucherId: voucher.id })
    expect(actualPaid).toBe(0)
    const order = await getOrder(orderId)
    expect(Number(order!.voucherDeduction)).toBe(20000)
    expect(Number(order!.actualPaid)).toBe(0)
    expect(order!.voucherId).toBe(voucher.id)
    expect((await getVoucher(voucher.id))!.status).toBe('USED')

    // 0 元单直接履约，不向网关下 1 分钱
    const result = await ctx.payment.createPayment(orderId, user.id)
    expect((result as any).zeroAmount).toBe(true)
    expect((await getOrder(orderId))!.status).toBe('PAID')
    expect((await ctx.prisma.course.findUnique({ where: { id: course!.id } }))!.currentEnrolled).toBe(1)
  })

  it('券面额恰好等于课程价：应付 0', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 29900 })
    const user = await seeder.user()
    const voucher = await makeVoucher(user.id, course!.id, { amount: 299 })
    const { orderId, actualPaid } = await ctx.enrollment.enroll(course!.id, user.id, { voucherId: voucher.id })
    expect(actualPaid).toBe(0)
    expect(Number((await getOrder(orderId))!.voucherDeduction)).toBe(29900)
  })

  it('券面额小于课程价：正常减额', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 50000 })
    const user = await seeder.user()
    const voucher = await makeVoucher(user.id, course!.id, { amount: 299 })
    const { orderId, actualPaid } = await ctx.enrollment.enroll(course!.id, user.id, { voucherId: voucher.id })
    expect(actualPaid).toBe(20100)
    expect(Number((await getOrder(orderId))!.voucherDeduction)).toBe(29900)
  })

  it('减至券目标价高于课程价：不涨价、不白耗券', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 20000 })
    const user = await seeder.user()
    const voucher = await makeVoucher(user.id, course!.id, { mode: 'REDUCE_TO', amount: 0, targetPrice: 500 })
    const { orderId, actualPaid } = await ctx.enrollment.enroll(course!.id, user.id, { voucherId: voucher.id })
    expect(actualPaid).toBe(20000)
    const order = await getOrder(orderId)
    expect(Number(order!.voucherDeduction)).toBe(0)
    expect(order!.voucherId).toBeNull()
    expect((await getVoucher(voucher.id))!.status).toBe('UNUSED')
  })

  it('减至 0 元券：免费报名并核销', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 20000 })
    const user = await seeder.user()
    const voucher = await makeVoucher(user.id, course!.id, { mode: 'REDUCE_TO', amount: 0, targetPrice: 0 })
    const { orderId, actualPaid } = await ctx.enrollment.enroll(course!.id, user.id, { voucherId: voucher.id })
    expect(actualPaid).toBe(0)
    expect(Number((await getOrder(orderId))!.voucherDeduction)).toBe(20000)
    expect((await getVoucher(voucher.id))!.status).toBe('USED')
  })

  it('待支付取消后券回补，可再次使用', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 20000 })
    const user = await seeder.user()
    const voucher = await makeVoucher(user.id, course!.id, { amount: 299 })
    const { orderId } = await ctx.enrollment.enroll(course!.id, user.id, { voucherId: voucher.id })
    await ctx.order.cancelOrder(orderId, user.id, '测试取消')
    expect((await getVoucher(voucher.id))!.status).toBe('UNUSED')
    expect((await getVoucher(voucher.id))!.usedAt).toBeNull()
  })

  it('全额抵扣订单退款后券回补', async () => {
    const course = await seeder.course({
      ...timing(240),
      originalPrice: 20000,
      refundRules: [{ hoursFrom: 0, hoursTo: null, refundPercent: 100 }],
    })
    const user = await seeder.user()
    const voucher = await makeVoucher(user.id, course!.id, { amount: 299 })
    const { orderId } = await ctx.enrollment.enroll(course!.id, user.id, { voucherId: voucher.id })
    await ctx.payment.fulfillPaidOrder(orderId, 'TX_VOUCHER_FULL')
    await ctx.payment.refundOrder(orderId, '测试退款')
    await ctx.payment.handleRefundNotify(refundNotify(orderId))
    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
    expect((await getVoucher(voucher.id))!.status).toBe('UNUSED')
  })

  it('他人券与不适用课程的券被拒绝', async () => {
    const course = await seeder.course({ ...timing(240), originalPrice: 20000 })
    const otherCourse = await seeder.course({ ...timing(260), originalPrice: 20000 })
    const owner = await seeder.user()
    const user = await seeder.user()
    const foreign = await makeVoucher(owner.id, course!.id, { amount: 299 })
    await expect(
      ctx.enrollment.enroll(course!.id, user.id, { voucherId: foreign.id }),
    ).rejects.toBeInstanceOf(BusinessException)
    const scoped = await makeVoucher(user.id, otherCourse!.id, { amount: 299 })
    await expect(
      ctx.enrollment.enroll(course!.id, user.id, { voucherId: scoped.id }),
    ).rejects.toBeInstanceOf(BusinessException)
  })

  // ===== 2. 兑换码批量发券与兑换 =====

  async function issueBatch(quantity = 3, opts: Record<string, any> = {}) {
    const result: any = await vouchers.grantBatch({
      quantity,
      mode: 'REDUCE_BY',
      amount: 299,
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      source: '测试批量发券',
      applicableAll: true,
      ...opts,
    })
    if (result.batchNo) batchNos.push(result.batchNo)
    return result
  }

  it('兑换码规范化：大小写/分隔符/易混字符归一', () => {
    expect(normalizeVoucherCode('abcd-efgh')).toBe('ABCDEFGH')
    expect(normalizeVoucherCode(' abcd efgh ')).toBe('ABCDEFGH')
    // O→0、I/L→1：生成字母表不含 I/L/O，输入易混字符可归一到合法码
    expect(normalizeVoucherCode('ABCD-EFGO')).toBe('ABCDEFG0')
    expect(normalizeVoucherCode('ABCD-EFGL')).toBe('ABCDEFG1')
    expect(isValidVoucherCode('ABCDEFGH')).toBe(true)
    expect(isValidVoucherCode('ABCDEFG0')).toBe(true)
    expect(isValidVoucherCode('ABCD-EFGH')).toBe(false)
    expect(isValidVoucherCode('ABCDEFGI')).toBe(false)
    expect(isValidVoucherCode('ABCDEFG')).toBe(false)
  })

  it('批量发券参数校验', async () => {
    const base = {
      mode: 'REDUCE_BY' as const,
      amount: 10,
      expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      source: '测试',
    }
    await expect(vouchers.grantBatch({ ...base, quantity: 0 })).rejects.toBeInstanceOf(BusinessException)
    await expect(vouchers.grantBatch({ ...base, quantity: 501 })).rejects.toBeInstanceOf(BusinessException)
    await expect(vouchers.grantBatch({ ...base, quantity: 2.5 })).rejects.toBeInstanceOf(BusinessException)
    await expect(vouchers.grantBatch({ ...base, quantity: 2, amount: 0 })).rejects.toBeInstanceOf(BusinessException)
    await expect(vouchers.grantBatch({ ...base, quantity: 2, expiresAt: '' })).rejects.toBeInstanceOf(BusinessException)
    await expect(
      vouchers.grantBatch({ ...base, quantity: 2, mode: 'REDUCE_TO', targetPrice: -1 }),
    ).rejects.toBeInstanceOf(BusinessException)
  })

  it('批量发券：N 张唯一兑换码，未兑换前不归属任何用户', async () => {
    const result = await issueBatch(5)
    expect(result.granted).toBe(5)
    expect(result.codes).toHaveLength(5)
    expect(new Set(result.codes).size).toBe(5)
    for (const code of result.codes) {
      expect(isValidVoucherCode(code)).toBe(true)
      const row = await ctx.prisma.voucher.findUnique({ where: { redeemCode: code } })
      expect(row!.userId).toBeNull()
      expect(row!.status).toBe('UNUSED')
      expect(row!.batchNo).toBe(result.batchNo)
      expect(Number(row!.amount)).toBe(299)
    }
    const user = await seeder.user()
    expect(await vouchers.myVouchers(user.id, true)).toHaveLength(0)

    const batches = await vouchers.batches()
    const mine = batches.find((b: any) => b.batchNo === result.batchNo)
    expect(mine).toMatchObject({ total: 5, redeemed: 0 })
  })

  it('兑换成功：券归属用户并出现在我的资产；同人重放幂等', async () => {
    const { codes } = await issueBatch(1)
    const user = await seeder.user()
    const first: any = await vouchers.redeem(user.id, codes[0].toLowerCase())
    expect(first.replayed).toBe(false)
    expect(first.voucher.status).toBe('UNUSED')
    const row = await ctx.prisma.voucher.findUnique({ where: { redeemCode: codes[0] } })
    expect(row!.userId).toBe(user.id)
    expect(row!.redeemedAt).toBeTruthy()
    const mine = await vouchers.myVouchers(user.id, true)
    expect(mine.map((v) => v.id)).toContain(row!.id)

    const again: any = await vouchers.redeem(user.id, codes[0])
    expect(again.replayed).toBe(true)
    expect(again.voucher.id).toBe(first.voucher.id)
    expect(await vouchers.myVouchers(user.id, true)).toHaveLength(1)
  })

  it('同一码被他人兑换后拒绝；并发抢占只成功一人', async () => {
    const { codes } = await issueBatch(2)
    const u1 = await seeder.user()
    const u2 = await seeder.user()
    await vouchers.redeem(u1.id, codes[0])
    await expect(vouchers.redeem(u2.id, codes[0])).rejects.toBeInstanceOf(BusinessException)

    const results = await Promise.allSettled([
      vouchers.redeem(u1.id, codes[1]),
      vouchers.redeem(u2.id, codes[1]),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const row = await ctx.prisma.voucher.findUnique({ where: { redeemCode: codes[1] } })
    expect([u1.id, u2.id]).toContain(row!.userId)
  })

  it('不存在/格式错误/过期/作废的兑换码均被拒绝', async () => {
    const user = await seeder.user()
    await expect(vouchers.redeem(user.id, 'ABC')).rejects.toBeInstanceOf(BusinessException)
    await expect(vouchers.redeem(user.id, 'ZZZZZZZZ')).rejects.toBeInstanceOf(BusinessException)

    const { codes } = await issueBatch(2)
    await ctx.prisma.voucher.update({
      where: { redeemCode: codes[0] },
      data: { expiresAt: new Date(Date.now() - 86400 * 1000) },
    })
    await expect(vouchers.redeem(user.id, codes[0])).rejects.toBeInstanceOf(BusinessException)

    const row = await ctx.prisma.voucher.findUnique({ where: { redeemCode: codes[1] } })
    await vouchers.revoke(row!.id)
    await expect(vouchers.redeem(user.id, codes[1])).rejects.toBeInstanceOf(BusinessException)
  })

  it('兑换频率限制：同一用户短时多次尝试被拦截', async () => {
    const user = await seeder.user()
    for (let i = 0; i < 10; i++) {
      await expect(vouchers.redeem(user.id, 'ZZZZZZZZ')).rejects.toBeInstanceOf(BusinessException)
    }
    await expect(vouchers.redeem(user.id, 'ZZZZZZZZ')).rejects.toThrow(/频繁/)
  })

  it('批次明细：兑换进度与持券人可查', async () => {
    const { batchNo, codes } = await issueBatch(2)
    const user = await seeder.user()
    await vouchers.redeem(user.id, codes[0])
    const detail: any = await vouchers.batchDetail(batchNo)
    expect(detail.rows).toHaveLength(2)
    const claimed = detail.rows.find((r: any) => r.redeemCode === codes[0])
    expect(claimed.user?.phone).toBe(user.phone)
    expect(detail.summary).toMatchObject({ total: 2, redeemed: 1 })
  })
})