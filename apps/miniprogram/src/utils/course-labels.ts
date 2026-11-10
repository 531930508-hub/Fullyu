import { isEnglish } from '@/locale'

/**
 * 课程标签（后台自由输入的中文字符串）的中英映射。
 * 后台新增未收录标签时按原样展示，补一行映射即可。
 */
const COURSE_TAG_EN: Record<string, string> = {
  音疗: 'Sound healing',
  瑜伽: 'Yoga',
  芳疗: 'Aromatherapy',
  手作: 'Handcraft',
  正念: 'Mindfulness',
}

/** 社群分类的中英映射（与社群页口径一致，供首页社群卡片复用）。 */
const COMMUNITY_CATEGORY_EN: Record<string, string> = {
  全部: 'All',
  疗愈: 'Healing',
  瑜伽: 'Yoga',
  身心成长: 'Mind-body growth',
  手作: 'Craft',
  健身: 'Fitness',
}

export function courseTagLabel(tag: string): string {
  return isEnglish() ? COURSE_TAG_EN[tag] || tag : tag
}

export function communityCategoryLabel(value: string): string {
  return isEnglish() ? COMMUNITY_CATEGORY_EN[value] || value : value
}
