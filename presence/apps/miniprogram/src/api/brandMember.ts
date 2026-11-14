/**
 * 品牌会员（Full愈年卡）客户端适配层。
 *
 * 生产构建默认走在场服务端代理（/member/brand/*）：签名密钥只留在服务端，
 * 会员身份固定取当前登录用户，页面不接触 CRM、也不信任前端传入的积分、骰子或金额。
 * 本地开发仍可用 VITE_BRAND_MEMBER_MODE=mock 看合成数据，避免把假数据带进线上。
 */
import { tr } from '@/locale'
import { get, post } from '@/utils/request'

export const BRAND_BUSINESS = 'presence'
export const BRAND_BUSINESS_NAME = '在场'

const ENV = ((import.meta as any).env || {}) as Record<string, string | undefined>
const MODE = ENV.VITE_BRAND_MEMBER_MODE || (ENV.PROD ? 'server' : 'mock')
const GAME_URL = ENV.VITE_BRAND_GAME_URL || ''

export const isMock = MODE === 'mock'
/** 购卡支付尚未接入时，页面必须明确说「暂不能开通」，不能跳过后台直接开卡。 */
export const purchaseMode = isMock ? 'mock' : 'unavailable'

export interface BrandCardProduct {
  code: string
  name: string
  priceCents: number
  validDays: number
  period: string
}

export interface BrandCardState {
  state: 'ACTIVE' | 'EXPIRING' | 'PENDING' | 'EXPIRED' | 'NONE'
  productCode?: string
  productName?: string
  priceCents?: number
  validFrom?: string
  validUntil?: string
  remainingDays?: number
  soldBy?: string
  soldByName?: string
}

export interface LocalBusinessCard {
  code: string
  name: string
  planName?: string
  state: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NONE'
  validUntil?: string
  remainingDays?: number
  benefits: string[]
  system: string
  readOnly: boolean
}

export interface BrandBenefit {
  business: 'teahour' | 'presence' | 'retreat'
  title: string
  desc: string
}

export interface BrandMemberData {
  member: { memberNo: string; name: string; phoneMasked: string }
  card: BrandCardState
  points: {
    balance: number
    expiring: number
    expireAt: string
    spend: Record<string, string>
  }
  dice: { balance: number; station: number; monthlyEarned: number; progress?: DiceProgress | null }
  prizes: { pending: number }
  savedCents: number
  /** 续费提醒：仅 EXPIRING 且无待生效续卡时由 CRM 给出，金额与文案都以 CRM 为准。 */
  renewal?: { show: boolean; savedCents?: number; remainingDays?: number | null; text?: string }
  /** 年卡礼提货码：任一门店出示、店员核销一次。 */
  vouchers?: BrandPickupVoucher[]
  /** 会员公告：后台发布后只对有效会员返回，置顶优先，最多 3 条。 */
  notices?: BrandNotice[]
  perks?: { presence?: { prioritySeat: boolean; tierPrice: boolean; invitesPerMonth: number } }
  benefits: BrandBenefit[]
  businessCards: LocalBusinessCard[]
  game: { enabled: boolean; dice: number; ticket?: string; url?: string | null }
  updatedAt: string
  stale: boolean
  products?: BrandCardProduct[]
}

export interface DiceProgress {
  perDieCents: number
  progressCents: number
  remainingCents: number
  percent: number
  headline: string
  tip?: { business: string; external: string; title: string; text: string } | null
}

export interface BrandNotice {
  id: string
  title: string
  body: string
  pinned?: boolean
  publishedAt?: string | null
}

export interface BrandPickupVoucher {
  code: string
  title: string
  desc?: string
  valueCents?: number
  status: 'ISSUED' | 'REDEEMED' | 'VOID' | 'EXPIRED'
  issuedAt?: string
  redeemedAt?: string | null
  redeemedStore?: string | null
}

export interface BrandStory {
  id: string
  title: string
  quote?: string | null
  quoteBy?: string | null
  story: string
  business?: string | null
  publishedAt?: string | null
}

export interface BrandInviteList {
  monthKey: string
  quota: number
  used: number
  remaining: number
  invites: Array<{ code: string; status: string; claimed: boolean; createdAt: string; claimedAt: string | null }>
}

export interface BrandInviteCreated {
  code: string
  monthKey: string
  quota: number
  used: number
  remaining: number
  expiresAt: string
}

export interface BrandInviteClaimed {
  claimed: boolean
  replayed: boolean
  voucher: { id: string; title: string; status: string; expiresAt: string }
}

export interface BrandQuote {
  quoteId: string
  productCode: string
  priceCents: number
  validDays: number
  expiresAt: number | string
}

