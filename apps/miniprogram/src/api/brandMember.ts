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
  dice: { balance: number; station: number; monthlyEarned: number }
  prizes: { pending: number }
  savedCents: number
  benefits: BrandBenefit[]
  businessCards: LocalBusinessCard[]
  game: { enabled: boolean; dice: number; ticket?: string; url?: string | null }
  updatedAt: string
  stale: boolean
  products?: BrandCardProduct[]
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
    title: '在场 · 课程会员价',
    desc: '没有畅练卡或已过有效期时，课程按品牌会员价结算'
  },
  {
    business: 'teahour',
    title: '时叙 · 每杯立减',
    desc: '每杯立减 ¥2，具体以 CRM 配置为准'
  },
  {
    business: 'retreat',
    title: '轻疗 · 项目会员价',
    desc: '提前预约 7.8 折，当日 8.8 折'
  }
]

const POINTS_SPEND = {
  teahour: 'display_only',
  presence: 'display_only',
  retreat: '1_point_1_yuan'
}

function daysFromNow(iso: string) {
  const end = new Date(`${iso}T23:59:59+08:00`).getTime()
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000))
}

function annualCard(): BrandCardState {
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

function presencePass(state: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' = 'ACTIVE'): LocalBusinessCard {
  return {
    code: 'PRESENCE_PASS',
    name: '在场畅练卡',
    planName: '年卡',
    state,
    validUntil: '2027-06-30',
    remainingDays: daysFromNow('2027-06-30'),
    benefits: ['有效期内课程免费', '可提前预约课程', '到店签到核验'],
    system: 'presence',
    readOnly: true
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

/**
 * 两张卡状态可独立设置，用于核对「有畅练卡、没品牌卡」这类关键场景。
 * passState 默认 ACTIVE：品牌卡未开通不应把在场畅练卡也显示成未开通。
 */
export function createMockState(
  cardState = 'ACTIVE',
  passState: 'ACTIVE' | 'NONE' = 'ACTIVE'
): BrandMemberData {
  const brandOn = cardState !== 'NONE'
  return {
    member: {
      memberNo: 'FY-2026-008812',
      name: '林小满',
      phoneMasked: '138****6620'
    },
    card: brandOn ? annualCard() : { state: 'NONE' },
    points: {
      balance: brandOn ? 1280 : 0,
      expiring: brandOn ? 120 : 0,
      expireAt: '2027-01-01',
      spend: { ...POINTS_SPEND }
    },
    dice: brandOn ? { balance: 12, station: 8, monthlyEarned: 12 } : { balance: 0, station: 0, monthlyEarned: 0 },
    prizes: { pending: brandOn ? 1 : 0 },
    savedCents: brandOn ? 8600 : 0,
    benefits: BENEFITS.map((item) => ({ ...item })),
    businessCards: passState === 'NONE' ? [] : [presencePass()],
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
      businessCards: mockState.businessCards.length
        ? mockState.businessCards
        : [presencePass()],      dice: { ...mockState.dice, balance: mockState.dice.balance || 2 },
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

export function setMockCardState(
  state: 'NONE' | 'ACTIVE',
  passState: 'NONE' | 'ACTIVE' = 'ACTIVE'
): BrandMemberData {
  mockState = createMockState(state, passState)
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
