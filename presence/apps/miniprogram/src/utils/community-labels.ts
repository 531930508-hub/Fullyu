import { isEnglish } from '@/locale'

/** 固定标签的中英映射；后台自定义标签按原样展示。 */
const TAG_EN: Record<string, string> = {
  'SDG 3 良好健康': 'SDG 3 Good health',
  'SDG 4 优质教育': 'SDG 4 Quality education',
  'SDG 12 责任消费': 'SDG 12 Responsible consumption',
  身心疗愈: 'Mind-body healing',
  身体疗愈: 'Body healing',
  复愈特色: 'Recovery practice',
  职业成长: 'Career growth',
  轻户外: 'Light outdoor',
}

export function communityTagLabel(tag: string): string {
  return isEnglish() ? TAG_EN[tag] || tag : tag
}
