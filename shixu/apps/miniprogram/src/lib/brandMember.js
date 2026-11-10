import { request } from '../api/request';

/**
 * 品牌会员（Full愈年卡）客户端适配层。
 *
 * 生产构建默认走时叙服务端代理（/customer/brand-member/*）：签名密钥只留在服务端，
 * 会员身份固定取当前登录顾客，页面不接触 CRM、也不信任前端传入的积分、骰子或金额。
 * 本地开发仍可用 VITE_BRAND_MEMBER_MODE=mock 看合成数据，避免把假数据带进线上。
 */
export const BRAND_BUSINESS = 'teahour';
export const BRAND_BUSINESS_NAME = '时叙';

const MODE =
  (import.meta.env && import.meta.env.VITE_BRAND_MEMBER_MODE) ||
  (import.meta.env && import.meta.env.PROD ? 'server' : 'mock');
const GAME_URL =
  (import.meta.env && import.meta.env.VITE_BRAND_GAME_URL) || '';

export const isMock = MODE === 'mock';
/** 购卡支付尚未接入时，页面必须明确说「暂不能开通」，不能跳过后台直接开卡。 */
export const purchaseMode = isMock ? 'mock' : 'unavailable';

export const CARD_PRODUCTS = [
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
];

// 仅用于本地合成数据；线上权益标题与说明一律以 CRM 返回为准。
const BENEFITS = [
  {
    business: 'teahour',
    title: '时叙 · 会员茶饮权益',
    desc: '会员专属茶饮权益，具体内容以门店公示为准'
  },
  {
    business: 'retreat',
    title: '轻疗 · 项目会员价',
    desc: '提前一天预约享会员价，当日预约另有会员价'
  },
  {
    business: 'presence',
    title: '在场 · 优先排位与阶梯价',
    desc: '热门课程优先排位，课程享会员阶梯价'
  }
];

const POINTS_SPEND = {
  teahour: 'display_only',
  presence: 'display_only',
  retreat: '1_point_1_yuan'
};

function daysFromNow(iso) {
  const end = new Date(`${iso}T23:59:59+08:00`).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

function annualCard() {
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
  };
}

function nowText() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 本地联调状态：开通后写内存，刷新回到初始值。 */
let mockState = createMockState('ACTIVE');

export function createMockState(cardState = 'ACTIVE') {
  return {
    member: {
      memberNo: 'FY-2026-008812',
      name: '林小满',
      phoneMasked: '138****6620'
    },
    card: cardState === 'NONE' ? { state: 'NONE' } : annualCard(),
    points: {
      balance: 1280,
      expiring: 120,
      expireAt: '2027-01-01',
      spend: { ...POINTS_SPEND }
    },
    dice: {
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
          business: 'sx',
          external: 'teahour',
          title: '来时叙喝杯茶',
          text: '只差一点点了，来时叙喝杯茶，或带一份茶礼回家。'
        }
      }
    },
    prizes: { pending: 1 },
    savedCents: 8600,
    renewal: { show: false, savedCents: 8600, remainingDays: null, text: '' },
    notices:
      cardState === 'NONE'
        ? []
        : [
            {
              id: 'notice-winter',
              title: '冬季会员礼遇',
              body: '十二月起，会员到店可试饮新一季的桂圆红枣茶；年卡礼与会员故事也在陆续更新。',
              pinned: true,
              store: '上海·徐汇店',
              coverUrl: '/static/tea.webp',
              expireAt: '2026-12-31',
              publishedAt: '2026-11-09'
            },
            {
              id: 'notice-tea-table',
              title: '周日围炉茶席',
              body: '本周日下午两点，静安店留了六席给年卡会员，想来的话提前和店员说一声。',
              pinned: false,
              store: '上海·静安店',
              coverUrl: '',
              expireAt: null,
              publishedAt: '2026-11-05'
            }
          ],
    vouchers:
      cardState === 'NONE'
        ? []
        : [
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
          ],
    benefits: BENEFITS.map((item) => ({ ...item })),
    businessCards: [],
    game: { enabled: cardState !== 'NONE', dice: 12 },
    updatedAt: nowText(),
    stale: false
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** 读取品牌会员身份、积分、骰子与卡期；产品目录只读 CRM 当前生效版本。 */
export async function loadBrandMember() {
  if (isMock) return clone({ ...mockState, products: CARD_PRODUCTS });
  const [me, catalog] = await Promise.all([
    request('/customer/brand-member/me'),
    request('/customer/brand-member/products').catch(() => null)
  ]);
  const products =
    catalog && Array.isArray(catalog.products) && catalog.products.length
      ? catalog.products
      : [];
  return { ...me, products };
}

export function quoteBrandCard(productCode) {
  const product =
    CARD_PRODUCTS.find((item) => item.code === productCode) || CARD_PRODUCTS[1];
  if (isMock) {
    return Promise.resolve({
      quoteId: `q_mock_${Date.now()}`,
      productCode: product.code,
      priceCents: product.priceCents,
      validDays: product.validDays,
      expiresAt: Date.now() + 30 * 60 * 1000
    });
  }
  return request('/customer/brand-member/quote', {
    method: 'POST',
    data: { productCode }
  });
}

/**
 * 支付成功后开卡。真实环境由时叙服务端在验签回调后调用 CRM；
 * 当前支付通道未接入，服务端会明确拒绝（PAYMENT_NOT_ENABLED），
 * 前端本地联调只用于把身份页状态走通，不冒充真实支付。
 */
