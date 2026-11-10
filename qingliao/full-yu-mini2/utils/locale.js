import { ref } from 'vue'

/**
 * 轻疗顾客端页面级双语。
 *
 * 语言开关在「我的」与品牌会员页；其它页面进入时从 storage 读一次，
 * 回到前台时再同步，保证切了语言后各页展示一致。模块级 ref 让同页共享状态。
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

export function useLocale() {
	const tt = (zh, en) => (locale.value === 'en' ? (en || zh) : zh)
	return { locale, tt, toggleLocale: () => setLocale(locale.value === 'en' ? 'zh' : 'en'), syncLocale: readLocale }
}

// 首次导入时读一次，页面不必等到 onShow 才有正确语言。
readLocale()