/**
 * 品牌会员卡目录的展示口径 · 轻疗。
 *
 * 卡名、价格、卡期、权益说明与提前价折扣全部由服务端 `/brandMember/products`
 * （CRM 定价 + 结算同源折扣）下发，这里只做归一化与文案格式化。
 * 页面里出现任何写死的金额、天数或折扣都视为回归：一旦 CRM 调价，
 * 页面上写的数就会和实际扣款不一致。
 */

/** CRM 目录里的默认档编码（大会员）；只在「哪张卡默认选中」这一处兜底，不承载价格。 */
export const DEFAULT_PRODUCT_CODE = 'FY_ANNUAL'

export function toNumber(value) {
	if (value === null || value === undefined || value === '') return null
	const num = Number(value)
	return Number.isFinite(num) ? num : null
}

function trimNumber(value) {
	if (!Number.isFinite(value)) return ''
	return Number(value.toFixed(2)).toString()
}

export function formatYuan(cents) {
	const value = Number(cents || 0) / 100
	return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function normalizeProduct(row) {
	if (!row || !row.code) return null
	return {
		code: String(row.code),
		name: row.name ? String(row.name) : '',
		priceCents: toNumber(row.priceCents),
		validDays: toNumber(row.validDays),
		advanceRate: toNumber(row.advanceRate),
		advanceDiscountText: row.advanceDiscountText ? String(row.advanceDiscountText) : ''
	}
}

export function normalizeProducts(rows) {
	return (Array.isArray(rows) ? rows : []).map(normalizeProduct).filter(Boolean)
}

/**
 * 目录归一化：服务端可能返回 {products, defaultProductCode}，mock 只给数组。
 * 默认选中卡型优先读服务端，缺失时用大会员档/第一张兜底。
 */
export function normalizeCatalog(payload) {
	const rows = Array.isArray(payload) ? payload : ((payload && payload.products) || [])
	const products = normalizeProducts(rows)
	const wanted = (payload && payload.defaultProductCode) || ''
	return {
		products,
		defaultProductCode: findProduct(products, wanted) ? wanted : defaultProductCodeOf(products)
	}
}

export function findProduct(products, code) {
	if (!code) return null
	return (Array.isArray(products) ? products : []).find((item) => item && item.code === code) || null
}

export function defaultProductCodeOf(products) {
	const list = Array.isArray(products) ? products : []
	const annual = findProduct(list, DEFAULT_PRODUCT_CODE)
	if (annual) return annual.code
	return list[0] ? list[0].code : ''
}

export function defaultProduct(products) {
	return findProduct(products, defaultProductCodeOf(products))
}

/** 卡片售价，未拿到目录时返回空串（页面显示占位，不猜金额）。 */
export function priceLabel(product) {
	if (!product) return ''
	const cents = toNumber(product.priceCents)
	return cents === null ? '' : `¥${formatYuan(cents)}`
}

/**
 * 折扣文案：中文直接用服务端下发的「7.5 折」；英文按折扣率换算成「25% off」。
 * 没有折扣率时返回空串，页面隐藏该行。
 */
export function discountText(product, locale) {
	if (!product) return ''
	const rate = toNumber(product.advanceRate)
	if (locale === 'en') {
		if (rate === null) return ''
		return `${trimNumber(Math.round((1 - rate) * 1000) / 10)}% off`
	}
	if (product.advanceDiscountText) return product.advanceDiscountText
	if (rate === null) return ''
	return `${trimNumber(Math.round(rate * 1000) / 100)} 折`
}