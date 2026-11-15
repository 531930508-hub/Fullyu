import { Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { BrandMemberClient, type BrandCardView } from './brand-member.client';

/** 只有年卡授予时叙每杯立减资格；月卡等其他产品一律按普通会员。 */
const ANNUAL_PRODUCT_CODE = 'FY_ANNUAL';
/** CRM 卡状态里仍可享受权益的两种；PENDING/EXPIRED/REFUND_LOCKED 都不算。 */
const ACTIVE_CARD_STATES = new Set(['ACTIVE', 'EXPIRING']);
/** 本地快照有效期：CRM 改卡/退款后最迟 5 分钟生效。 */
export const MEMBERSHIP_TTL_MS = 5 * 60_000;

export type MembershipCustomer = {
  id: string;
  memberTier?: string | null;
  memberUntil?: Date | null;
  crmCardState?: string | null;
  memberSyncedAt?: Date | null;
};

export type MembershipSnapshot = {
  memberTier: 'annual' | 'standard';
  memberUntil: Date | null;
  crmCardState: string;
};

/**
 * 把 CRM 主卡折算成本地会籍：年卡且仍在有效期内才算 annual；
 * validUntil 缺失时按 CRM 判定（卡状态本身已含有效期）。
 */
export function membershipFromCard(
  card: BrandCardView | null | undefined,
  now = Date.now()
): MembershipSnapshot {
  const validUntil = card?.validUntil ? new Date(card.validUntil) : null;
  const usable = Boolean(
    card &&
      card.productCode === ANNUAL_PRODUCT_CODE &&
      ACTIVE_CARD_STATES.has(card.state) &&
      (!validUntil || validUntil.getTime() > now)
  );
  return {
    memberTier: usable ? 'annual' : 'standard',
    memberUntil: usable ? validUntil : null,
    crmCardState: card?.state ?? 'NONE'
  };
}

/**
 * 会籍快照刷新（CRM 品牌卡为唯一事实源）。
 *
 * - CRM 未接入：保持本地维护的 memberTier/memberUntil，行为与接入前一致；
 * - CRM 可用：5 分钟 TTL 内直接用本地快照，过期才回源，回源后写回 customers 行；
 * - CRM 明确回 MEMBER_NOT_FOUND：说明身份已注销或卡已解除绑定，落回 standard，
 *   避免旧年卡快照无限续命；
 * - CRM 其他失败：沿用上一次快照（宁可按旧会籍），只记日志并按 TTL 退避重试，
 *   绝不把已有年卡顾客重置成 standard。
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger('Membership');

  constructor(
    private readonly prisma: PrismaService,
    private readonly brand: BrandMemberClient
  ) {}

  async refresh<T extends MembershipCustomer>(customer: T): Promise<T> {
    if (!this.brand.enabled) return customer;
    const syncedAt = customer.memberSyncedAt?.getTime() ?? 0;
    if (Date.now() - syncedAt < MEMBERSHIP_TTL_MS) return customer;
    try {
      const payload = await this.brand.me(customer.id);
      return await this.persist(customer, membershipFromCard(payload.card));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'MEMBER_NOT_FOUND') {
        return this.persist(customer, membershipFromCard(null));
      }
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `CRM 会籍刷新失败，沿用本地快照（${customer.memberTier ?? 'standard'}）：${reason}`
      );
      return this.markSynced(customer);
    }
  }

  private async persist<T extends MembershipCustomer>(
    customer: T,
    snapshot: MembershipSnapshot
  ): Promise<T> {
    const syncedAt = new Date();
    const data = {
      memberTier: snapshot.memberTier,
      memberUntil: snapshot.memberUntil,
      crmCardState: snapshot.crmCardState,
      memberSyncedAt: syncedAt
    };
    await this.prisma.customer.update({ where: { id: customer.id }, data });
    return { ...customer, ...data };
  }

  /** 失败时也推进时间戳，避免每个请求都打一次已经异常的 CRM。 */
  private async markSynced<T extends MembershipCustomer>(customer: T): Promise<T> {
    const memberSyncedAt = new Date();
    await this.prisma.customer
      .update({ where: { id: customer.id }, data: { memberSyncedAt } })
      .catch(() => undefined);
    return { ...customer, memberSyncedAt };
  }
}