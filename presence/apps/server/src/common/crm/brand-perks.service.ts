import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { BusinessException } from '../exceptions/business.exception'
import { BrandMemberClient, type BrandPresencePerks } from './brand-member.client'

/**
 * 品牌会员在在场的权益（会员价 / 候补优先 / 邀请名额）查询。
 *
 * 2026-11-08 会议：优先排位与会员价从畅练卡移到品牌会员；畅练卡本身改为 0 元报课。
 * 品牌会员资格以 CRM 为准，这里只做短缓存：
 * - 60 秒内复用，避免报名链路每次都打 CRM；
 * - CRM 暂不可用时最多沿用 24 小时内的上次结果；
 * - 档案未同步（MEMBER_NOT_FOUND）或 CRM 未开启 = 非会员，不算故障；
 * - 既无缓存又查不到时返回 unknown=true，由调用方决定（报名下单拒绝，询价降级提示）。
 */

export type BrandPerkStatus = {
  perks: BrandPresencePerks | null
  /** CRM 不可用且没有可用缓存：会员资格无法确认 */
  unknown: boolean
}

const FRESH_MS = 60_000
const STALE_MS = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 5000

const NONE: BrandPresencePerks = { prioritySeat: false, tierPrice: false, invitesPerMonth: 0 }

function readPerks(raw: unknown): BrandPresencePerks {
  const presence =
    raw && typeof raw === 'object' ? ((raw as Record<string, unknown>).presence as unknown) : null
  if (!presence || typeof presence !== 'object') return NONE
  const record = presence as Record<string, unknown>
  const invites = Number(record.invitesPerMonth)
  return {
    prioritySeat: record.prioritySeat === true,
    tierPrice: record.tierPrice === true,
    invitesPerMonth: Number.isInteger(invites) && invites > 0 ? invites : 0,
  }
}

export const brandPriceUnknown = () =>
  new BusinessException(
    '会员价暂时无法确认，请稍后重试',
    5035,
    HttpStatus.SERVICE_UNAVAILABLE,
  )

@Injectable()
export class BrandPerksService {
  private readonly logger = new Logger('BrandPerksService')
  private readonly cache = new Map<string, { at: number; perks: BrandPresencePerks | null }>()

  constructor(private readonly client: BrandMemberClient) {}

  async resolve(userId: string, now = Date.now()): Promise<BrandPerkStatus> {
    if (!this.client.enabled || !userId) return { perks: null, unknown: false }
    const hit = this.cache.get(userId)
    if (hit && now - hit.at < FRESH_MS) return { perks: hit.perks, unknown: false }
    try {
      const payload = await this.client.me(userId)
      const state = String(payload.card?.state || '')
      const active = state === 'ACTIVE' || state === 'EXPIRING'
      const perks = active ? readPerks(payload.perks) : null
      this.remember(userId, perks, now)
      return { perks, unknown: false }
    } catch (error) {
      if (error instanceof BusinessException && error.bizCode === 4041) {
        this.remember(userId, null, now)
        return { perks: null, unknown: false }
      }
      if (hit && now - hit.at < STALE_MS) return { perks: hit.perks, unknown: false }
      this.logger.warn(`品牌会员权益暂不可确认（${userId}）`)
      return { perks: null, unknown: true }
    }
  }

  /** 会员身份或卡期刚变化（领码、附赠、退款）时清掉缓存，下次重新查。 */
  forget(userId: string) {
    this.cache.delete(userId)
  }

  private remember(userId: string, perks: BrandPresencePerks | null, at: number) {
    this.cache.delete(userId)
    this.cache.set(userId, { at, perks })
    if (this.cache.size > MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }
}
