import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BrandMemberClient } from './brand-member.client';

/** CRM 卡态同步的新鲜度：超过这个时间就再拉一次，门店不为此阻塞太久。 */
const SYNC_TTL_MS = 5 * 60_000;

export type CachedMembership = {
  memberTier: string;
  memberUntil: Date | null;
  discountPerCupCents: number;
  crmCardState: string | null;
  memberSyncedAt: Date | null;
};

/**
 * 会籍缓存：CRM 品牌卡是唯一事实源，本地 customers 表只是最近一次同步的快照。
 *
 * 为什么不实时校验：门店代点/结账是热点路径，CRM 抖动不能把折扣打没；
 * 同步失败时保留上一份缓存（有过年卡就继续按年卡算，到期后本地判失效）。
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger('MembershipService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly brand: BrandMemberClient
  ) {}

  get enabled(): boolean {
    return this.brand.enabled;
  }

  /** 展示用来源标签：健康页与门店状态都读它，避免再出现"mock 会员"的误读。 */
  get sourceLabel(): string {
    return this.brand.enabled ? 'crm' : 'local';
  }

  /**
   * 拉一次 CRM 卡态并写回缓存。CRM 不可用时返回 false 且不改动缓存，
   * 调用方自行决定是报错还是沿用旧值。
   */
  async syncCustomer(customerId: string): Promise<boolean> {
    if (!this.brand.enabled) return false;
    try {
      const payload = await this.brand.me(customerId);
      const card = payload.card;
      const active = card && (card.state === 'ACTIVE' || card.state === 'EXPIRING');
      await this.prisma.customer.update({
        where: { id: customerId },
        data: {
          memberTier: active ? 'annual' : 'standard',
          memberUntil: active && card?.validUntil ? endOfShanghaiDay(card.validUntil) : null,
          discountPerCupCents: active ? Math.max(0, card?.discountPerCupCents ?? 0) : 0,
          crmCardState: card?.state ?? 'NONE',
          memberSyncedAt: new Date()
        }
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `会籍同步失败，沿用缓存：customer=${customerId} ${error instanceof Error ? error.message : ''}`
      );
      return false;
    }
  }

  /** 按新鲜度决定要不要同步；返回最新的顾客行（同步失败时是旧行）。 */
  async refreshIfStale<T extends { id: string; memberSyncedAt?: Date | null }>(
    customer: T
  ): Promise<T> {
    if (!this.brand.enabled) return customer;
    const syncedAt = customer.memberSyncedAt?.getTime() ?? 0;
    if (Date.now() - syncedAt < SYNC_TTL_MS) return customer;
    const ok = await this.syncCustomer(customer.id);
    if (!ok) return customer;
    const fresh = await this.prisma.customer.findUnique({ where: { id: customer.id } });
    return (fresh as T | null) ?? customer;
  }
}

/** CRM 下发的是上海日期（YYYY-MM-DD），到期时刻取当天 23:59:59.999+08:00。 */
function endOfShanghaiDay(date: string): Date {
  return new Date(`${date}T23:59:59.999+08:00`);
}