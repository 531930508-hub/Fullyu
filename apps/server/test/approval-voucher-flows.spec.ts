import { buildTestContext, Seeder, TestContext, refundNotify } from './helpers'
import { ApprovalService } from '../src/modules/approval/approval.service'
import { ApprovalFlowService } from '../src/modules/approval/approval-flow.service'
import { StockService } from '../src/modules/scm/stock.service'
import { VoucherService } from '../src/modules/voucher/voucher.service'
import { RedisService } from '../src/common/redis.service'
import { BusinessException } from '../src/common/exceptions/business.exception'

/**
 * 二次审批非资金流程（真实命中测试库已配置的流程）：
 * - 强制退款：两级审批，第一级通过前不动订单；通过后按审批快照执行退款
 * - 非当前节点审批人、重复表态拦截；驳回不动订单
 * - 代金券发放命中审批时挂单，通过后按快照落券
 */
describe('二次审批流程', () => {
  let ctx: TestContext
  let seeder: Seeder
  let approval: ApprovalService
  let vouchers: VoucherService
  const instanceIds: string[] = []
  const voucherUserIds: string[] = []

  const adminCtx = (admin: { id: string; username: string }) =>
    ({
      adminId: admin.id,
      username: admin.username,
      permissions: [],
      orgId: null,
      dataScope: 'ALL',
      roles: [],
    }) as any

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    const redis = ctx.moduleRef.get(RedisService)
    approval = new ApprovalService(
      ctx.prisma,
      redis,
      new ApprovalFlowService(ctx.prisma),
      ctx.payment,
      new StockService(ctx.prisma),
    )
    vouchers = new VoucherService(ctx.prisma, approval)
  })

  afterAll(async () => {
    await ctx.prisma.voucher.deleteMany({ where: { userId: { in: voucherUserIds } } })
    await ctx.prisma.approvalInstance.deleteMany({ where: { id: { in: instanceIds } } })
    await seeder.cleanup()
    await ctx.app.close()
  })

  async function paidCourseOrder() {
    const user = await seeder.user()
    const course = await seeder.course({ currentEnrolled: 1 })
    const orderNo = await ctx.order.generateOrderNo('COURSE')
    const order = await ctx.prisma.order.create({
      data: {
        orderNo,
        userId: user.id,
        courseId: course!.id,
        orderType: 'COURSE',
        originalPrice: 100,
        actualPaid: 100,
        status: 'PAID',
        paymentTime: new Date(),
      },
    })
    return { user, course: course!, order }
  }

  it('强制退款两级审批：通过前不动单，全部通过后执行退款并释放名额', async () => {
    const first = await ctx.prisma.adminUser.findUnique({ where: { username: '13900000011' } })
    const second = await ctx.prisma.adminUser.findUnique({ where: { username: '13900000002' } })
    expect(first && second).toBeTruthy()
    const { course, order } = await paidCourseOrder()

    const instance = await approval.submit({
      bizType: 'ORDER_FORCE_REFUND',
      summary: `强制退款订单 ${order.orderNo}`,
      amount: 1,
      requesterId: first!.id,
      payload: { orderId: order.id, refundAmount: 1, reason: '客诉特殊退款' },
    })
    expect(instance).toBeTruthy()
    instanceIds.push(instance!.id)
    expect(instance!.status).toBe('PENDING')
    expect(instance!.nodes).toHaveLength(2)

    // 非当前节点审批人 / 当前节点重复表态均被拦截
    await expect(approval.approve(adminCtx(second!), instance!.id)).rejects.toBeInstanceOf(
      BusinessException,
    )
    const afterFirst = await approval.approve(adminCtx(first!), instance!.id, '同意')
    expect(afterFirst.status).toBe('PENDING')
    expect(afterFirst.currentIndex).toBe(1)
    expect((await ctx.prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('PAID')
    await expect(approval.approve(adminCtx(first!), instance!.id)).rejects.toBeInstanceOf(
      BusinessException,
    )

    const done = await approval.approve(adminCtx(second!), instance!.id, '同意退款')
    expect(done.status).toBe('APPROVED')
    expect(done.resultNote).toContain('已发起强制退款')

    const refunding = await ctx.prisma.order.findUnique({ where: { id: order.id } })
    expect(refunding!.status).toBe('REFUNDING')
    expect(Number(refunding!.refundAmount)).toBe(100)
    // 退款受理中先不释放名额，待退款成功后回调再释放，避免“退款未到账名额已被抢”
    const beforeCallback = await ctx.prisma.course.findUnique({ where: { id: course.id } })
    expect(beforeCallback!.currentEnrolled).toBe(1)

    await ctx.payment.handleRefundNotify(refundNotify(order.id))
    expect((await ctx.prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('REFUNDED')
    const afterSeat = await ctx.prisma.course.findUnique({ where: { id: course.id } })
    expect(afterSeat!.currentEnrolled).toBe(0)

    // 已结束的单不可再次审批
    await expect(approval.approve(adminCtx(second!), instance!.id)).rejects.toBeInstanceOf(
      BusinessException,
    )
  })

  it('驳回落定终态且不动订单', async () => {
    const first = await ctx.prisma.adminUser.findUnique({ where: { username: '13900000011' } })
    const second = await ctx.prisma.adminUser.findUnique({ where: { username: '13900000002' } })
    const { order } = await paidCourseOrder()

    const instance = await approval.submit({
      bizType: 'ORDER_FORCE_REFUND',
      summary: `驳回退款订单 ${order.orderNo}`,
      amount: 1,
      requesterId: first!.id,
      payload: { orderId: order.id, refundAmount: 1, reason: '测试驳回' },
    })
    instanceIds.push(instance!.id)
    await approval.approve(adminCtx(first!), instance!.id)
    const rejected = await approval.reject(adminCtx(second!), instance!.id, '金额不符')
    expect(rejected.status).toBe('REJECTED')
    expect(rejected.resultNote).toContain('驳回')
    expect((await ctx.prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('PAID')
  })

  it('代金券发放：命中审批先挂单，通过后按快照发放并可作废', async () => {
    const approver = await ctx.prisma.adminUser.findUnique({ where: { username: '13900000010' } })
    expect(approver).toBeTruthy()
    const users = await Promise.all([seeder.user(), seeder.user()])
    voucherUserIds.push(...users.map((u) => u.id))

    // 参数校验
    await expect(
      vouchers.grant({ userIds: [], amount: 10, expiresAt: new Date().toISOString(), source: '活动' }),
    ).rejects.toBeInstanceOf(BusinessException)
    await expect(
      vouchers.grant({ userIds: users.map((u) => u.id), amount: 0, expiresAt: new Date().toISOString(), source: '活动' }),
    ).rejects.toBeInstanceOf(BusinessException)
    await expect(
      vouchers.grant({
        userIds: users.map((u) => u.id),
        mode: 'REDUCE_TO',
        targetPrice: -1,
        expiresAt: new Date().toISOString(),
        source: '活动',
      }),
    ).rejects.toBeInstanceOf(BusinessException)
    await expect(
      vouchers.grant({ userIds: users.map((u) => u.id), amount: 10, expiresAt: '', source: '活动' }),
    ).rejects.toBeInstanceOf(BusinessException)

    const pending = await vouchers.grant({
      userIds: users.map((u) => u.id),
      mode: 'REDUCE_BY',
      amount: 10,
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      source: '活动发放',
    })
    expect(pending).toMatchObject({ pendingApproval: true, granted: 0 })
    const instance = await approval.detail((pending as any).approvalId)
    instanceIds.push(instance.id)
    expect(await ctx.prisma.voucher.count({ where: { userId: { in: voucherUserIds } } })).toBe(0)

    const approved = await approval.approve(adminCtx(approver!), instance.id, '同意发放')
    expect(approved.status).toBe('APPROVED')
    expect(approved.resultNote).toContain('已发放 2 张代金券')
    const granted = await ctx.prisma.voucher.findMany({ where: { userId: { in: voucherUserIds } } })
    expect(granted).toHaveLength(2)
    expect(granted.every((v) => v.mode === 'REDUCE_BY' && Number(v.amount) === 10 && v.status === 'UNUSED')).toBe(
      true,
    )

    const usable = await vouchers.myVouchers(users[0].id, true)
    expect(usable).toHaveLength(1)
    await vouchers.revoke(granted[0].id)
    expect((await ctx.prisma.voucher.findUnique({ where: { id: granted[0].id } }))!.status).toBe('REVOKED')
    await ctx.prisma.voucher.update({ where: { id: granted[1].id }, data: { status: 'USED' } })
    await expect(vouchers.revoke(granted[1].id)).rejects.toBeInstanceOf(BusinessException)
  })
})
