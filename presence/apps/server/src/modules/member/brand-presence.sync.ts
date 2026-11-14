import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { orderAmountToFen } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BrandMemberClient, BrandResponseError } from '../../common/crm/brand-member.client'
import { BrandPerksService } from '../../common/crm/brand-perks.service'

const TICK_MS = 60_000
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const BATCH = 50
/** 顾客在 CRM 尚无档案时先退避一小时，避免每分钟重复打扰。 */
const MEMBER_MISSING_BACKOFF_MS = 60 * 60 * 1000
const PAID_STATUSES = ['PAID', 'COMPLETED', 'REFUNDING', 'REFUNDED'] as const
/** 会员价只出现在课程/候补订单；其他订单类型不计入品牌会员节省。 */
const BRAND_PRICED_TYPES = new Set(['COURSE', 'WAITLIST'])

export type BrandPresenceSyncResult = {
  reported: number
  refunded: number
  skipped: number
  /** CRM 尚无该用户档案：不是同步故障，按小时退避后重试。 */
  missing: number
  failed: number
}

type OrderRow = {
  id: string
  userId: string
  orderType: string
  status: string
  actualPaid: unknown
  discountAmount: unknown
  paymentTime: Date | null
  refunds: Array<{ amountFen: number }>
}

/** 订单累计退款（分）：整单退款按实付计，其余以已到账流水为准，受理中的不算。 */
export function refundedCentsOf(order: OrderRow, paidCents: number): number {
  if (order.status === 'REFUNDED') return paidCents
  const sum = order.refunds.reduce((total, row) => total + Math.max(0, row.amountFen || 0), 0)
  return Math.min(sum, paidCents)
}

/** 品牌会员价节省（分）：只统计课程/候补订单的优惠额。 */
export function savedCentsOf(order: OrderRow): number {
  if (!BRAND_PRICED_TYPES.has(order.orderType)) return 0
  return Math.max(0, orderAmountToFen(order.orderType, Number(order.discountAmount) || 0))
}

/**
 * 在场 → Full愈 CRM 的后台同步（2026-11-08 会议）：
 * 已付款订单的实付与累计退款上报，用于「每满 ¥300 得一次游戏机会」与会员节省。
 * 畅练卡下线后，不再向 CRM 附赠/撤销同期品牌会员。
 *
 * 同步默认开启；如需临时停用，显式设置 BRAND_ORDER_REPORT_ENABLED=0。
 * 支付成功后还会针对该用户立即同步一次，不必等下一轮定时任务。
 * 数据库是唯一来源，CRM 接口按 orderRef 幂等，进程重启后重放不会多发；
 * 内存指纹只用来省掉无变化的请求。任何失败都不记指纹，服务不可用时整批停下。
 */
