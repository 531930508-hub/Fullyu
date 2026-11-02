import type { MemberBenefit, MemberProvider } from '../../contracts';

/**
 * 内置会员校验：按会员码格式识别年会员，不查任何会员库。
 * 真实实现接会员中心 / 第三方用户中心，凭会员码换取权益（折扣、等级）。
 */
export class MockMemberProvider implements MemberProvider {
  readonly name = 'mock-member';
  readonly mode = 'mock';

  async verify(code: string): Promise<MemberBenefit | null> {
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^TH-[A-Z0-9-]{4,}$/.test(normalized)) return null;
    return { code: normalized, tier: 'annual', discountPerCupCents: 200, name: '时叙年会员' };
  }
}
