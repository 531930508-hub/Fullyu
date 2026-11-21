// 首页「连续支付未付订单」的纯逻辑：
// 同一客户在支付超时窗内可能挂着几笔未付单，每笔各自倒计时，
// 首页要把它们按最先超时的顺序排成队列，付完一笔接着付下一笔。
// 页面只负责调接口和开弹框，队列怎么算都收敛在这里，方便单测。
//
// 一条铁律：**能不能付由服务端 state 决定，倒计时只负责显示。**
// 后端取消订单走 RabbitMQ 延迟消息（同一个 TTL 队列里排队，会被队头更长的 TTL 阻塞），
// 还有一条 10 分钟粒度的兜底任务，所以 state 变成「已关闭」经常比倒计时晚几十秒到几分钟；
// 反过来设备时钟/时区偏一点，本地倒计时又会比服务端早结束。
// 以前这里在倒计时归零时把 state 直接改写成 3，于是「还能付的单」被本地时间判死，
// 用户看到支付入口自己消失；而倒计时没走完的已关闭单又照样让人点支付。
// 现在倒计时归零只记一个「窗口结束」的提示，改状态这件事完全交还给接口。

import { parseServerTime, serverNow } from './serverClock'

/** 未支付订单的 state */
export const UNPAID_STATE = 0

/** 后端没给 overTimeSeconds 时的兜底秒数，对齐 NormalConst.ORDER_TIMEOUT_SECONDS */
export const DEFAULT_PAY_WINDOW_SECONDS = 300

/**
 * 这一单的支付超时窗（秒）。优先用后端给订单自己的值，其次兜底。
 * 注意券单的超时窗是 60 秒（NormalConst.COUPON_ORDER_TIMEOUT_SECONDS），
 * 写死 300 会让券单在白等 4 分钟之后才发现订单已经没了。
 */
export const payWindowSeconds = (order, fallbackSeconds = DEFAULT_PAY_WINDOW_SECONDS) => {
	if (!order) return 0
	const own = order.overTimeSeconds
	if (own !== null && own !== undefined && own !== '') {
		const seconds = Number(own)
		if (Number.isFinite(seconds) && seconds > 0) return seconds
	}
	const fallback = Number(fallbackSeconds)
	return Number.isFinite(fallback) && fallback > 0 ? fallback : 0
}

/**
 * 这一单可支付的截止时刻（毫秒时间戳，绝对时间，不含时区）。
 * 一旦算出来就缓存在订单对象上：倒计时每秒重算时不必反复解析时间串，
 * 也不会因为中途换了兜底值而跳变。
 * @returns {number} 毫秒时间戳，算不出来时 NaN
 */
export const payDeadlineMs = (order, fallbackSeconds = DEFAULT_PAY_WINDOW_SECONDS) => {
	if (!order) return NaN
	const cached = Number(order.payDeadlineMs)
	if (Number.isFinite(cached) && cached > 0) return cached
	const createMs = parseServerTime(order.createTime)
	if (!Number.isFinite(createMs)) return NaN
	const limitSeconds = payWindowSeconds(order, fallbackSeconds)
	if (limitSeconds <= 0) return NaN
	return createMs + limitSeconds * 1000
}

/**
 * 按订单的创建时间和支付超时秒数，算出这一单还剩多少秒可支付。
 * @param {object} order 至少包含 createTime / overTimeSeconds 的订单
 * @param {number} fallbackSeconds 后端没给 overTimeSeconds 时的兜底秒数
 * @param {number} nowMs 服务器口径的当前时间（毫秒），便于测试注入
 * @returns {number} 剩余秒数，最小 0
 */
export const unpaidSecondsLeft = (order, fallbackSeconds = DEFAULT_PAY_WINDOW_SECONDS, nowMs = serverNow()) => {
	const deadline = payDeadlineMs(order, fallbackSeconds)
	const now = Number(nowMs)
	if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0
	const left = (deadline - now) / 1000
	return left > 0 ? Math.ceil(left) : 0
}