export const CARD_PRODUCTS: BrandCardProduct[] = [
  {
    code: 'FY_MONTH',
    name: 'Full愈月卡',
    priceCents: 4500,
    validDays: 30,
    period: '30 天'
  },
  {
    code: 'FY_ANNUAL',
    name: 'Full愈年卡',
    priceCents: 29900,
    validDays: 365,
    period: '365 天'
  }
]

const BENEFITS: BrandBenefit[] = [
  {
    business: 'presence',
    title: '在场 · 优先排位与阶梯价',
    desc: '热门课程候补优先排位；课程享会员阶梯价'
  },
  {
    business: 'teahour',
    title: '时叙 · 会员茶饮权益',
    desc: '会员专属茶饮权益，具体内容以门店公示为准'
  },
  {
    business: 'retreat',
    title: '轻疗 · 项目会员价',
    desc: '提前一天预约享会员价，当日预约另有会员价'
  }
]
// 以上仅用于本地合成数据；线上权益标题与说明一律以 CRM 返回为准。

const POINTS_SPEND = {
  teahour: 'display_only',
  presence: 'display_only',
  retreat: '1_point_1_yuan'
}

function daysFromNow(iso: string) {
  const end = new Date(`${iso}T23:59:59+08:00`).getTime()
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000))
}

function annualCard(forceExpiring = false): BrandCardState {
  if (forceExpiring) {
    return {
      state: 'EXPIRING',
      productCode: 'FY_ANNUAL',
      productName: 'Full愈年卡',
      priceCents: 29900,
      validFrom: '2025-11-27',
      validUntil: '2026-11-26',
      remainingDays: 18,
      soldBy: 'retreat',
      soldByName: '轻疗'
    }
  }
  return {
    state: daysFromNow('2027-10-29') <= 30 ? 'EXPIRING' : 'ACTIVE',
    productCode: 'FY_ANNUAL',
    productName: 'Full愈年卡',
    priceCents: 29900,
    validFrom: '2026-10-30',
    validUntil: '2027-10-29',
    remainingDays: daysFromNow('2027-10-29'),
    soldBy: 'retreat',
    soldByName: '轻疗'
  }
}

function nowText() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 本地联调状态：开通后写内存，刷新回到初始值。 */
let mockState = createMockState('ACTIVE')

export function createMockState(cardState = 'ACTIVE'): BrandMemberData {
  const brandOn = cardState !== 'NONE'
  const expiringMock = cardState === 'EXPIRING'
  return {
    member: {
      memberNo: 'FY-2026-008812',
      name: '林小满',
      phoneMasked: '138****6620'
    },
    card: brandOn ? annualCard(expiringMock) : { state: 'NONE' },
    points: {
      balance: brandOn ? 1280 : 0,
      expiring: brandOn ? 120 : 0,
      expireAt: '2027-01-01',
      spend: { ...POINTS_SPEND }
    },
    dice: brandOn
      ? {
          balance: 12,
          station: 8,
          monthlyEarned: 12,
          progress: {
            perDieCents: 30000,
            progressCents: 24000,
            remainingCents: 6000,
            percent: 80,
            headline: '再消费 ¥60 可再得一次游戏机会',
            tip: {
              business: 'ql',
              external: 'retreat',
              title: '提前一天约轻疗',
              text: '提前一天预约轻疗享会员价，顺手把骰子攒满。'
            }
          }
        }
      : { balance: 0, station: 0, monthlyEarned: 0, progress: null },
    prizes: { pending: brandOn ? 1 : 0 },
    savedCents: brandOn ? 8600 : 0,
    renewal: expiringMock
      ? { show: true, savedCents: 8600, remainingDays: 18, text: '这张卡已经帮你省下 ¥86，还有 18 天到期，续上就不断档' }
      : { show: false },
    notices: brandOn
      ? [
          {
            id: 'notice-winter',
            title: '冬季会员礼遇',
            body: '十二月起，会员可优先预约周末小班课。',
            pinned: true,
            publishedAt: '2026-11-09'
          }
        ]
      : [],
    vouchers: brandOn
      ? [
          {
            code: 'PV8K2M',
            title: '年卡茶礼一份',
            desc: '任一门店出示提货码，店员核销一次',
            valueCents: 6800,
            status: 'ISSUED',
            issuedAt: '2026-10-30',
            redeemedAt: null,
            redeemedStore: null
          }
        ]
      : [],
    perks: { presence: { prioritySeat: brandOn, tierPrice: brandOn, invitesPerMonth: brandOn ? 2 : 0 } },
    benefits: BENEFITS.map((item) => ({ ...item })),
    businessCards: [],
    game: { enabled: brandOn, dice: brandOn ? 12 : 0 },
    updatedAt: nowText(),
    stale: false
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/** 读取品牌会员身份、积分、骰子与本业务只读卡；产品目录只读 CRM 当前生效版本。 */
export async function loadBrandMember(): Promise<BrandMemberData> {
  if (isMock) return clone({ ...mockState, products: CARD_PRODUCTS })
  const [me, catalog] = await Promise.all([
    get<BrandMemberData>('/member/brand/me'),
    get<{ products: BrandCardProduct[] }>('/member/brand/products').catch(() => null)
  ])
  const products =
    catalog && Array.isArray(catalog.products) && catalog.products.length
      ? catalog.products
      : []
  return { ...me, products }
}

export function quoteBrandCard(productCode: string): Promise<BrandQuote> {
  const product =
    CARD_PRODUCTS.find((item) => item.code === productCode) || CARD_PRODUCTS[1]
  if (isMock) {
    return Promise.resolve({
      quoteId: `q_mock_${Date.now()}`,
      productCode: product.code,
      priceCents: product.priceCents,
      validDays: product.validDays,
      expiresAt: Date.now() + 30 * 60 * 1000
    })
  }
  return post<BrandQuote>('/member/brand/quote', { productCode })
}

/**
 * 支付成功后开卡。真实环境由在场服务端在验签回调后调用 CRM；
 * 当前支付通道未接入，服务端会明确拒绝（5034），
 * 前端本地联调只用于把身份页状态走通，不冒充真实支付。
 */
export function issueBrandCard(payload: {
  quote: BrandQuote
  orderRef: string
  paidCents: number
}): Promise<{ orderRef: string; card: BrandCardState }> {
  const { quote, orderRef, paidCents } = payload
  if (isMock) {
    if (paidCents !== quote.priceCents) {
      return Promise.reject(new Error('AMOUNT_MISMATCH'))
    }
    const product =
      CARD_PRODUCTS.find((item) => item.code === quote.productCode) ||
      CARD_PRODUCTS[1]
    const start = new Date()
    const end = new Date(start.getTime() + product.validDays * 86400000)
    const iso = (d: Date) =>
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
        soldBy: BRAND_BUSINESS,
        soldByName: BRAND_BUSINESS_NAME
      },
      businessCards: mockState.businessCards,      dice: { ...mockState.dice, balance: mockState.dice.balance || 2 },
      game: { enabled: true, dice: mockState.dice.balance || 2 },
      updatedAt: nowText()
    }
    return Promise.resolve({ orderRef, card: clone(mockState.card) })
  }
  return post<{ orderRef: string; card: BrandCardState }>('/member/brand/purchase', {
    productCode: quote && quote.productCode
  })
}

