import { WaitlistTasksService } from '../src/modules/waitlist/waitlist-tasks.service'
import { BusinessException } from '../src/common/exceptions/business.exception'

// 纯单元测试：屏蔽调度装饰器与重依赖（Prisma/退款服务均为注入的 mock）
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_5_MINUTES: '*/5 * * * *' },
}))
jest.mock('../src/common/prisma.service', () => ({ PrismaService: class {} }))
jest.mock('../src/modules/payment/payment.service', () => ({ PaymentService: class {} }))

/**
 * 候补自动退款的重试上限（回归测试，纯 mock，不连库）：
 * 修复前失败只打日志、条目留 WAITING，每 5 分钟重新发起一次退款，
 * 每次新增一条 order_refunds（线上实测 4 单 → 2332 条）。
 */
describe('候补自动退款：失败退避与上限', () => {
  const now = Date.now()
  const dueCourse = {
    startDate: new Date(now + 60 * 60 * 1000), // 1 小时后开课
    waitlistDeadlineHours: 48, // 截止已过
  }

  function entry(over: Record<string, any> = {}) {
    return {
      id: 'wl_1',
      orderId: 'order_1',
      status: 'WAITING',
      refundAttempts: 0,
      refundNextRetryAt: null,
      refundLastError: null,
      course: dueCourse,
      order: { id: 'order_1', status: 'PAID' },
      ...over,
    }
  }

  function build(entries: any[]) {
    const prisma = {
      waitlistEntry: {
        findMany: jest.fn().mockResolvedValue(entries),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    const payment = { refundFull: jest.fn() }
    const alert = { notify: jest.fn().mockResolvedValue(undefined) }
    return {
      prisma,
      payment,
      alert,
      tasks: new WaitlistTasksService(prisma as any, payment as any, alert as any),
    }
  }

  it('可重试失败 → 按退避记录，退避期内不再打网关', async () => {
    const { prisma, payment, tasks } = build([entry()])
    payment.refundFull.mockRejectedValueOnce(new BusinessException('退款结果待确认', 5107))

    await tasks.refundExpiredWaitlist('course_1')

    expect(payment.refundFull).toHaveBeenCalledTimes(1)
    const data = prisma.waitlistEntry.update.mock.calls[0][0].data
    expect(data.refundAttempts).toBe(1)
    expect(data.refundLastError).toContain('退款结果待确认')
    expect(data.refundNextRetryAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000)

    // 退避期内的下一轮：直接跳过，不重复发起
    const retry = build([entry({ refundAttempts: 1, refundNextRetryAt: new Date(Date.now() + 4 * 60 * 1000) })])
    await retry.tasks.refundExpiredWaitlist('course_1')
    expect(retry.payment.refundFull).not.toHaveBeenCalled()
  })

  it('网关明确拒绝（5105）→ 一次即停止自动重试并转人工（且必须发出告警）', async () => {
    const { prisma, payment, tasks, alert } = build([entry()])
    payment.refundFull.mockRejectedValueOnce(new BusinessException('退款被拒绝', 5105))

    await tasks.refundExpiredWaitlist('course_1')

    expect(payment.refundFull).toHaveBeenCalledTimes(1)
    // 转人工之后必须有人被通知到，否则等于只写进日志
    expect(alert.notify).toHaveBeenCalledTimes(1)
    expect(alert.notify.mock.calls[0][0]).toContain('人工')
    const data = prisma.waitlistEntry.update.mock.calls[0][0].data
    expect(data.refundAttempts).toBe(6)
    expect(data.refundNextRetryAt).toBeNull()
    expect(data.refundLastError).toMatch(/^\[需人工\]/)

    // 标记为需人工后，后续轮次不再发起退款
    const later = build([entry({ refundAttempts: 6, refundLastError: '[需人工]' })])
    await later.tasks.refundExpiredWaitlist('course_1')
    expect(later.payment.refundFull).not.toHaveBeenCalled()
  })

  it('持续失败达到上限 → 停止重试，不会无限刷退款流水', async () => {
    const { prisma, payment, tasks } = build([entry({ refundAttempts: 5 })])
    payment.refundFull.mockRejectedValueOnce(new BusinessException('网络异常', 5107))

    await tasks.refundExpiredWaitlist('course_1')

    expect(payment.refundFull).toHaveBeenCalledTimes(1)
    expect(prisma.waitlistEntry.update.mock.calls[0][0].data.refundAttempts).toBe(6)
  })

  it('退款在途（订单 REFUNDING）→ 交给对账任务，不重复发起', async () => {
    const { prisma, payment, tasks } = build([
      entry({ order: { id: 'order_1', status: 'REFUNDING' } }),
    ])
    await tasks.refundExpiredWaitlist('course_1')
    expect(payment.refundFull).not.toHaveBeenCalled()
    expect(prisma.waitlistEntry.update).not.toHaveBeenCalled()
  })

  it('订单已退款完成 → 只补记条目终态', async () => {
    const { prisma, payment, tasks } = build([
      entry({ order: { id: 'order_1', status: 'REFUNDED' } }),
    ])
    await tasks.refundExpiredWaitlist('course_1')
    expect(payment.refundFull).not.toHaveBeenCalled()
    expect(prisma.waitlistEntry.update.mock.calls[0][0].data.status).toBe('REFUNDED')
  })

  it('未到截止时间 → 完全不处理', async () => {
    const { prisma, payment, tasks } = build([
      entry({ course: { startDate: new Date(Date.now() + 240 * 3600 * 1000), waitlistDeadlineHours: 48 } }),
    ])
    await tasks.refundExpiredWaitlist('course_1')
    expect(payment.refundFull).not.toHaveBeenCalled()
    expect(prisma.waitlistEntry.update).not.toHaveBeenCalled()
  })
})