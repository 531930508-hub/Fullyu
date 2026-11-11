import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../common/prisma.service'
import { AlertService } from '../../common/alert/alert.service'
import { PaymentService, REFUND_RECONCILE_MAX_ATTEMPTS } from './payment.service'

/** 超过该时长仍未收到回调的退款，主动向网关对账 */
const STALE_AFTER_MS = 5 * 60 * 1000
/** 每轮最多对账笔数，避免网关异常时放大请求 */
const BATCH_SIZE = 10

/**
 * 退款自动对账：
 * - 回调丢失时，订单会一直停在 REFUNDING / 流水停在 PROCESSING、UNKNOWN；
 * - 每 5 分钟挑出超过 5 分钟未更新的进行中退款，主动查询网关并结算；
 * - 兼容本次改造前没有退款流水的旧订单（REFUNDING 且无任何流水）。
 *
 * 查询到「未找到」不会自动判失败（可能是尚未受理或查询日期不匹配），
 * 由后台人工核对后确认未退款，避免误判后重复退款。
 */
@Injectable()
export class RefundReconcileTasksService {
  private readonly logger = new Logger('RefundReconcileTasksService')

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly alert: AlertService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingRefunds() {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS)
    let handled = 0

    // 1) 进行中的退款流水：受理中/结果待确认且一段时间未更新
    const attempts = await this.prisma.orderRefund.findMany({
      where: {
        status: { in: ['PROCESSING', 'UNKNOWN'] },
        updatedAt: { lt: staleBefore },
        // 对账封顶：查不到结果的流水不能无限重查（每查一次都会刷新 updatedAt 再次入选）
        attempts: { lt: REFUND_RECONCILE_MAX_ATTEMPTS },
      },
      select: { id: true, orderId: true, outRefundNo: true },
      orderBy: { updatedAt: 'asc' },
      take: BATCH_SIZE,
    })
    for (const attempt of attempts) {
      try {
        const result = await this.paymentService.queryRefundStatus(
          attempt.orderId,
          attempt.id,
        )
        if (result.status === 'SUCCESS' || result.status === 'FAIL') {
          this.logger.log(
            `退款对账 ${attempt.outRefundNo}: ${result.status} ${result.message}`,
          )
          handled++
        }
      } catch (e) {
        this.logger.warn(
          `退款对账失败 ${attempt.outRefundNo}: ${(e as Error)?.message ?? String(e)}`,
        )
      }
    }

    // 2) 旧版退款：订单停在 REFUNDING 且没有任何退款流水
    const legacyOrders = await this.prisma.order.findMany({
      where: {
        status: 'REFUNDING',
        refunds: { none: {} },
        updatedAt: { lt: staleBefore },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: BATCH_SIZE,
    })
    for (const order of legacyOrders) {
      try {
        const result = await this.paymentService.queryRefundStatus(order.id)
        if (result.status === 'SUCCESS' || result.status === 'FAIL') {
          this.logger.log(
            `旧版退款对账 ${order.id}: ${result.status} ${result.message}`,
          )
          handled++
        }
      } catch (e) {
        this.logger.warn(
          `旧版退款对账失败 ${order.id}: ${(e as Error)?.message ?? String(e)}`,
        )
      }
    }

    if (handled > 0) {
      this.logger.log(`本轮退款对账完成，结算 ${handled} 笔`)
    }

    // 3) 已停止自动对账的卡单：只提示不处理。
    //    这类流水网关查不到、也不能判失败，必须人工在后台核对后决定「确认未退 / 重新发起」。
    //    每小时提醒一次，避免刷屏又不会没人看见。
    if (new Date().getMinutes() < 5) {
      const stuck = await this.prisma.orderRefund.count({
        where: {
          status: { in: ['PROCESSING', 'UNKNOWN'] },
          attempts: { gte: REFUND_RECONCILE_MAX_ATTEMPTS },
        },
      })
      if (stuck > 0) {
        this.logger.error(
          `退款流水 ${stuck} 笔已对账 ${REFUND_RECONCILE_MAX_ATTEMPTS} 次仍未确认，自动查询已停止，需人工核对`,
        )
        await this.alert.notify(
          '退款流水对账卡单',
          `${stuck} 笔退款已对账 ${REFUND_RECONCILE_MAX_ATTEMPTS} 次仍未确认（网关查不到），自动查询已停止。\n处理：后台「销售 → 订单 → 退款流水」逐笔核对，确认未退后重新发起或标记失败。`,
        )
      }
    }
  }
}