/**
 * 愈行之旅地址：ticket 由 CRM 生成，5 分钟有效。
 * 正式环境每次点击都向服务端换新票据，避免身份页停留过久后票据过期。
 */
export function requestGameTicket(): Promise<{ url: string }> {
  if (isMock) return Promise.resolve({ url: gameUrlFor('mock') })
  return post<{ ticket: string; url: string; expiresAt: string }>('/member/brand/game/ticket')
}

/** mock 演示地址：按业务带上 embed 与 host。 */
export function gameUrlFor(ticket = ''): string {
  const override = safeStorage('fy.brand.gameUrl')
  const base = override || GAME_URL
  if (!base) return ''
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}embed=1&host=${BRAND_BUSINESS}${
    ticket ? `&ticket=${encodeURIComponent(ticket)}` : ''
  }`
}

const CODE_PATTERN = /^[A-Z0-9]{4,16}$/
/** 会员码 / 邀请码：去空格转大写，与服务端同一规则。 */
export function normalizeCode(value: unknown) {
  return String(value || '').replace(/\s+/g, '').toUpperCase()
}
export function isValidCode(value: string) {
  return CODE_PATTERN.test(value)
}

/** 会员码兑换：渠道、天数、名额、截止由 CRM 判定；身份由服务端固定为当前登录用户。 */
export function claimGiftCode(code: string): Promise<{ card: BrandCardState; days: number; replayed: boolean }> {
  const normalized = normalizeCode(code)
  if (isMock) {
    if (!isValidCode(normalized)) return Promise.reject(new Error('会员码为 4–16 位字母或数字'))
    if (normalized === 'FULLCODE') return Promise.reject(new Error('该会员码名额已满'))
    if (mockState.card.state === 'NONE') mockState = createMockState('ACTIVE')
    return Promise.resolve({ card: clone(mockState.card), days: 30, replayed: false })
  }
  return post('/member/brand/gift/claim', { code: normalized })
}

/** 意见反馈：5–1000 字（与 CRM 一致）；allowQuote 表示同意匿名整理进会员故事。 */
export function submitFeedback(content: string, allowQuote: boolean): Promise<{ ok: boolean; id: string | null }> {
  if (isMock) return Promise.resolve({ ok: true, id: `FB-MOCK-${Date.now()}` })
  return post('/member/brand/feedback', { content: String(content || '').trim(), allowQuote: allowQuote === true })
}

/** 会员故事：仅有效会员可读，非会员服务端返回 403。 */
export function loadStories(): Promise<{ stories: BrandStory[] }> {
  if (isMock) {
    return Promise.resolve({
      stories: [
        {
          id: 'ST-MOCK-1',
          title: '下班后的一小时',
          quote: '终于有个地方能让我慢下来。',
          quoteBy: '林女士',
          story: '她每周三下班先来在场上一节舒展课，再去时叙喝一杯醒。',
          business: 'presence',
          publishedAt: '2026-11-01'
        }
      ]
    })
  }
  return get('/member/brand/stories')
}

let mockInvites: BrandInviteList = { monthKey: '2026-11', quota: 2, used: 0, remaining: 2, invites: [] }

/** 本月邀请名额与已发邀请；名额 N 由 CRM 会员卡权益配置。 */
export function loadInvites(): Promise<BrandInviteList> {
  if (isMock) return Promise.resolve(clone(mockInvites))
  return get('/member/brand/invites')
}

/** 生成一张邀请：每张只能被一位好友领取，占用本月一个名额。 */
export function createInvite(): Promise<BrandInviteCreated> {
  if (isMock) {
    if (mockInvites.remaining <= 0) return Promise.reject(new Error('本月邀请名额已用完'))
    const code = `INV${String(mockInvites.used + 1).padStart(5, '0')}`
    mockInvites = {
      ...mockInvites,
      used: mockInvites.used + 1,
      remaining: mockInvites.remaining - 1,
      invites: [{ code, status: 'OPEN', claimed: false, createdAt: nowText(), claimedAt: null }, ...mockInvites.invites]
    }
    return Promise.resolve({ code, monthKey: mockInvites.monthKey, quota: mockInvites.quota, used: mockInvites.used, remaining: mockInvites.remaining, expiresAt: '2026-12-31' })
  }
  return post('/member/brand/invites/create')
}

/** 好友领取邀请：CRM 记关系，在场本地发一张 0 元体验课券。 */
export function claimBrandInvite(code: string): Promise<BrandInviteClaimed> {
  const normalized = normalizeCode(code)
  if (isMock) {
    if (!isValidCode(normalized)) return Promise.reject(new Error('邀请码无效'))
    return Promise.resolve({
      claimed: true,
      replayed: false,
      voucher: { id: 'v_mock', title: '在场 · 免费体验课 1 节', status: 'UNUSED', expiresAt: '2026-12-31' }
    })
  }
  return post('/member/brand/invites/claim', { code: normalized })
}

/** 邀请分享落地页路径：好友打开后登录即可领取体验课券。 */
export function inviteSharePath(code: string) {
  return `/pages/share-landing/index?brandInvite=${encodeURIComponent(code)}`
}

export function voucherStatusLabel(status?: string) {
  return (
    { ISSUED: tr('待领取', 'To collect'), REDEEMED: tr('已领取', 'Collected'), VOID: tr('已作废', 'Void'), EXPIRED: tr('已过期', 'Expired') } as Record<string, string>
  )[status || ''] || tr('待领取', 'To collect')
}

export function setMockCardState(
  state: 'NONE' | 'ACTIVE' | 'EXPIRING'
): BrandMemberData {
  mockState = createMockState(state)
  return clone(mockState)
}

function safeStorage(key: string): string {
  try {
    return uni.getStorageSync(key) || ''
  } catch (error) {
    return ''
  }
}

export function formatYuan(cents?: number) {
  const value = Number(cents || 0) / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function formatDate(iso?: string) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

export function cardStateLabel(state?: string) {
  return (
    {
      ACTIVE: tr('生效中', 'Active'),
      EXPIRING: tr('即将到期', 'Expiring'),
      PENDING: tr('待生效', 'Pending'),
      EXPIRED: tr('已到期', 'Expired'),
      NONE: tr('未开通', 'Not active'),
      REFUND_LOCKED: tr('退款处理中', 'Refund in progress'),
      REFUNDED: tr('已退款', 'Refunded')
    } as Record<string, string>
  )[state || ''] || tr('未开通', 'Not active')
}

export function benefitFor(benefits: BrandBenefit[], business: string) {
  return (benefits || []).find((item) => item.business === business) || null
}

/**
 * 扫会员码小程序码进入时，微信把 scene 放在 onLoad options.scene。
 * 统一格式 `g=会员码`；同时兼容 ?g=CODE 调试。
 */
export const PENDING_GIFT_KEY = 'presence.brand.pendingGift'
const PENDING_GIFT_TTL_MS = 24 * 60 * 60 * 1000

export function parseGiftScene(options: Record<string, unknown> = {}) {
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

export function stashPendingGift(code: string) {
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
