/**
 * 会员昵称口径，与 CRM 主档一致（crm/apps/server/src/common/member-name.ts 同规则）。
 *
 * CRM 是资料唯一归档：各端默认昵称形状不一（时叙「茶客」、在场/轻疗「用户+手机号后四位」），
 * 统一按「只升不降」收敛——真名 3 > 会员+后四位 2 > 用户+号 1 > 会员 / 茶客 / 空 0，
 * 谁的信息更多就留谁，避免最后一个登录的端把好名字冲掉。
 */
export const DEFAULT_MEMBER_NAME = '会员';

const USER_TAIL = /^用户\+?\d{4,15}$/;
const MEMBER_TAIL = /^会员\d{4}$/;
const LEGACY_DEFAULT_NAMES = new Set(['茶客']);

export function isPlaceholderName(name?: string | null): boolean {
  const value = (name ?? '').trim();
  return (
    !value ||
    value === DEFAULT_MEMBER_NAME ||
    LEGACY_DEFAULT_NAMES.has(value) ||
    MEMBER_TAIL.test(value) ||
    USER_TAIL.test(value)
  );
}

export function nameRank(name?: string | null): number {
  const value = (name ?? '').trim();
  if (!value) return 0;
  if (!isPlaceholderName(value)) return 3;
  if (MEMBER_TAIL.test(value)) return 2;
  if (USER_TAIL.test(value)) return 1;
  return 0;
}

/**
 * 新建顾客的默认昵称：「会员」+ 手机号后四位；号码取不到四位时退回「会员」。
 * 与 CRM 建档口径一致，顾客第一次进会员中心不会被改成别的形状。
 */
export function defaultMemberName(phone?: string | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 4
    ? `${DEFAULT_MEMBER_NAME}${digits.slice(-4)}`
    : DEFAULT_MEMBER_NAME;
}