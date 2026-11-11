import { Injectable, Logger } from '@nestjs/common'
import { tasksEnabled } from '../../common/tasks-enabled'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../common/prisma.service'
import { AlertService } from '../../common/alert/alert.service'
import { PaymentService } from '../payment/payment.service'
import { BusinessException } from '../../common/exceptions/business.exception'

/** 失败重试退避（分钟）：5 → 15 → 60 → 360 → 1440，用尽后固定每天一次 */
const RETRY_BACKOFF_MINUTES = [5, 15, 60, 360, 1440]
/** 连续失败达到该次数即停止自动重试，转人工；防止网关持续拒绝时无限刷退款流水 */
const MAX_REFUND_ATTEMPTS = 6
/** 网关明确拒绝（不接受该笔退款）的响应码：重试无意义，直接转人工 */
const TERMINAL_BIZ_CODES = new Set([5105, 5106])

/**
 * 候补定时任务：
 * - 候补截止（开课前 waitlistDeadlineHours 小时）到点仍未轮上 → 自动全额退款
 * - 待支付候补订单超时清理
 *
 * 退款重试策略（2026-11-12 修）：此前失败只打日志、条目保持 WAITING，
 * 于是每 5 分钟重新发起一次退款、每次都新增一条 order_refunds，实测 4 单刷出 2332 条。
 * 现在：失败按指数退避重试，最多 MAX_REFUND_ATTEMPTS 次；网关明确拒绝或超限后
 * 置 refundLastError 并停止自动重试，等人工处理（条目仍为 WAITING，不会静默丢失）。
 */
@Injectable()
export class WaitlistTasksService {
  private readonly logger = new Logger('WaitlistTasksService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly alert: AlertService,
  ) {}

  /**
   * 每 5 分钟扫描：候补截止仍未轮上的 WAITING 条目 → 全额退款
   * @param courseId 仅处理指定课程（测试/人工单课补偿用；定时任务不传）
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async refundExpiredWaitlist(courseId?: string) {
    // 双机部署：备用机 TASKS_ENABLED=false，只接请求不跑定时任务（详见 common/tasks-enabled.ts）
    if (!tasksEnabled()) return
    const now = new Date()
    const entries = await this.prisma.waitlistEntry.findMany({
      where: { status: 'WAITING', ...(courseId ? { courseId } : {}) },
      include: { course: true, order: { select: { id: true, status: true } } },
    })

    let count = 0
    let failed = 0
    let skippedManual = 0
    for (const entry of entries) {
      const course = entry.course
      if (!course?.startDate) continue

      const deadlineHours = course.waitlistDeadlineHours
        ? Number(course.waitlistDeadlineHours)
        : 0
      const deadline = new Date(
        new Date(course.startDate).getTime() - deadlineHours * 3_600_000,
      )
      if (now < deadline) continue

      // 已转人工：不再自动重试（refundLastError 以「[需人工]」开头，后台可见）
      if (entry.refundAttempts >= MAX_REFUND_ATTEMPTS) {
        skippedManual++
        continue
      }
      // 退避门禁：失败后等待退避时间再试，避免每 5 分钟打一次网关
      if (entry.refundNextRetryAt && now < entry.refundNextRetryAt) continue

      // 没有订单，或订单已退款完成：只补记条目终态，不发起退款
      const orderStatus = entry.order?.status
      if (!entry.orderId || orderStatus === 'REFUNDED') {
        await this.markRefunded(entry.id)
        count++
        continue
      }
      // 退款在途：由 refund-reconcile 任务按流水对账结算，这里绝不重复发起
      if (orderStatus === 'REFUNDING') continue
      // 订单不处于可退款状态（如已取消）：转人工，避免每天空转
      if (orderStatus !== 'PAID' && orderStatus !== 'COMPLETED') {
        await this.giveUp(entry.id, entry.refundAttempts, `订单状态 ${orderStatus} 不可自动退款`)
        failed++
        continue
      }

      try {
        await this.paymentService.refundFull(
          entry.orderId,
          '候补截止未轮上，自动全额退款',
          { source: 'SYSTEM' },
        )
        // 退款回调/对账会最终置 REFUNDED；此处先标记，避免重复处理与界面滞后
        await this.markRefunded(entry.id)
        count++
      } catch (e) {
        failed++
        await this.recordFailure(entry, e)
      }
    }

    if (count > 0) this.logger.log(`候补超时退款处理 ${count} 条`)
    if (failed > 0) this.logger.warn(`候补退款本轮失败 ${failed} 条（已按退避重试）`)
    if (skippedManual > 0) {
      this.logger.error(`候补退款待人工处理 ${skippedManual} 条，已停止自动重试`)
    }
  }

  private async markRefunded(entryId: string) {
    await this.prisma.waitlistEntry.update({
      where: { id: entryId },
      data: { status: 'REFUNDED', refundedAt: new Date(), refundNextRetryAt: null },
    })
  }

  /** 记录一次失败：明确拒绝/超限 → 转人工；其余 → 指数退避 */
  private async recordFailure(
    entry: { id: string; refundAttempts: number },
    e: unknown,
  ) {
    const message = (e as Error)?.message ?? String(e)
    const attempts = entry.refundAttempts + 1
    const bizCode = e instanceof BusinessException ? e.bizCode : null
    const terminal = bizCode !== null && TERMINAL_BIZ_CODES.has(bizCode)

    if (terminal || attempts >= MAX_REFUND_ATTEMPTS) {
      await this.giveUp(entry.id, attempts, message)
      this.logger.error(
        `候补退款${terminal ? '被网关明确拒绝' : `连续失败 ${attempts} 次`}，停止自动重试，需人工处理：${message}`,
      )
      // 钱退不出去 = 用户等着拿钱，必须出圈提醒，不能只躺在日志里
      await this.alert.notify(
        '候补退款需人工处理',
        `候补条目 ${entry.id}\n原因：${terminal ? '网关明确拒绝（永久失败）' : `连续失败 ${attempts} 次`}\n明细：${message}`,
      )
      return
    }

    const backoff =
      RETRY_BACKOFF_MINUTES[Math.min(attempts - 1, RETRY_BACKOFF_MINUTES.length - 1)]
    await this.prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        refundAttempts: attempts,
        refundNextRetryAt: new Date(Date.now() + backoff * 60_000),
        refundLastError: message,
      },
    })
    this.logger.warn(`候补退款失败（第 ${attempts} 次），${backoff} 分钟后重试：${message}`)
  }

  /** 停止自动重试：attempts 顶到上限，refundLastError 标记为需人工 */
  private async giveUp(entryId: string, attempts: number, message: string) {
    await this.prisma.waitlistEntry.update({
      where: { id: entryId },
      data: {
        refundAttempts: MAX_REFUND_ATTEMPTS,
        refundNextRetryAt: null,
        refundLastError: `[需人工] 已尝试 ${attempts} 次：${message}`,
      },
    })
  }
}