export function issueBrandCard({ quote, orderRef, paidCents }) {
  if (isMock) {
    if (paidCents !== quote.priceCents) {
      return Promise.reject(new Error('AMOUNT_MISMATCH'));
    }
    const product =
      CARD_PRODUCTS.find((item) => item.code === quote.productCode) ||
      CARD_PRODUCTS[1];
    const start = new Date();
    const end = new Date(start.getTime() + product.validDays * 86400000);
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
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
      dice: { ...mockState.dice, balance: mockState.dice.balance || 2 },
      game: { enabled: true, dice: mockState.dice.balance || 2 },
      updatedAt: nowText()
    };
    return Promise.resolve({ orderRef, card: clone(mockState.card) });
  }
  return request('/customer/brand-member/purchase', {
    method: 'POST',
    data: { productCode: quote && quote.productCode }
  });
}

/**
 * 愈行之旅地址：ticket 由 CRM 生成，5 分钟有效。
 * 正式环境每次点击都向服务端换新票据，避免身份页停留过久后票据过期。
 */
export function requestGameTicket() {
  if (isMock) return Promise.resolve({ url: gameUrlFor('mock') });
  return request('/customer/brand-member/game/ticket', { method: 'POST' });
}

/** mock 演示地址：按业务带上 embed 与 host。 */
export function gameUrlFor(ticket = '') {
  const override = safeStorage('fy.brand.gameUrl');
  const base = override || GAME_URL;
  if (!base) return '';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}embed=1&host=${BRAND_BUSINESS}${
    ticket ? `&ticket=${encodeURIComponent(ticket)}` : ''
  }`;
}

export function setMockCardState(state) {
  mockState = createMockState(state);
  return clone(mockState);
}

/**
 * 会员码兑换：渠道、天数、名额、截止均由 CRM 判定；
 * 身份由服务端固定为当前登录顾客，前端只提交码本身。
 */
export function claimGiftCode(code) {
  const normalized = String(code || '').replace(/\s+/g, '').toUpperCase();
  if (isMock) {
    if (!/^[A-Z0-9]{4,16}$/.test(normalized)) {
      return Promise.reject(new Error('会员码为 4–16 位字母或数字'));
    }
    if (normalized === 'FULL0001') return Promise.reject(new Error('该会员码名额已满'));
    if (mockState.card.state === 'NONE') mockState = createMockState('ACTIVE');
    return Promise.resolve({ card: clone(mockState.card), days: 30, replayed: false });
  }
  return request('/customer/brand-member/gift/claim', {
    method: 'POST',
    data: { code: normalized }
  });
}

/** 意见反馈：仅有效会员可提交；allowQuote 表示同意被整理进会员故事（匿名化处理）。 */
export function submitFeedback(content, allowQuote) {
  if (isMock) return Promise.resolve({ ok: true, id: `FB-MOCK-${Date.now()}` });
  return request('/customer/brand-member/feedback', {
    method: 'POST',
    data: { content: String(content || '').trim(), allowQuote: Boolean(allowQuote) }
  });
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
          story: '她每周三下班先来时叙喝一杯醒，再去在场上一节舒展课。',
          business: 'sx',
          publishedAt: '2026-11-01'
        }
      ]
    });
  }
  return request('/customer/brand-member/stories');
}

export function voucherStatusLabel(status) {
  return (
    { ISSUED: '待领取', REDEEMED: '已领取', VOID: '已作废', EXPIRED: '已过期' }[status] || '待领取'
  );
}

function safeStorage(key) {
  try {
    return uni.getStorageSync(key) || '';
  } catch (error) {
    return '';
  }
}

export function formatYuan(cents) {
  const value = Number(cents || 0) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatDate(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
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
  );
}

export function benefitFor(benefits, business) {
  return (benefits || []).find((item) => item.business === business) || null;
}

/**
 * 扫会员码小程序码进入时，微信把 scene 放在 onLoad options.scene。
 * 统一格式 `g=会员码`；同时兼容开发工具/落地页用 ?g=CODE 调试。
 */
export const PENDING_GIFT_KEY = 'fy.brand.pendingGift';
const PENDING_GIFT_TTL_MS = 24 * 60 * 60 * 1000;

export function parseGiftScene(options = {}) {
  const raw = String(options.scene || options.g || '').trim();
  if (!raw) return '';
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch (error) {
    text = raw;
  }
  const matched = /^g=([A-Za-z0-9]{4,16})$/.exec(text.trim());
  return matched ? matched[1].toUpperCase() : '';
}

export function stashPendingGift(code) {
  if (!/^[A-Z0-9]{4,16}$/.test(String(code || ''))) return;
  try {
    uni.setStorageSync(PENDING_GIFT_KEY, { code: String(code), at: Date.now() });
  } catch (error) {
    /* storage unavailable */
  }
}

export function peekPendingGift() {
  try {
    const saved = uni.getStorageSync(PENDING_GIFT_KEY);
    if (!saved || !saved.code) return '';
    if (saved.at && Date.now() - Number(saved.at) > PENDING_GIFT_TTL_MS) {
      uni.removeStorageSync(PENDING_GIFT_KEY);
      return '';
    }
    return String(saved.code);
  } catch (error) {
    return '';
  }
}

export function takePendingGift() {
  const code = peekPendingGift();
  try {
    uni.removeStorageSync(PENDING_GIFT_KEY);
  } catch (error) {
    /* storage unavailable */
  }
  return code;
}
