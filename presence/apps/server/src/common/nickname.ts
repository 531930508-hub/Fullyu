import { randomInt } from 'node:crypto'

/**
 * 默认昵称：「用户」+ 手机号后四位（如 用户7229）。
 *
 * 2026-11-12 曾为「去手机号化」改成「中文词+4位数字」，店员/教练在会员列表、
 * 预约、排班里认不出是谁；2026-11-21 业务确认改回带后四位，与轻疗
 * `NicknameGenerator.defaultNickname` 同一口径。
 *
 * 取舍：后四位属于可识别信息（社区帖子、排班都会展示），昵称也不保证唯一；
 * 检索仍以手机号为准。手机号末尾不是四位数字时退回随机词昵称。
 */
export const DEFAULT_NICKNAME_PREFIX = '用户'

/**
 * 退化词库：只有手机号取不到后四位时才用「中文词+4位数字」（导师建号等兜底场景）。
 * 与轻疗 `NicknameGenerator.WORDS` 保持一致（顺序无关，内容需同步）。
 */
export const NICKNAME_WORDS = [
  '青竹', '小鹿', '山茶', '听雨', '清风', '暖阳', '星河', '云舒',
  '竹影', '白露', '南风', '微光', '远山', '清溪', '素衣', '知夏',
  '朝颜', '望舒', '扶摇', '云杉', '青禾', '木棉', '晚舟', '月白',
  '归羽', '拾光', '初雪', '轻岚', '溪午', '春信', '秋野', '松间',
  '兰屿', '竹溪', '小满', '惊蛰', '谷雨', '白霜', '星野', '云栖',
  '沐阳', '浅溪', '青柠', '半山', '长夏', '静水', '浮生', '疏影',
] as const

/** 新建会员的默认昵称：手机号后四位；取不到后四位时退回随机昵称。 */
export function defaultNickname(phone: string | null | undefined): string {
  const tail = phoneTail(phone)
  return tail ? `${DEFAULT_NICKNAME_PREFIX}${tail}` : randomNickname()
}

/** 手机号末尾四位数字；末尾不是四位数字（含空、脏号）返回 null。 */
export function phoneTail(phone: string | null | undefined): string | null {
  if (!phone) return null
  const matched = /(\d{4})$/.exec(String(phone).trim())
  return matched ? matched[1] : null
}

/** 随机昵称：词库随机取一词 + 4位数字（兜底用，不用于新会员）。 */
export function randomNickname(): string {
  const word = NICKNAME_WORDS[randomInt(NICKNAME_WORDS.length)]
  return `${word}${String(randomInt(10000)).padStart(4, '0')}`
}