/**
 * 倒计时里的时钟部分（HH:MM:SS，小时不截断）。
 * 首页卡片、订单列表、支付弹框三个入口都只负责加自己的「倒计时：」前缀，
 * 数字格式统一在这里：以前三处各写一遍补零，改一处漏两处就会漂移出 4:59 和 00:04:59 混用。
 * @param {number} seconds 剩余秒数，负数/非法值按 0
 * @returns {string} 形如 00:04:59
 */
export const formatCountdownClock = (seconds) => {
	const total = Math.max(0, Math.floor(Number(seconds) || 0))
	const pad = (value) => (value < 10 ? '0' + value : String(value))
	return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor((total % 3600) / 60)) + ':' + pad(total % 60)
}

/**
 * 给列表里的未付单挂上截止时刻和剩余秒数（cutdown）。
 * 列表可能是同一数组实例，直接原地写回，保持和原实现一致。
 * @returns {object[]} 原列表
 */
export const applyUnpaidCountdowns = (list, fallbackSeconds = DEFAULT_PAY_WINDOW_SECONDS, nowMs = serverNow()) => {
	(list || []).forEach(order => {
		if (Number(order && order.state) !== UNPAID_STATE) return
		const deadline = payDeadlineMs(order, fallbackSeconds)
		if (Number.isFinite(deadline)) order.payDeadlineMs = deadline
		order.cutdown = unpaidSecondsLeft(order, fallbackSeconds, nowMs)
	})
	return list || []
}

/**
 * 首页待支付队列：本轮还没付过的未付单一律进队列，按截止时刻从早到晚排——先超时的先付。
 * 注意不再按 cutdown > 0 过滤：倒计时归零不代表服务端已经关单，
 * 把这类单留在队列里，用户点支付时再由服务端裁决，总好过入口凭空消失。
 * @param {object[]} orders 订单列表
 * @param {string[]} paidIds 本轮已经付过的订单 id（微信回执异步落库，刚付的单可能还带着未付状态）
 */
export const buildUnpaidQueue = (orders, paidIds = []) => {
	const paid = (paidIds || []).map(id => String(id))
	return (orders || [])
		.filter(order => order &&
			Number(order.state) === UNPAID_STATE &&
			!paid.includes(String(order.id)))
		.sort((a, b) => {
			const deadlineA = payDeadlineMs(a)
			const deadlineB = payDeadlineMs(b)
			const sortA = Number.isFinite(deadlineA) ? deadlineA : Number.MAX_SAFE_INTEGER
			const sortB = Number.isFinite(deadlineB) ? deadlineB : Number.MAX_SAFE_INTEGER
			if (sortA !== sortB) return sortA - sortB
			// 截止时刻都算不出来时退回创建时间，保证顺序稳定
			const createA = String(a.createTime || '')
			const createB = String(b.createTime || '')
			if (createA === createB) return 0
			return createA < createB ? -1 : 1
		})
}

/**
 * 每秒推进一次未付单倒计时。
 * 每次都从截止时刻重算，而不是把上次的值减 1：setInterval 在小程序切后台、锁屏、卡顿时
 * 会被限流甚至整段不触发，靠自减计时会永久落后于真实时间（后台待几分钟回来，
 * 界面上还剩 4 分钟，服务端早就关单了）。
 * 同时不再改写 state：本地没有关闭订单的权力。
 * @param {object[]} orders 订单列表（原地更新 cutdown）
 * @param {number} nowMs 服务器口径的当前时间（毫秒）
 * @returns {object[]} 本秒里「窗口刚刚结束」的订单，页面据此刷新一次列表
 */
export const tickUnpaidCountdowns = (orders, nowMs = serverNow(), fallbackSeconds = DEFAULT_PAY_WINDOW_SECONDS) => {
	const justEnded = []
	;(orders || []).forEach(order => {
		if (!order || Number(order.state) !== UNPAID_STATE) return
		const before = Number(order.cutdown) || 0
		const deadline = payDeadlineMs(order, fallbackSeconds)
		if (Number.isFinite(deadline)) order.payDeadlineMs = deadline
		const left = unpaidSecondsLeft(order, fallbackSeconds, nowMs)
		order.cutdown = left
		// 只在「有 -> 无」这一秒上报一次，避免每秒重复拉订单
		if (before > 0 && left === 0) justEnded.push(order)
	})
	return justEnded
}