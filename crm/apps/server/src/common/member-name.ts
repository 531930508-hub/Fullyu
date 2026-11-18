/** 建会员时的默认名（与 Member.name 的库默认值一致）。 */
export const DEFAULT_MEMBER_NAME = '会员';

/**
 * 各业务端的历史默认昵称：在场是「用户+手机号后四位」，轻疗旧版是「用户+手机号」，
 * 还有带国际区号落库成「用户+86…」的脏数据（CRM 线上 745 条）。
 * 它们不是顾客自己起的名字，只是占位——既不作为「真实昵称」参与展示优先级，
 * 也不允许盖掉别的端起好的名字。
 */
const GENERATED_NAME = /^用户\+?\d{4,15}$/;

export function isPlaceholderName(name?: string | null): boolean {
  const value = (name ?? '').trim();
  return !value || value === DEFAULT_MEMBER_NAME || GENERATED_NAME.test(value);
}