@Injectable()
export class BrandPresenceSync implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BrandPresenceSync')
  private timer?: NodeJS.Timeout
  private running = false
  private readonly orderSent = new Map<string, string>()
  private readonly backoff = new Map<string, number>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly brand: BrandMemberClient,
    private readonly perks: BrandPerksService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return
    if (!this.orderOn()) return
    if (!this.brand.enabled) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** 默认开启；只有在环境里显式写 0/false/off 才停用。 */
  private flag(name: string): boolean {
    const raw = String(process.env[name] || '').trim().toLowerCase()
    return !['0', 'false', 'off', 'no'].includes(raw)
  }

  private orderOn() {
    return this.flag('BRAND_ORDER_REPORT_ENABLED')
  }

  /** 支付成功后按单个用户立即同步，不必等下一轮定时任务。 */
  async syncUser(userId: string, now = new Date()): Promise<BrandPresenceSyncResult> {
    if (!userId) {
      return { reported: 0, refunded: 0, skipped: 0, missing: 0, failed: 0 }
    }
    return this.runOnce(now, { orders: this.orderOn() }, [userId])
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      const r = await this.runOnce(new Date())
      if (r.reported || r.refunded || r.missing || r.failed) {
        this.logger.log(
          `品牌会员同步：订单 ${r.reported}、退款 ${r.refunded}、未建档 ${r.missing}、失败 ${r.failed}`,
        )
      }
    } catch (error) {
      this.logger.error(`品牌会员同步失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.running = false
    }
  }

  /** 单轮同步；测试直接调用并显式指定要跑的部分。可按用户过滤，用于支付成功后即时同步。 */
  async runOnce(
    now: Date,
    parts: { orders?: boolean } = { orders: this.orderOn() },
    userIds?: string[],
  ): Promise<BrandPresenceSyncResult> {
    const result: BrandPresenceSyncResult = {
      reported: 0,
      refunded: 0,
      skipped: 0,
      missing: 0,
      failed: 0,
    }
    if (!this.brand.enabled) return result
    if (parts.orders) await this.syncOrders(now, result, userIds)
    return result
  }

  private waiting(userId: string, now: Date): boolean {
    const until = this.backoff.get(userId)
    return Boolean(until && until > now.getTime())
  }

  private async syncOrders(
    now: Date,
    result: BrandPresenceSyncResult,
    userIds?: string[],
  ): Promise<void> {
    const since = new Date(now.getTime() - WINDOW_MS)
    const where: Prisma.OrderWhereInput = {
      status: { in: [...PAID_STATUSES] },
      actualPaid: { gt: 0 },
      paymentTime: { not: null },
      // 退款可能发生在付款 7 天后：按最近更新也扫一遍，累计退款才能上报。
      OR: [{ paymentTime: { gte: since } }, { updatedAt: { gte: since } }],
    }
    if (userIds?.length) where.userId = { in: userIds }
    const orders = (await this.prisma.order.findMany({
      where,
      orderBy: { paymentTime: 'asc' },
      select: {
        id: true,
        userId: true,
        orderType: true,
        status: true,
        actualPaid: true,
        discountAmount: true,
        paymentTime: true,
        refunds: { where: { status: 'SUCCESS' }, select: { amountFen: true } },
      },
      take: 500,
    })) as OrderRow[]

    let attempts = 0
    for (const order of orders) {
      if (attempts >= BATCH) break
      const paidCents = orderAmountToFen(order.orderType, Number(order.actualPaid) || 0)
      if (paidCents <= 0) {
        result.skipped += 1
        continue
      }
      const refunded = refundedCentsOf(order, paidCents)
      const savedCents = savedCentsOf(order)
      const fingerprint = `${paidCents}:${refunded}:${savedCents}`
      if (this.orderSent.get(order.id) === fingerprint || this.waiting(order.userId, now)) {
        result.skipped += 1
        continue
      }
      attempts += 1
      try {
        await this.brand.reportOrder(order.userId, {
          orderRef: order.id,
          paidCents,
          savedCents,
          occurredAt: (order.paymentTime as Date).toISOString(),
        })
        result.reported += 1
        if (refunded > 0) {
          await this.brand.refundOrder(order.userId, {
            orderRef: order.id,
            refundCents: refunded,
            occurredAt: now.toISOString(),
          })
          result.refunded += 1
        }
        this.orderSent.set(order.id, fingerprint)
        this.backoff.delete(order.userId)
      } catch (error) {
        const code = this.errorCode(error)
        if (code === 'MEMBER_NOT_FOUND') result.missing += 1
        else result.failed += 1
        if (!this.keepGoing(error, code, order.userId, now, `订单 ${order.id}`)) break
      }
    }
    const live = new Set(orders.map((order) => order.id))
    for (const id of this.orderSent.keys()) if (!live.has(id)) this.orderSent.delete(id)
  }

  /** 档案未同步 → 退避（单独记 missing）；4xx 契约错误逐条记录继续；服务不可用 → 整批停下。 */
  private keepGoing(error: unknown, code: string, userId: string, now: Date, label: string) {
    if (code === 'MEMBER_NOT_FOUND') {
      this.backoff.set(userId, now.getTime() + MEMBER_MISSING_BACKOFF_MS)
      return true
    }
    if (error instanceof BrandResponseError && error.status >= 400 && error.status < 500) {
      this.logger.warn(`${label} 同步被拒：HTTP ${error.status} ${code}`.trim())
      return true
    }
    this.logger.warn(`品牌会员 CRM 暂不可用，本轮同步中止（${code || '未知'}）`)
    return false
  }

  private errorCode(error: unknown): string {
    if (error instanceof BrandResponseError) {
      const payload =
        error.payload && typeof error.payload === 'object'
          ? (error.payload as Record<string, unknown>)
          : {}
      return typeof payload.error === 'string' ? payload.error : ''
    }
    return ''
  }
}
