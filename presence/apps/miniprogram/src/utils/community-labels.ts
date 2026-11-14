import { isEnglish, tr } from '@/locale'
import { dictText, DICT_COMMUNITY_CATEGORY, DICT_COMMUNITY_TAG } from '@/utils/dict'

/**
 * 小程序旧版创建页写死过带 SDG 前缀的标签值，历史社群数据里仍有这几个。
 * 值集里只维护去前缀后的正式值，这里仅补齐它们的英文，避免老社群英文界面显示中文。
 */
const LEGACY_TAG_EN: Record<string, string> = {
  'SDG 3 良好健康': 'SDG 3 Good health',
  'SDG 4 优质教育': 'SDG 4 Quality education',
  'SDG 12 责任消费': 'SDG 12 Responsible consumption',
}

/**
 * 社群标签展示文案：取值集 community_tag 的 label / labelEn。
 * 未收录（如运营已下线该标签）时按原值展示，避免历史社群显示空白。
 */
export function communityTagLabel(tag: string): string {
  if (isEnglish() && LEGACY_TAG_EN[tag]) return LEGACY_TAG_EN[tag]
  return dictText(DICT_COMMUNITY_TAG, tag)
}

/**
 * 社群分类展示文案：取值集 community_category 的 label / labelEn。
 * 「全部」是筛选条的前端哨兵值，不在值集里，单独给中英文。
 */
export function communityCategoryLabel(value: string): string {
  if (value === '全部') return tr('全部', 'All')
  return dictText(DICT_COMMUNITY_CATEGORY, value)
}