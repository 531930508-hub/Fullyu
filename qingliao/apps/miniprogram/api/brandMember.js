/**
 * 品牌会员（Full愈大会员）客户端适配层 · 轻疗。
 *
 * 生产构建默认走轻疗服务端代理（/brandMember/*）：签名密钥只留在服务端，
 * 会员身份固定取当前登录客户，页面不接触 CRM、也不信任前端传入的积分、骰子或金额。
 * 本地开发如需合成数据，在微信开发者工具控制台执行
 * `uni.setStorageSync('fy.brand.mode','mock')` 后重进页面即可。
 *
 * 在线开通走服务端「CRM 报价 → 汇付小程序支付 → 验签回调 → CRM issue」链路：
 * 前端只拿 productCode 下单，金额与卡期均以服务端/CRM 为准；测试环境由服务端
 * 返回 testMode，页面改用模拟支付，不唤起任何真实扣款。
 *
 * 重要边界：小程序里只有「Full愈大会员」一种卡，数据源只有 CRM 品牌会员。
 * 原先那套「轻疗本店卡」（/memberCard/*）已合并进来并删除，避免出现
 * 「入口显示的卡」和「会员页的卡」两个口径。
 */
import cookie from '../utils/cookieUtil'
import http from '../utils/fetch'
import { hasBrandIdentity, normalizeBrandMember, SCOPE_BENEFIT } from '../utils/brandMemberPayload'
import {
  DEFAULT_PRODUCT_CODE,
  defaultProduct,
  discountText,
  entryPrice,
  findProduct,
  formatYuan,
  normalizeCatalog,
  normalizeProduct,
  priceLabel
} from '../utils/memberCatalog'
import { t } from '../utils/locale'

export { discountText, formatYuan, priceLabel }

export const BRAND_BUSINESS = 'retreat'
export const BRAND_BUSINESS_NAME = '轻疗'

/**
 * 运行模式必须构建安全：旧版 uni-app 的 Vite 产物会把 import.meta 编译成
 * require("url")，微信小程序没有该模块，整页会在模块加载阶段失败变成白屏。
 * 这里只用小程序运行时 API 判断，默认 server。
 */
function safeGetStorage(key) {
	try {
		return (typeof uni !== 'undefined' && uni.getStorageSync && uni.getStorageSync(key)) || ''
	} catch (error) {
		return ''
	}
}

const MODE = safeGetStorage('fy.brand.mode') === 'mock' ? 'mock' : 'server'
const GAME_URL = safeGetStorage('fy.brand.gameUrl')

export const isMock = MODE === 'mock'
/** mock = 本地合成演示；server = 服务端下单 + 微信支付。 */
export const purchaseMode = isMock ? 'mock' : 'server'

/**
 * 仅本地 mock 模式使用：没有后端时给页面一张可点击的卡。
 * server 模式下卡名、价格、卡期、折扣一律读 CRM 目录，页面不得引用这份常量。
 */
const MOCK_CARD_PRODUCTS = [
  {
    code: 'FY_MONTH',
    name: 'Full愈月会员',
    priceCents: 9900,
    validDays: 90,
    period: '90 天'
  },
  {
    code: 'FY_ANNUAL',
    name: 'Full愈大会员',
    priceCents: 36500,
    validDays: 365,
    period: '365 天'
  }
].map(normalizeProduct)

export const BRAND_BENEFITS = [
  // 范围权益（全品牌 · 全门店通用）排第一：它是卡的范围，不是某个品牌的权益。
  { ...SCOPE_BENEFIT },
  {
    business: 'retreat',
    title: '轻疗 · 项目会员价',
    desc: '提前一天预约享会员价，当日预约另有会员价'
  },
  {
    business: 'teahour',
    title: '时叙 · 会员茶饮权益',
    desc: '会员专属茶饮权益，具体内容以门店公示为准'
  },
  {
    business: 'presence',
    title: '在场 · 优先排位与会员价',
    desc: '热门课程优先排位，课程可享会员价'
  }
]

const POINTS_SPEND = {
  retreat: '1_point_1_yuan',
  teahour: 'display_only',
  presence: 'display_only'
}

function daysFromNow(iso) {
  const end = new Date(`${iso}T23:59:59+08:00`).getTime()
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000))
}

