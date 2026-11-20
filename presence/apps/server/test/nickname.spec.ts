import { DEFAULT_NICKNAME_PREFIX, defaultNickname, NICKNAME_WORDS, phoneTail, randomNickname } from '../src/common/nickname'

/**
 * 默认昵称口径：「用户」+ 手机号后四位（如 用户7229），与轻疗 NicknameGenerator.defaultNickname 一致。
 *
 * 2026-11-12 曾改成随机词（去手机号化），2026-11-21 业务确认改回带后四位（教练/店员要靠它认人）。
 * 这里守住：只带四位数字、不出现完整号码；随机词昵称退化为兜底（脏手机号、导师建号）。
 */
describe('defaultNickname', () => {
  it('取手机号后四位，支持国际号与首尾空格', () => {
    expect(defaultNickname('13817901671')).toBe('用户1671')
    expect(defaultNickname('+33688507996')).toBe('用户7996')
    expect(defaultNickname('0031622462184')).toBe('用户2184')
    expect(defaultNickname(' 16685326745 ')).toBe('用户6745')
    expect(defaultNickname('16685326745')).toMatch(new RegExp(`^${DEFAULT_NICKNAME_PREFIX}\\d{4}$`))
  })

  it('末尾不是四位数字的脏号退回随机词昵称，不会生成「用户朱」', () => {
    expect(phoneTail('朱')).toBeNull()
    expect(phoneTail('852')).toBeNull()
    expect(phoneTail('18962990981朱')).toBeNull()
    expect(phoneTail('')).toBeNull()
    expect(phoneTail(null)).toBeNull()
    for (const phone of ['朱', '852', '18962990981朱', '', null]) {
      expect(defaultNickname(phone)).toMatch(/^[\u4e00-\u9fa5]{2}\d{4}$/)
      expect(defaultNickname(phone).startsWith(DEFAULT_NICKNAME_PREFIX)).toBe(false)
    }
  })

  it('昵称不保留完整手机号', () => {
    const nickname = defaultNickname('13817227229')
    expect(nickname).toBe('用户7229')
    expect(nickname).not.toContain('13817227229')
  })
})

describe('兜底随机昵称', () => {
  it('格式为「两位中文词+四位数字」，且不含手机号片段', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 300; i += 1) {
      const name = randomNickname()
      expect(name).toMatch(/^[\u4e00-\u9fa5]{2}\d{4}$/)
      expect(NICKNAME_WORDS).toContain(name.slice(0, 2))
      seen.add(name)
    }
    // 随机性：300 次至少出现 100 种不同昵称（48 词 × 10000 数字，碰撞率极低）
    expect(seen.size).toBeGreaterThan(100)
  })

  it('词库与轻疗一致：48 个不重复的两位中文词', () => {
    expect(NICKNAME_WORDS).toHaveLength(48)
    expect(new Set(NICKNAME_WORDS).size).toBe(48)
    for (const word of NICKNAME_WORDS) expect(word).toMatch(/^[\u4e00-\u9fa5]{2}$/)
  })
})
