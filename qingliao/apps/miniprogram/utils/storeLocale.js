import { t, useLocale } from './locale'

/**
 * 门店名称/地址的双语取词。
 *
 * 门店是业务数据，不进词典：后台「门店管理」可填英文店名、英文简址、英文地址，
 * 接口返回 nameEn / addressEn / shortAddressEn。这里按当前语言挑选，
 * 英文缺失一律回退中文——宁可英文界面里出现中文门店名，也不要整块空白。
 *
 * 页面里必须做成方法调用（storeName(item)）而不是计算属性：
 * t 之外还要读 lang.value，切语言后模板才会重新求值。
 */
const { lang } = useLocale()

const pick = (zh, en) => {
	const english = typeof en === 'string' ? en.trim() : ''
	return lang.value === 'en' && english ? english : zh || ''
}

export function storeName(shop) {
	if (!shop) return ''
	return pick(shop.name, shop.nameEn)
}

export function storeAddress(shop) {
	if (!shop) return ''
	return pick(shop.address, shop.addressEn)
}

/** 简要地址（楼层/柜台）：英文优先 shortAddressEn，再退 addressEn，最后才是中文 */
export function storeShortAddress(shop) {
	if (!shop) return ''
	if (lang.value === 'en') {
		const short = typeof shop.shortAddressEn === 'string' ? shop.shortAddressEn.trim() : ''
		if (short) return short
		const address = typeof shop.addressEn === 'string' ? shop.addressEn.trim() : ''
		if (address) return address
	}
	return shop.shortAddress || shop.address || ''
}

/** 英文模式下是否真的有多语言门店名（后台没填时用于避免展示重复信息） */
export function hasStoreEnglish(shop) {
	if (!shop) return false
	return !!(shop.nameEn || shop.addressEn || shop.shortAddressEn)
}

/** 门店名 + t 兜底：历史门店没填英文时，直接用中文名，不拼接额外文案 */
export function storeLabel(shop) {
	return storeName(shop) || t('门店')
}