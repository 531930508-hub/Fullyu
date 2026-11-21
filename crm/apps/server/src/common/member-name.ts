/** 建会员时的默认名（与 Member.name 的库默认值一致）。 */
export const DEFAULT_MEMBER_NAME = '会员';

/**
 * 各业务端的历史默认昵称与 CRM 自己的占位名形如：
 * 「会员」「会员+后四位」「用户+手机号」「用户+后四位」「茶客」（时叙旧默认名）。
 * 带国际区号落库成「用户+86…」的脏数据也算。它们不是顾客自己起的名字，
 * 只是占位——既不作为「真实昵称」参与展示优先级，也不允许盖掉别的端起好的名字。
 */
const GENERATED_NAME = /^用户\+?\d{4,15}$/;

/** 「会员+手机号后四位」：三端默认昵称的统一形状。 */
export const PHONE_TAIL_NAME = /^会员\d{4}$/;

const LEGACY_DEFAULT_NAMES = new Set(['茶客']);

export function isPlaceholderName(name?: string | null): boolean {
  const value = (name ?? '').trim();
  return (
    !value ||
    value === DEFAULT_MEMBER_NAME ||
    LEGACY_DEFAULT_NAMES.has(value) ||
    PHONE_TAIL_NAME.test(value) ||
    GENERATED_NAME.test(value)
  );
}

/**
 * 占位名的信息量，用来「只升不降」地收敛各端昵称：
 * 真名 3 > 会员+后四位 2 > 用户+号 1 > 会员 / 茶客 / 空 0。
 * 各端默认名形状不同，谁的信息更多就留谁，避免最后一个登录的端把好名字冲掉。
 */
export function nameRank(name?: string | null): number {
  const value = (name ?? '').trim();
  if (!value) return 0;
  if (!isPlaceholderName(value)) return 3;
  if (PHONE_TAIL_NAME.test(value)) return 2;
  if (GENERATED_NAME.test(value)) return 1;
  return 0;
}

/** 取手机号后四位；兼容 +86、空格、横线与括号（823 等非法号码取不到就返回 null）。 */
export function phoneTail(phone?: string | null): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** 占位场景下的默认名：能取到手机号后四位就用「会员+后四位」，否则退回「会员」。 */
export function placeholderMemberName(phone?: string | null): string {
  const tail = phoneTail(phone);
  return tail ? `${DEFAULT_MEMBER_NAME}${tail}` : DEFAULT_MEMBER_NAME;
}