// 首页「连续支付未付订单」的纯逻辑：
// 同一客户在支付超时窗内可能挂着几笔未付单，每笔各自倒计时、超时自动取消，
// 首页要把它们按最先超时的顺序排成队列，付完一笔接着付下一笔。
// 页面只负责调接口和开弹框，队列怎么算都收敛在这里，方便单测。

/** 未支付订单的 state */
export const UNPAID_STATE = 0

// 后端返回的是 "yyyy-MM-dd HH:mm:ss"：iOS 对带横杠+空格的写法不稳，统一换成斜杠再解析
const toMs = (value) => {
	if (!value) return NaN
	return Date.parse(String(value).replace(/-/g, '/'))
}

/**
 * 按订单的创建时间和支付超时秒数，算出这一单还剩多少秒可支付。
 * @param {object} order 至少包含 createTime / overTimeSeconds 的订单
 * @param {number} fallbackSeconds 后端没给 overTimeSeconds 时的兜底秒数
 * @param {number} nowMs 当前时间（毫秒），便于测试注入
 * @returns {number} 剩余秒数，最小 0
 */
export const unpaidSecondsLeft = (order, fallbackSeconds, nowMs = Date.now()) => {
	if (!order || !order.createTime) return 0
	const createMs = toMs(order.createTime)
	if (!Number.isFinite(createMs)) return 0
	const limitSeconds = Number(order.overTimeSeconds) || Number(fallbackSeconds) || 0
	if (limitSeconds <= 0) return 0
	const left = limitSeconds - Math.floor((nowMs - createMs) / 1000)
	return left > 0 ? left : 0
}

/**
 * 给列表里的未付单挂上剩余秒数（cutdown），已在倒计时内的才算可支付。
 * 列表可能是同一数组实例，直接原地写回，保持和原实现一致。
 * @returns {object[]} 原列表
 */
export const applyUnpaidCountdowns = (list, fallbackSeconds, nowMs = Date.now()) => {
	(list || []).forEach(order => {
		if (Number(order && order.state) !== UNPAID_STATE) return
		order.cutdown = unpaidSecondsLeft(order, fallbackSeconds, nowMs)
	})
	return list || []
}

/**
 * 首页待支付队列：只留仍在倒计时内、且本轮还没付过的未付单，
 * 按创建时间从早到晚排——先超时的先付，避免排队时前面的单被自动取消。
 * @param {object[]} orders 已带 cutdown 的订单列表
 * @param {string[]} paidIds 本轮已经付过的订单 id（微信回执异步落库，刚付的单可能还带着未付状态）
 */
export const buildUnpaidQueue = (orders, paidIds = []) => {
	const paid = (paidIds || []).map(id => String(id))
	return (orders || [])
		.filter(order => order &&
			Number(order.state) === UNPAID_STATE &&
			Number(order.cutdown) > 0 &&
			!paid.includes(String(order.id)))
		.sort((a, b) => String(a.createTime) < String(b.createTime) ? -1 : 1)
}

/**
 * 每秒推进一次未付单倒计时；到 0 的单先本地按「已关闭」标记，避免留下点不动的支付按钮。
 * @returns {boolean} 本轮是否有订单刚刚到期（页面据此刷新一次列表）
 */
export const tickUnpaidCountdowns = (orders) => {
	let expiredOne = false
	const list = orders || []
	list.forEach(order => {
		if (!order || Number(order.state) !== UNPAID_STATE || !(Number(order.cutdown) > 0)) return
		order.cutdown = Math.max(0, Number(order.cutdown) - 1)
		if (order.cutdown === 0) {
			order.state = 3
			order.appointmentState = 3
			expiredOne = true
		}
	})
	return expiredOne
}