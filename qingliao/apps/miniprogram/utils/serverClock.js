// 小程序的支付窗口只有 5 分钟（券单 60 秒），时间判断偏几十秒就会变成
// 「支付入口提前消失」或者「服务端已经关单、小程序还让付」。
// 小程序手上能拿来算时间的两个值都不可信：
//   1) Date.now() 是设备时钟：手机偏快就提前判超时，偏慢就延后放行；
//   2) 接口返回的 createTime 是 "yyyy-MM-dd HH:mm:ss" 的服务器本地时间，不带时区，
//      Date.parse 会按「设备时区」解释，设备时区不是服务器时区时误差是整小时级的
//      （游客/改过时区的手机打开首页，未付单会立刻显示超时，或者倒计时多出好几个小时）。
// 这里把两件事一起收口：用 HTTP 响应头 Date 校准设备时钟，按服务器时区解析接口时间。

/** 服务器所在时区（分钟）：后端 createTime 是无时区的服务器本地时间，必须按这个时区解释。东八区 = 480 */
export const SERVER_TIMEZONE_OFFSET_MINUTES = 8 * 60

/**
 * 时钟校准的可信区间：超出这个跨度的响应头基本是缓存/代理上的旧响应，或者设备时间被改坏了，
 * 都宁可不校准也不能把倒计时带偏。
 * 刻意放宽到 7 天：手动改过手机时间（差几小时到几天）才是真正要救的场景，
 * 而偶尔命中的旧 Date 头会在下一个响应到达时被覆盖回去（见下面的重校准规则）。
 */
const MAX_CLOCK_SKEW_MS = 7 * 24 * 60 * 60 * 1000

/** 偏差小于这个值时保留原有校准结果：每个响应都有几百毫秒网络延迟，不设死区倒计时会来回跳 */
const CLOCK_RESYNC_THRESHOLD_MS = 2000

let clockOffsetMs = 0
let calibrated = false

/** 服务器口径的「现在」（毫秒时间戳）。没校准过时等于设备时钟。 */
export const serverNow = () => Date.now() + clockOffsetMs

/** 是否已经用响应头校准过时钟（调试与单测用） */
export const hasServerClock = () => calibrated

/**
 * 用 HTTP 响应头里的 Date 校准设备时钟。
 * 每个响应都会调一次，所以校准必须能自愈：偶尔拿到旧响应头时，
 * 下一个正常响应的偏差必然超过死区，会把偏差纠正回来。
 * @param {string|string[]} dateHeader 响应头 Date 的原始值
 * @returns {boolean} 本次是否真的更新了校准值
 */
export const syncServerClock = (dateHeader) => {
	const raw = Array.isArray(dateHeader) ? dateHeader[0] : dateHeader
	if (!raw) return false
	const serverMs = Date.parse(raw)
	if (!Number.isFinite(serverMs)) return false
	const delta = serverMs - Date.now()
	if (Math.abs(delta) > MAX_CLOCK_SKEW_MS) return false
	// 取整到秒：网络延迟会让 delta 抖动几百毫秒
	const next = Math.round(delta / 1000) * 1000
	if (calibrated && Math.abs(next - clockOffsetMs) < CLOCK_RESYNC_THRESHOLD_MS) return false
	clockOffsetMs = next
	calibrated = true
	return true
}

/**
 * 把接口给的时间解析成绝对时刻（毫秒）。
 * - 数字：原样当作毫秒时间戳
 * - 带 Z / ±hh:mm 的串：按串里的时区解析
 * - "yyyy-MM-dd HH:mm:ss" / "yyyy-MM-ddTHH:mm:ss"：按服务器时区解析（不看设备时区）
 * @returns {number} 毫秒时间戳，无法解析时返回 NaN
 */
export const parseServerTime = (value) => {
	if (value === null || value === undefined || value === '') return NaN
	if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
	const text = String(value).trim()
	if (!text) return NaN
	// 已经带时区信息的时间串：直接按它的时区解析，不能套服务器时区
	if (/[zZ]$/.test(text) || /[+-]\d{2}:?\d{2}$/.test(text)) return Date.parse(text)
	const matched = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text)
	if (!matched) return Date.parse(text.replace(/-/g, '/'))
	const [, year, month, day, hour, minute, second] = matched
	// 先当作 UTC 拼出「服务器墙上的时间」，再减掉时区偏移，得到真实时刻
	const wallClockAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour),
		Number(minute), Number(second || 0))
	return wallClockAsUtc - SERVER_TIMEZONE_OFFSET_MINUTES * 60000
}

/** 单测用：清掉校准状态 */
export const resetServerClock = () => {
	clockOffsetMs = 0
	calibrated = false
}