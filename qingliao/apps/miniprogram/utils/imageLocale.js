import { img as optimizeImage } from './image'
import { useLocale } from './locale'

// 英文图托管在 OSS：本地打进去 3.1MB，微信主包上限 2MB。
// 源文件见 git 历史，OSS 路径 oss://fullytherapy/fully/icon/i18n/en/
const EN_ASSETS = 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/i18n/en/'

export const englishImages = {
  'fully/icon/v2.0/headdetail.jpg': EN_ASSETS + 'head-detail-v1.jpg',
  'fully/icon/v2.0/bodydetail.jpg': EN_ASSETS + 'body-detail-v1.jpg',
  'fully/icon/v2.0/headnew.jpg': EN_ASSETS + 'head-card-v1.jpg',
  'fully/icon/v2.0/bodynew.jpg': EN_ASSETS + 'body-card-v1.jpg',
  'fully/icon/Frame90.png': EN_ASSETS + 'home-book-v1.png',
  'fully/icon/Frame901.png': EN_ASSETS + 'home-gift-v3.png',
  'fully/icon/v2.0/frame6.png': EN_ASSETS + 'nature-card-v1.jpg',
  'fully/icon/v2.0/fullnature.png': EN_ASSETS + 'nature-title-v1.png',
  'fully/icon/v2.0/enterprisecode.jpg': EN_ASSETS + 'enterprise-v1.jpg',
  'fully/icon/icon0701/draw-button.png': EN_ASSETS + 'lottery-draw-v1.png',
  'fully/file/miniImage/20260409/a4e460f6-968b-46d3-9317-896d739a02ba(._.)banner1 (1).png': EN_ASSETS + 'banner-v2.jpg',
  'fully/file/miniImage/20260424/9c9c96d3-d356-469d-8acb-945a201add89(._.)放松有道 (2).jpg': EN_ASSETS + 'splash-v1.jpg',
  'fully/file/miniImage/20260424/fa3e48c3-4004-4f3a-8d66-2c783ab2e932(._.)1 (1).png': EN_ASSETS + 'coupon-1-v1.jpg',
  'fully/file/miniImage/20260425/1cf66f6f-6ff2-41c2-a1fd-e12035e0c1d4(._.)微信图片_20260425180322_411_179.jpg': EN_ASSETS + 'coupon-2-v1.jpg',
  'fully/file/miniImage/20260424/ea58389a-8527-43cf-ab13-cab321becffd(._.)1 (2).png': EN_ASSETS + 'coupon-3-v1.jpg',
  'fully/file/miniImage/20260425/eb8160c3-b821-446b-a980-d90b85a2aa21(._.)微信图片_20260425180334_413_179.jpg': EN_ASSETS + 'coupon-4-v1.jpg',
  'fully/file/miniImage/20260424/00feb17b-5869-4f7d-a1b6-f45658de1b52(._.)1 (3).png': EN_ASSETS + 'coupon-5-v1.jpg',
  'fully/file/miniImage/20260425/27d7144e-ddd9-40fd-88ae-bddaafa45f3e(._.)微信图片_20260425180328_412_179.jpg': EN_ASSETS + 'coupon-6-v1.jpg',
  '/static/icons/lottery/lottery-title.png': EN_ASSETS + 'lottery-title-v1.png',
  '/static/icons/lottery/points-info.png': EN_ASSETS + 'points-info-v2.png',
  '/static/icons/lottery/prize-1.png': EN_ASSETS + 'prize-1-v1.png',
  '/static/icons/lottery/prize-1-highlight.png': EN_ASSETS + 'prize-1-highlight-v1.png',
  '/static/icons/lottery/prize-3.png': EN_ASSETS + 'prize-3-v1.png',
  '/static/icons/lottery/prize-3-highlight.png': EN_ASSETS + 'prize-3-highlight-v1.png',
  '/static/icons/lottery/prize-6.png': EN_ASSETS + 'prize-6-v1.png',
  '/static/icons/lottery/prize-6-highlight.png': EN_ASSETS + 'prize-6-highlight-v1.png',
  '/static/icons/lottery/prize-10.png': EN_ASSETS + 'prize-10-v1.png',
  '/static/icons/lottery/prize-10-highlight.png': EN_ASSETS + 'prize-10-highlight-v1.png',
  '/static/icons/lottery/thank-you.png': EN_ASSETS + 'thank-you-v1.png',
  '/static/icons/lottery/thank-you-highlight.png': EN_ASSETS + 'thank-you-highlight-v1.png'
}

export function img(url, width = 750, quality = 80) {
  const optimized = optimizeImage(url, width, quality)
  if (useLocale().lang.value !== 'en' || !optimized) return optimized
  const origin = 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/'
  const normalized = optimized.replace(/^http:\/\//, 'https://')
  if (!normalized.startsWith(origin) && !normalized.startsWith('/static/')) return optimized
  let key = normalized.startsWith(origin) ? normalized.slice(origin.length) : normalized
  key = key.split('?')[0].split('#')[0]
  try {
    key = decodeURIComponent(key)
  } catch (error) {
    return optimized
  }
  return englishImages[key] || optimized
}
