import {
  DEFAULT_MEMBER_NAME,
  defaultMemberName,
  isPlaceholderName,
  nameRank
} from './member-name';

/**
 * 昵称口径必须与 CRM 主档一致（crm/apps/server/src/common/member-name.ts）：
 * 占位名只是没名字，真实昵称永远压过占位名；占位名之间按信息量只升不降。
 */
describe('会员昵称口径', () => {
  it('默认昵称 = 会员 + 手机号后四位，号码取不到四位时退回「会员」', () => {
    expect(defaultMemberName('13800138000')).toBe('会员8000');
    expect(defaultMemberName('+86 138-0013-8000')).toBe('会员8000');
    expect(defaultMemberName('+33688507996')).toBe('会员7996');
    expect(defaultMemberName('823')).toBe(DEFAULT_MEMBER_NAME);
    expect(defaultMemberName(null)).toBe(DEFAULT_MEMBER_NAME);
  });

  it('占位名：空、会员、会员+后四位、用户+号、茶客', () => {
    for (const value of ['', '  ', '会员', '会员7229', '用户7229', '用户13700007777', '用户+8613800005577', '茶客']) {
      expect(isPlaceholderName(value)).toBe(true);
    }
    for (const value of ['小鹿4821', '青竹7229', '林小满', '会员72290', '会员722']) {
      expect(isPlaceholderName(value)).toBe(false);
    }
  });

  it('占位名信息量：真名 3 > 会员+后四位 2 > 用户+号 1 > 其余占位 0', () => {
    expect(nameRank('林小满')).toBe(3);
    expect(nameRank('会员7229')).toBe(2);
    expect(nameRank('用户7229')).toBe(1);
    expect(nameRank('用户13700007777')).toBe(1);
    expect(nameRank('会员')).toBe(0);
    expect(nameRank('茶客')).toBe(0);
    expect(nameRank(null)).toBe(0);
  });
});