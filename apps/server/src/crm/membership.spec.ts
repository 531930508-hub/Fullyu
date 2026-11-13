import type { BrandMemberClient, BrandMemberPayload } from './brand-member.client';
import { ApiError } from '../common/errors';
import {
  MembershipService,
  MEMBERSHIP_TTL_MS,
  membershipFromCard
} from './membership.service';

function payload(card: Partial<BrandMemberPayload['card']>): BrandMemberPayload {
  return {
    member: { memberNo: 'M1', name: '测试', phoneMasked: null },
    card: { state: 'NONE', ...card },
    points: { balance: 0, expiring: 0, expireAt: null, spend: {} },
    dice: { balance: 0, station: 0, monthlyEarned: 0 },
    prizes: { pending: 0 },
    savedCents: 0,
    benefits: [],
    businessCards: [],
    game: { enabled: false, dice: 0, url: null },
    updatedAt: new Date().toISOString(),
    stale: false
  };
}

function fakeClient(enabled: boolean, me: () => Promise<BrandMemberPayload>) {
  return { enabled, me: jest.fn(me) } as unknown as BrandMemberClient & { me: jest.Mock };
}

function fakePrisma() {
  return { customer: { update: jest.fn(async () => ({})) } };
}

const future = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

describe('会籍从 CRM 品牌卡折算', () => {
  it('年卡在有效期内 → annual，memberUntil 取卡到期日', () => {
    const until = future();
    expect(
      membershipFromCard({ state: 'ACTIVE', productCode: 'FY_ANNUAL', validUntil: until })
    ).toEqual({ memberTier: 'annual', memberUntil: new Date(until), crmCardState: 'ACTIVE' });
  });

  it('月卡、待激活、已过期都只算 standard', () => {
    expect(membershipFromCard({ state: 'ACTIVE', productCode: 'FY_MONTH' }).memberTier).toBe(
      'standard'
    );
    expect(membershipFromCard({ state: 'PENDING', productCode: 'FY_ANNUAL' }).memberTier).toBe(
      'standard'
    );
    expect(
      membershipFromCard({
        state: 'EXPIRING',
        productCode: 'FY_ANNUAL',
        validUntil: new Date(Date.now() - 1000).toISOString()
      }).memberTier
    ).toBe('standard');
    expect(membershipFromCard({ state: 'NONE' })).toEqual({
      memberTier: 'standard',
      memberUntil: null,
      crmCardState: 'NONE'
    });
  });
});

describe('会籍快照刷新（本地缓存）', () => {
  it('CRM 未接入时不动本地会籍，也不发请求', async () => {
    const brand = fakeClient(false, () => Promise.reject(new Error('不应调用')));
    const service = new MembershipService(fakePrisma() as never, brand);
    const customer = { id: 'c1', memberTier: 'annual' as const };

    await expect(service.refresh(customer)).resolves.toBe(customer);
    expect(brand.me).not.toHaveBeenCalled();
  });

  it('TTL 内直接用快照，不重复回源', async () => {
    const brand = fakeClient(true, () =>
      Promise.resolve(payload({ state: 'ACTIVE', productCode: 'FY_ANNUAL', validUntil: future() }))
    );
    const prisma = fakePrisma();
    const service = new MembershipService(prisma as never, brand);

    const first = await service.refresh({ id: 'c1', memberTier: 'standard' });
    expect(first.memberTier).toBe('annual');
    expect(prisma.customer.update).toHaveBeenCalledTimes(1);

    await service.refresh({ id: 'c1', memberTier: 'annual', memberSyncedAt: new Date() });
    expect(brand.me).toHaveBeenCalledTimes(1);
  });

  it('TTL 过期后回源，卡被退款则落回 standard', async () => {
    const brand = fakeClient(true, () => Promise.resolve(payload({ state: 'NONE' })));
    const prisma = fakePrisma();
    const service = new MembershipService(prisma as never, brand);

    const stale = new Date(Date.now() - MEMBERSHIP_TTL_MS - 1000);
    const next = await service.refresh({
      id: 'c1',
      memberTier: 'annual',
      memberUntil: new Date(future()),
      memberSyncedAt: stale
    });
    expect(next.memberTier).toBe('standard');
    expect(next.memberUntil).toBeNull();
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ memberTier: 'standard', crmCardState: 'NONE' })
    });
  });

  it('CRM 明确回 MEMBER_NOT_FOUND 时落回 standard，不保留旧年卡快照', async () => {
    const brand = fakeClient(true, () =>
      Promise.reject(new ApiError(404, '你的会员档案正在同步', { code: 'MEMBER_NOT_FOUND' }))
    );
    const prisma = fakePrisma();
    const service = new MembershipService(prisma as never, brand);

    const next = await service.refresh({
      id: 'c1',
      memberTier: 'annual',
      memberUntil: new Date(future()),
      memberSyncedAt: new Date(0)
    });
    expect(next.memberTier).toBe('standard');
    expect(next.memberUntil).toBeNull();
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ memberTier: 'standard', crmCardState: 'NONE' })
    });
  });

  it('CRM 异常时沿用上一次快照，只推进同步时间', async () => {
    const brand = fakeClient(true, () => Promise.reject(new Error('CRM down')));
    const prisma = fakePrisma();
    const service = new MembershipService(prisma as never, brand);
    const until = new Date(future());

    const next = await service.refresh({
      id: 'c1',
      memberTier: 'annual',
      memberUntil: until,
      memberSyncedAt: new Date(0)
    });
    expect(next.memberTier).toBe('annual');
    expect(next.memberUntil).toBe(until);
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ memberSyncedAt: expect.any(Date) })
    });
  });
});