import { randomInt } from 'node:crypto'

/**
 * 默认昵称：中文词 + 4 位数字（如 青竹4821），与手机号无关。
 *
 * 历史做法是「用户+手机号后四位」，等于把手机号片段展示在会员中心、
 * 预约、排班等所有出现昵称的地方，属于变相保留手机号。
 *
 * 词库与轻疗 `NicknameGenerator.java` 保持一致（顺序无关，内容需同步）。
 */
export const NICKNAME_WORDS = [
  '青竹', '小鹿', '山茶', '听雨', '清风', '暖阳', '星河', '云舒',
  '竹影', '白露', '南风', '微光', '远山', '清溪', '素衣', '知夏',
  '朝颜', '望舒', '扶摇', '云杉', '青禾', '木棉', '晚舟', '月白',
  '归羽', '拾光', '初雪', '轻岚', '溪午', '春信', '秋野', '松间',
  '兰屿', '竹溪', '小满', '惊蛰', '谷雨', '白霜', '星野', '云栖',
  '沐阳', '浅溪', '青柠', '半山', '长夏', '静水', '浮生', '疏影',
] as const

export function randomNickname(): string {
  const word = NICKNAME_WORDS[randomInt(NICKNAME_WORDS.length)]
  return `${word}${String(randomInt(10000)).padStart(4, '0')}`
}
