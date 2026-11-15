import { ref } from 'vue'
import dict from './i18n.dict'

/**
 * 轻疗顾客端全局双语。
 *
 * 语言入口只在首页（胶囊下方），但语言状态是全局的：模块级 ref + storage，
 * 任何页面通过 t('中文') / tt('中文','英文') 取词，切换后已挂载页面即时重渲染。
 * t 在渲染期读取 locale.value，因此模板里调用即天然建立依赖。
 */
export const LOCALE_KEY = 'fullyu.lightheal.locale'

const locale = ref('zh')

export function readLocale() {
	try {
		const stored = uni.getStorageSync(LOCALE_KEY)
		locale.value = stored === 'en' ? 'en' : 'zh'
	} catch (error) {
		locale.value = 'zh'
	}
	return locale.value
}

export function setLocale(next) {
	locale.value = next === 'en' ? 'en' : 'zh'
	try {
		uni.setStorageSync(LOCALE_KEY, locale.value)
	} catch (error) {
		// 本地存储失败时仅本次会话生效
	}
	return locale.value
}

/**
 * 词典翻译：中文原文 → 英文。
 * 词典缺失时原样返回中文，保证英文模式下不漏字、不出现空文案。
 */
export function t(zh) {
	if (locale.value !== 'en' || !zh) {
		return zh
	}
	/**
	 * 用 hasOwnProperty 判断而不是 `dict[zh] || zh`：价格片段、单位这类 key
	 * 的英文就是空串（「元」在英文里不该出现），用 || 会被当成缺失回退中文。
	 */
	return Object.prototype.hasOwnProperty.call(dict, zh) ? dict[zh] : zh
}

/**
 * 原生导航栏（非自定义 navigationStyle）的标题只能运行时调用 setNavigationBarTitle，
 * 这里按路由登记中文标题，切语言与页面 onShow 时统一刷新，避免英文模式下残留中文标题。
 */
const NAV_TITLES = {
	'pages/login/login': '登录',
	'pages/mall/mall': 'Full愈商城',
	'pages/mall/gift': '礼物接收',
	'pages/index/booking': '智能预约',
	'pages/index/shop/shop': '推荐门店',
	'pages/user/about': '关于',
	'pages/user/lottery': '抽积分',
	'pages/user/invitation-reward': '推荐有礼',
	'pages/user/redeem-coupons': '礼品卡兑换',
	'pages/user/profile/profile': '个人资料',
	'pages/user/brand-member/stories': '会员故事',
	'pages/user/brand-member/game': '愈行之旅',
	'pages/user/brand-member/rules': '会员权益与规则'
}

/** 路由 → 中文标题；埋点里也用这份映射，保证看板标题和导航栏一致 */
export function routeTitle(route) {
	return (route && NAV_TITLES[route]) || ''
}

/** 按当前页面路由重设原生标题；自定义导航的页面没有登记，直接跳过。 */
export function syncNavTitle() {
	let route = ''
	try {
		const pages = getCurrentPages()
		const current = pages[pages.length - 1]
		route = current && (current.route || current.$page && current.$page.route)
	} catch (error) {
		return
	}
	const zh = route && NAV_TITLES[route]
	if (!zh) {
		return
	}
	try {
		uni.setNavigationBarTitle({ title: t(zh) })
	} catch (error) {
		// 个别基础库不支持时忽略，标题保持默认
	}
}

export function useLocale() {
	const tt = (zh, en) => (locale.value === 'en' ? (en || zh) : zh)
	/**
	 * lang 必须是同一个 locale ref 的别名：页面按 `const { lang } = useLocale()`
	 * 解构，模板里 lang 自动解包、脚本里 lang.value 判断；曾因这里漏返回 lang，
	 * 品牌会员页在有会员数据时渲染业态简称直接抛 TypeError，整页卡在加载帧。
	 */
	return {
		lang: locale,
		locale,
		tt,
		t,
		toggleLocale: () => setLocale(locale.value === 'en' ? 'zh' : 'en'),
		syncLocale: readLocale,
		syncNavTitle
	}
}

// 首次导入时读一次，页面不必等到 onShow 才有正确语言。
readLocale()