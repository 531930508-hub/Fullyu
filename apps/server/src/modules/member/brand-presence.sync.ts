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
/** 会员价只出现在课程/候补订单；畅练卡 0 元报课的优惠记在畅练卡名下，不算品牌会员节省。 */
const BRAND_PRICED_TYPES = new Set(['COURSE', 'WAITLIST'])

export type BrandPresenceSyncResult = {
  bundled: number
  revoked: number
  reported: number
  refunded: number
  skipped: number
  /** CRM 尚无该用户档案：不是同步故障，按小时退避后重试。 */
  missing: number
  failed: number
}

type PassRow = { id: string; userId: string; status: string; startDate: Date; endDate: Date }

type OrderRow = {
  id: string
  userId: string
  orderType: string
  status: string
  cardType: string | null
  actualPaid: unknown
  discountAmount: unknown
  paymentTime: Date | null
  refunds: Array<{ amountFen: number }>
}

const shanghaiDay = (value: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(value)

/**
 * 畅练卡 → CRM「同期附赠品牌会员」应有的状态。
 * - 有效/冻结且未到期：按当前起止日期附赠（日期变化即更新，CRM 按 passRef 幂等）；
 * - 退款把卡期缩到起始日及以前，或被标为过期但卡期仍在未来：撤销附赠；
 * - 自然到期或部分退款后已结束：仍按实际日期同步，让 CRM 的结束日跟着缩短。
 */
export function passIntent(
  card: PassRow,
  now: Date,
): { kind: 'bundle'; validFrom: string; validUntil: string } | { kind: 'revoke' } {
  const live = card.status === 'ACTIVE' || card.status === 'FROZEN'
  if (card.endDate.getTime() <= card.startDate.getTime()) return { kind: 'revoke' }
  if (!live && card.endDate.getTime() > now.getTime()) return { kind: 'revoke' }
  return {
    kind: 'bundle',
    validFrom: shanghaiDay(card.startDate),
    validUntil: shanghaiDay(new Date(card.endDate.getTime() - 1)),
  }
}

/** 订单累计退款（分）：整单退款按实付计，其余以已到账流水为准，受理中的不算。 */
export function refundedCentsOf(order: OrderRow, paidCents: number): number {
  if (order.status === 'REFUNDED') return paidCents
  const sum = order.refunds.reduce((total, row) => total + Math.max(0, row.amountFen || 0), 0)
  return Math.min(sum, paidCents)
}

/** 品牌会员价节省（分）：只统计没有用畅练卡（cardType 为空）的课程/候补订单。 */
export function savedCentsOf(order: OrderRow): number {
  if (order.cardType || !BRAND_PRICED_TYPES.has(order.orderType)) return 0
  return Math.max(0, orderAmountToFen(order.orderType, Number(order.discountAmount) || 0))
}

/**
 * 在场 → Full愈 CRM 的后台同步（2026-11-08 会议）：
 * 1. 畅练卡有效期内免费附赠同期品牌会员（先做，保证会员价/优先排位及时生效）；
 * 2. 已付款订单的实付与累计退款上报，用于「每满 ¥300 得一次游戏机会」与会员节省。
 *
 * 两项同步默认开启；如需临时停用，显式设置
 * BRAND_PASS_BUNDLE_ENABLED=0、BRAND_ORDER_REPORT_ENABLED=0。
 * 支付成功后还会针对该用户立即同步一次，不必等下一轮定时任务。
 * 数据库是唯一来源，CRM 两类接口都按 passRef / orderRef 幂等，进程重启后重放不会多发；
 * 内存指纹只用来省掉无变化的请求。任何失败都不记指纹，服务不可用时整批停下。
 */
@Injectable()
export class BrandPresenceSync implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BrandPresenceSync')
  private timer?: NodeJS.Timeout
  private running = false
  private readonly passSent = new Map<string, string>()
  private readonly orderSent = new Map<string, string>()
  private readonly backoff = new Map<string, number>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly brand: BrandMemberClient,
    private readonly perks: BrandPerksService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return
    if (!this.passOn() && !this.orderOn()) return
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

  private passOn() {
    return this.flag('BRAND_PASS_BUNDLE_ENABLED')
  }

  private orderOn() {
    return this.flag('BRAND_ORDER_REPORT_ENABLED')
  }

  /** 支付成功后按单个用户立即同步，避免开通畅练卡后要等下一轮定时任务。 */
  async syncUser(userId: string, now = new Date()): Promise<BrandPresenceSyncResult> {
    if (!userId) {
      return { bundled: 0, revoked: 0, reported: 0, refunded: 0, skipped: 0, missing: 0, failed: 0 }
    }
    return this.runOnce(now, { passes: this.passOn(), orders: this.orderOn() }, [userId])
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      const r = await this.runOnce(new Date())
      if (r.bundled || r.revoked || r.reported || r.refunded || r.missing || r.failed) {
        this.logger.log(
          `品牌会员同步：附赠 ${r.bundled}、撤销 ${r.revoked}、订单 ${r.reported}、退款 ${r.refunded}、未建档 ${r.missing}、失败 ${r.failed}`,
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
    parts: { passes?: boolean; orders?: boolean } = { passes: this.passOn(), orders: this.orderOn() },
    userIds?: string[],
  ): Promise<BrandPresenceSyncResult> {
    const result: BrandPresenceSyncResult = {
      bundled: 0,
      revoked: 0,
      reported: 0,
      refunded: 0,
      skipped: 0,
      missing: 0,
      failed: 0,
    }
    if (!this.brand.enabled) return result
    let healthy = true
    if (parts.passes) healthy = await this.syncPasses(now, result, userIds)
    if (parts.orders && healthy) await this.syncOrders(now, result, userIds)
    return result
  }

  private waiting(userId: string, now: Date): boolean {
    const until = this.backoff.get(userId)
    return Boolean(until && until > now.getTime())
  }

  /** 返回 false 表示 CRM 不可用，本轮其余同步也停下。 */
  private async syncPasses(
    now: Date,
    result: BrandPresenceSyncResult,
    userIds?: string[],
  ): Promise<boolean> {
    const since = new Date(now.getTime() - WINDOW_MS)
    const where: Prisma.MemberCardWhereInput = {
      OR: [
        { status: { in: ['ACTIVE', 'FROZEN'] }, endDate: { gt: now } },
        { updatedAt: { gte: since } },
      ],
    }
    if (userIds?.length) where.userId = { in: userIds }
    const cards = (await this.prisma.memberCard.findMany({
      where,
      orderBy: { updatedAt: 'asc' },
      select: { id: true, userId: true, status: true, startDate: true, endDate: true },
      take: 2000,
    })) as PassRow[]

    let attempts = 0
    for (const card of cards) {
      if (attempts >= BATCH) break
      const intent = passIntent(card, now)
      const fingerprint =
        intent.kind === 'bundle' ? `${intent.validFrom}:${intent.validUntil}` : 'revoke'
      if (this.passSent.get(card.id) === fingerprint || this.waiting(card.userId, now)) {
        result.skipped += 1
        continue
      }
      attempts += 1
      try {
        if (intent.kind === 'bundle') {
          const res = await this.brand.bundlePass(card.userId, {
            passRef: card.id,
            validFrom: intent.validFrom,
            validUntil: intent.validUntil,
          })
          if (!res?.replayed) result.bundled += 1
        } else {
          await this.brand.revokeBundle(card.userId, card.id, '畅练卡退款或失效')
          result.revoked += 1
        }
        this.passSent.set(card.id, fingerprint)
        this.backoff.delete(card.userId)
        this.perks.forget(card.userId)
      } catch (error) {
        const code = this.errorCode(error)
        if (intent.kind === 'revoke' && code === 'CARD_NOT_FOUND') {
          // 从未附赠过，无需撤销。
          this.passSent.set(card.id, fingerprint)
          result.skipped += 1
          continue
        }
        if (code === 'MEMBER_NOT_FOUND') result.missing += 1
        else result.failed += 1
        if (!this.keepGoing(error, code, card.userId, now, `畅练卡 ${card.id}`)) return false
      }
    }
    const live = new Set(cards.map((card) => card.id))
    for (const id of this.passSent.keys()) if (!live.has(id)) this.passSent.delete(id)
    return true
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
        cardType: true,
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