function annualCard() {
  return {
    state: daysFromNow('2027-10-29') <= 30 ? 'EXPIRING' : 'ACTIVE',
    productCode: 'FY_ANNUAL',
    productName: 'Full愈大会员',
    priceCents: 36500,
    validFrom: '2026-10-30',
    validUntil: '2027-10-29',
    remainingDays: daysFromNow('2027-10-29'),
    cardNoTail: '8812',
    soldBy: 'retreat',
    soldByName: '轻疗',
    pendingStart: ''
  }
}

function nowText() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 本地联调状态：开通后写内存，刷新回到初始值。 */
let mockState = createMockState('ACTIVE')

export function createMockState(cardState = 'ACTIVE') {
  const active = cardState !== 'NONE'
  return {
    member: {
      memberNo: 'FY-2026-008812',
      name: '林小满',
      phoneMasked: '138****6620'
    },
    card: active ? annualCard() : { state: 'NONE' },
    points: {
      balance: active ? 1280 : 0,
      expiring: active ? 120 : 0,
      expireAt: '2027-01-01',
      spend: { ...POINTS_SPEND }
    },
    dice: {
      balance: active ? 12 : 0,
      station: active ? 8 : 0,
      monthlyEarned: active ? 12 : 0,
      progress: active
        ? {
            perDieCents: 30000,
            progressCents: 24000,
            remainingCents: 6000,
            percent: 80,
            headline: '再消费 ¥60 可再得一次游戏机会',
            tip: {
              business: 'ql',
              external: 'retreat',
              title: '提前一天约轻疗',
              text: '提前一天预约享会员价，放松一次就够了。'
            }
          }
        : null
    },
    prizes: { pending: active ? 1 : 0 },
    savedCents: active ? 8600 : 0,
    renewal: { show: false },
    vouchers: active
      ? [
          {
            code: 'PV8K2M',
            title: '大会员茶礼一份',
            desc: '任一门店出示提货码，店员核销一次',
            valueCents: 6800,
            status: 'ISSUED',
            issuedAt: '2026-10-30',
            redeemedAt: null,
            redeemedStore: null
          }
        ]
      : [],
    notices: active
      ? [
          {
            id: 'notice-winter',
            title: '冬季会员礼遇',
            body: '十二月起，会员到店可体验新一季的肩颈放松；会员礼与会员故事也在陆续更新。',
            pinned: true,
            publishedAt: '2026-11-09'
          }
        ]
      : [],
    benefits: BRAND_BENEFITS.map((item) => ({ ...item })),
    businessCards: [],
    game: { enabled: active, dice: active ? 12 : 0 },
    source: 'synthetic',
    updatedAt: nowText(),
    stale: false
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function dateOnly(value) {
  if (!value) return ''
  return String(value).replace('T', ' ').slice(0, 10)
}

function readLocalPoints() {
  const raw = cookie.getIntegration()
  if (raw === '' || raw === null || raw === undefined) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function maskPhone(value) {
  if (!value) return ''
  const text = String(value)
  if (text.includes('*')) return text
  const digits = text.replace(/\D/g, '')
  if (digits.length < 7) return ''
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
}

function withLocalIdentity(base) {
  const points = readLocalPoints()
  const name = cookie.getNickname()
  const phone = maskPhone(cookie.getPhone())
  return {
    ...base,
    member: {
      ...base.member,
      name: name || base.member.name,
      phoneMasked: phone || base.member.phoneMasked
    },
    points: points === null ? base.points : { ...base.points, balance: points }
  }
}

/**
 * 读取品牌会员身份、积分、骰子与卡期；产品目录只读 CRM 当前生效版本。
 *
 * 接口不可用时向上抛错，页面显示重试，不把“连不上”误判成“未开通”。
 */
export async function loadBrandMember() {
  if (!isMock) {
    const [me, catalog] = await Promise.all([
      http.get({ url: '/brandMember/me', showErrorMessage: false }),
      http.get({ url: '/brandMember/products', showErrorMessage: false }).catch(() => null)
    ])
    // 身份三要素缺失时不能当成“未开通”：交给页面显示可重试状态，避免误判。
    if (!hasBrandIdentity(me)) {
      throw new Error('BRAND_MEMBER_PAYLOAD_INVALID')
    }
    // 目录缺失时 products 为空，页面改为提示重试并禁用购买，
    // 不再拿本地常量顶替 CRM 的报价与折扣。
    return { ...normalizeBrandMember(me, [], t), ...normalizeCatalog(catalog) }
  }
  // mock 模式没有后端，直接用本地合成卡面；不再回读任何"本店卡"接口。
  return withLocalIdentity({
    ...clone(mockState),
    ...normalizeCatalog(MOCK_CARD_PRODUCTS)
  })
}

/**
 * 只读卡目录：规则页、入口文案等「不需要会员身份」的场景使用。
 * 读取失败向上抛错，页面改为不写金额的通用表述，不猜价格。
 */
export async function loadCardCatalog() {
  if (isMock) return normalizeCatalog(MOCK_CARD_PRODUCTS)
  const catalog = await http.get({ url: '/brandMember/products', showErrorMessage: false })
  return normalizeCatalog(catalog)
}

/**
 * 卡面摘要：首页横幅、「我的」页、卡包三个入口共用这一份口径。
 * 数据源只有 CRM 品牌会员，任何"另一种卡"的读取都应被视作回归。
 */
export async function loadYearCardSummary() {
  if (!cookie.getToken()) return {}
  let brand
  try {
    brand = await loadBrandMember()
  } catch (error) {
    return {}
  }
  const card = (brand && brand.card) || {}
  const catalog = normalizeCatalog(brand)
  const products = catalog.products
  // 入口卖点固定展示大会员档；目录里没有这一档时退回默认卡型，仍不写死任何价格。
  const annual = findProduct(products, DEFAULT_PRODUCT_CODE) || defaultProduct(products)
  // 入口价不是大会员档的价：多档并存时取最低一档，并由 entryPrice 判定要不要标「起」。
  const entry = entryPrice(products)
  const face = {
    cardType: card.productCode === 'FY_MONTH' ? 'month' : 'year',
    cardName: card.productName || ''
  }
  return {
    state: String(card.state || 'NONE').toLowerCase(),
    remainingDays: card.remainingDays,
    startTime: card.validFrom,
    endTime: card.validUntil,
    // 当前卡后面还排着一张时（赠送码/续费单接续），CRM 用 pendingCard 下发；卡包顶部据此多显示一行。
    pendingCard: brand && brand.pendingCard ? brand.pendingCard : null,
    pending: card.pendingStart ? { startTime: card.pendingStart } : null,
    current: face,
    expired: face,
    // 本年已省：首页续费提醒用它说「省下多少」，与「我的」卡脚同源。
    savedCents: Number((brand && brand.savedCents) || 0),
    points: brand && brand.points ? brand.points.balance : undefined,
    // 未开通时的卖点同样来自 CRM 目录：卡名、价格、卡期、提前价折扣都不在页面里写。
    product: annual,
    products,
    defaultProductCode: catalog.defaultProductCode,
    // 未开通入口价（最低一档 + 是否多档），页面直接用它拼「¥99 起」。
    entry,
    // 入口卖点只读 CRM 权益文案；没有配置时页面隐藏这一行。
    benefits: Array.isArray(brand && brand.benefits) ? brand.benefits : []
  }
}

export function quoteBrandCard(productCode) {
  const product = findProduct(MOCK_CARD_PRODUCTS, productCode) || defaultProduct(MOCK_CARD_PRODUCTS)
  if (isMock) {
    return Promise.resolve({
      quoteId: `q_mock_${Date.now()}`,
      productCode: product.code,
      priceCents: product.priceCents,
      validDays: product.validDays,
      expiresAt: Date.now() + 30 * 60 * 1000
    })
  }
  return http.post({
    url: '/brandMember/quote',
    data: { productCode }
  })
}

/** 支付成功后开卡；真实环境由业务服务端在验签回调后调用。 */
export function issueBrandCard({ quote, orderRef, paidCents }) {
  if (isMock) {
    if (paidCents !== quote.priceCents) {
      return Promise.reject(new Error('AMOUNT_MISMATCH'))
    }
    const product =
      findProduct(MOCK_CARD_PRODUCTS, quote.productCode) || defaultProduct(MOCK_CARD_PRODUCTS)
    const start = new Date()
    const end = new Date(start.getTime() + product.validDays * 86400000)
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`
    mockState = {
      ...mockState,
      card: {
        state: 'ACTIVE',
        productCode: product.code,
        productName: product.name,
        priceCents: product.priceCents,
        validFrom: iso(start),
        validUntil: iso(end),
        remainingDays: product.validDays,
        cardNoTail: mockState.card.cardNoTail || '',
        soldBy: BRAND_BUSINESS,
        soldByName: BRAND_BUSINESS_NAME,
        pendingStart: ''
      },
      dice: { ...mockState.dice, balance: mockState.dice.balance || 2 },
      game: { enabled: true, dice: mockState.dice.balance || 2 },
      source: 'synthetic',
      updatedAt: nowText()
    }
    return Promise.resolve({ orderRef, card: clone(mockState.card) })
  }
  return http.post({
    url: '/brandMember/purchase',
    data: { productCode: quote && quote.productCode }
  })
}

/**
 * 在线开通：服务端创建 C 开头支付单，返回体里的 testMode 决定走模拟支付还是微信支付。
 * 只传产品编码、条款同意标记与会员档案，价格由 CRM 报价决定，前端不传金额。
 */
export function purchaseBrandCard({
	productCode,
	agreeTerms = true,
	openId,
	contactName,
	contactGender,
	contactBirthday
}) {
	const data = { productCode, agreeTerms, openId }
	const name = contactName == null ? '' : String(contactName).trim()
	if (name) data.contactName = name
	if (contactGender === '1' || contactGender === '2') data.contactGender = contactGender
	if (contactBirthday) data.contactBirthday = String(contactBirthday)
	return http.post({
		url: '/brandMember/purchase',
		data,
		// 页面会用统一样式提示失败原因，避免双 toast。
		showErrorMessage: false
	})
}

/**
 * 保存会员档案（称呼/性别/生日）。
 * 服务端先写客户资料并推会员中心，成功后才回写订单，失败会抛错由页面提示。
 */
export function saveMemberProfile({ contactName, contactGender, contactBirthday } = {}) {
	const data = {
		contactName: String(contactName == null ? '' : contactName).trim(),
		contactGender: contactGender === '2' ? '2' : '1',
		contactBirthday: contactBirthday ? String(contactBirthday).slice(0, 10) : ''
	}
	if (isMock) {
		return Promise.resolve({ ...data })
	}
	return http.put({
		url: '/brandMember/profile',
		data,
		// 页面统一提示失败原因，避免双 toast
		showErrorMessage: false
	})
}

/** 测试环境模拟支付：服务端按订单金额直接走 CRM 开卡，不调用汇付。 */
export function mockPayBrandCard(orderSn) {
	return http.post({
		url: '/brandMember/purchase/mock',
		data: { orderSn },
		showErrorMessage: false
	})
}

export function loadBrandOrderStatus(orderSn) {
	return http.get({
		url: '/brandMember/order',
		params: { orderSn },
		showErrorMessage: false
	})
}

/** 我的购卡记录 + 购买锁定状态；退款资格由服务端随行返回。 */
export function loadBrandOrders() {
	if (isMock) {
		return Promise.resolve({ locked: false, lockReason: '', orders: [] })
	}
	return http.get({ url: '/brandMember/orders', showErrorMessage: false })
}

export function previewBrandRefund(orderSn) {
	if (isMock) return Promise.reject(new Error(t('本地合成数据不支持退款试算')))
	return http.get({
		url: '/brandMember/refund/preview',
		params: { orderSn },
		// 试算失败由退款弹层展示原因并禁用提交，避免双提示
		showErrorMessage: false
	})
}

/**
 * 退款只提交订单号与原因：可退金额、是否允许都以服务端 CRM 试算为准，
 * 前端不再有「确认 0 元退款」这种绕过口子；不可退时请联系门店走协商退款。
 */
export function refundBrandCard({ orderSn, reason = '' }) {
	return http.post({
		url: '/brandMember/refund',
		data: { orderSn, reason },
		showErrorMessage: false
	})
}

/**
 * 会员码兑换：渠道、天数、名额、截止均由 CRM 判定；
 * 身份由服务端固定为当前登录客户，前端只提交码本身。
 */
export function claimGiftCode(code) {
	const normalized = String(code || '').replace(/\s+/g, '').toUpperCase()
	if (isMock) {
		if (!/^[A-Z0-9]{4,16}$/.test(normalized)) {
			return Promise.reject(new Error(t('会员码为 4–16 位字母或数字')))
		}
		if (normalized === 'FULL0001') return Promise.reject(new Error(t('该会员码名额已满')))
		if (mockState.card.state === 'NONE') mockState = createMockState('ACTIVE')
		return Promise.resolve({ card: clone(mockState.card), days: 30, replayed: false })
	}
	return http.post({
		url: '/brandMember/gift/claim',
		data: { code: normalized },
		showErrorMessage: false
	})
}

/** 意见反馈：仅有效会员可提交；allowQuote 表示同意匿名整理进会员故事。 */
export function submitFeedback(content, allowQuote) {
	if (isMock) return Promise.resolve({ ok: true, id: `FB-MOCK-${Date.now()}` })
	return http.post({
		url: '/brandMember/feedback',
		data: { content: String(content || '').trim(), allowQuote: Boolean(allowQuote) },
		showErrorMessage: false
	})
}

/** 会员故事：仅有效会员可读；非会员时服务端返回 403，页面不展示该区块。 */
export function loadStories() {
	if (isMock) {
		return Promise.resolve({
			stories: [
				{
					id: 'ST-MOCK-1',
					title: '下班后的一小时',
					quote: '终于有个地方能让我慢下来。',
					quoteBy: '林女士',
					story: '她每周三下班先来轻疗放松肩颈，再去时叙喝一杯眠。',
					business: 'ql',
					publishedAt: '2026-11-01'
				}
			]
		})
	}
	return http.get({ url: '/brandMember/stories', showErrorMessage: false })
}

export function voucherStatusLabel(status) {
	return t(
		{ ISSUED: '待领取', REDEEMED: '已领取', VOID: '已作废', EXPIRED: '已过期' }[status] || '待领取'
	)
}

/**
 * 愈行之旅地址：ticket 由 CRM 生成，5 分钟有效。
 * 正式环境每次点击都向服务端换新票据，避免身份页停留过久后票据过期。
 */
export function requestGameTicket() {
  if (isMock) return Promise.resolve({ url: gameUrlFor('mock') })
  return http.post({ url: '/brandMember/game/ticket' })
}

/** mock 演示地址：按业务带上 embed 与 host。 */
export function gameUrlFor(ticket = '') {
  const override = safeStorage('fy.brand.gameUrl')
  const base = override || GAME_URL
  if (!base) return ''
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}embed=1&host=${BRAND_BUSINESS}${
    ticket ? `&ticket=${encodeURIComponent(ticket)}` : ''
  }`
}

export function setMockCardState(state) {
  mockState = createMockState(state)
  // 联调切卡态时同样带上目录，否则 mock 下购买入口会因「没有卡型」被禁用。
  return withLocalIdentity({ ...clone(mockState), ...normalizeCatalog(MOCK_CARD_PRODUCTS) })
}

function safeStorage(key) {
  try {
    return uni.getStorageSync(key) || ''
  } catch (error) {
    return ''
  }
}

export function formatDate(iso) {
  if (!iso) return ''
  return String(iso).replace('T', ' ').slice(0, 10)
}

export function cardStateLabel(state) {
  return (
    {
      ACTIVE: '生效中',
      EXPIRING: '即将到期',
      PENDING: '待生效',
      EXPIRED: '已到期',
      NONE: '未开通',
      REFUND_LOCKED: '退款处理中',
      REFUNDED: '已退款'
    }[state] || '未开通'
  )
}

/**
 * 扫会员码小程序码进入时，微信把 scene 放在 onLoad options.scene。
 * 统一格式 `g=会员码`；同时兼容 ?g=CODE 调试。
 */
export const PENDING_GIFT_KEY = 'brand.pendingGift'
const PENDING_GIFT_TTL_MS = 24 * 60 * 60 * 1000

export function parseGiftScene(options = {}) {
  const raw = String(options.scene || options.g || '').trim()
  if (!raw) return ''
  let text = raw
  try {
    text = decodeURIComponent(raw)
  } catch (error) {
    text = raw
  }
  const matched = /^g=([A-Za-z0-9]{4,16})$/.exec(text.trim())
  return matched ? matched[1].toUpperCase() : ''
}

export function stashPendingGift(code) {
  if (!/^[A-Z0-9]{4,16}$/.test(String(code || ''))) return
  try {
    uni.setStorageSync(PENDING_GIFT_KEY, { code: String(code), at: Date.now() })
  } catch (error) {
    /* storage unavailable */
  }
}

export function peekPendingGift() {
  try {
    const saved = uni.getStorageSync(PENDING_GIFT_KEY)
    if (!saved || !saved.code) return ''
    if (saved.at && Date.now() - Number(saved.at) > PENDING_GIFT_TTL_MS) {
      uni.removeStorageSync(PENDING_GIFT_KEY)
      return ''
    }
    return String(saved.code)
  } catch (error) {
    return ''
  }
}

export function takePendingGift() {
  const code = peekPendingGift()
  try {
    uni.removeStorageSync(PENDING_GIFT_KEY)
  } catch (error) {
    /* storage unavailable */
  }
  return code
}
