import { NICKNAME_WORDS, randomNickname } from '../src/common/nickname'

describe('默认昵称生成', () => {
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
