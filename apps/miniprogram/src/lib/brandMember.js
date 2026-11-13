import { request } from '../api/request';

/**
 * 品牌会员（Full愈年卡）客户端适配层。
 *
 * 线上只走时叙服务端代理（/customer/brand-member/*）：签名密钥只留在服务端，
 * 会员身份固定取当前登录顾客。会员身份、卡期、积分、骰子、产品目录与权益说明
 * 一律以 CRM 为准，前端不保留合成会员、卡期或价目表，也不信任本地传入的金额。
 */
export const BRAND_BUSINESS = 'teahour';

const GAME_URL =
  (import.meta.env && import.meta.env.VITE_BRAND_GAME_URL) || '';

/** 读取品牌会员身份、积分、骰子与卡期；产品目录只读 CRM 当前生效版本。 */
export async function loadBrandMember() {
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

/**
 * 产品目录（公开价目）：登录前后都读 CRM 当前生效版本，用于首页会员入口报价。
 * 失败返回空数组，页面不回落本地价目表。
 */
export async function loadBrandProducts() {
  try {
    const body = await request('/brand-member/products', { auth: false });
    return body && Array.isArray(body.products) ? body.products : [];
  } catch (error) {
    return [];
  }
}

/**
 * 愈行之旅地址：ticket 由 CRM 生成，5 分钟有效。
 * 正式环境每次点击都向服务端换新票据，避免身份页停留过久后票据过期。
 */
export function requestGameTicket() {
  return request('/customer/brand-member/game/ticket', { method: 'POST' });
}

/** 按业务带上 embed 与 host；地址由环境变量配置，不在页面里写死。 */
export function gameUrlFor(ticket = '') {
  const override = safeStorage('fy.brand.gameUrl');
  const base = override || GAME_URL;
  if (!base) return '';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}embed=1&host=${BRAND_BUSINESS}${
    ticket ? `&ticket=${encodeURIComponent(ticket)}` : ''
  }`;
}

/**
 * 会员码兑换：渠道、天数、名额、截止均由 CRM 判定；
 * 身份由服务端固定为当前登录顾客，前端只提交码本身。
 */
export function claimGiftCode(code) {
  const normalized = String(code || '').replace(/\s+/g, '').toUpperCase();
  return request('/customer/brand-member/gift/claim', {
    method: 'POST',
    data: { code: normalized }
  });
}

/** 意见反馈：仅有效会员可提交；allowQuote 表示同意被整理进会员故事（匿名化处理）。 */
export function submitFeedback(content, allowQuote) {
  return request('/customer/brand-member/feedback', {
    method: 'POST',
    data: { content: String(content || '').trim(), allowQuote: Boolean(allowQuote) }
  });
}

/** 会员故事：仅有效会员可读；非会员时服务端返回 403，页面不展示该区块。 */
export function loadStories() {
  return request('/customer/brand-member/stories');
}

/**
 * 购卡下单：只提交产品编码，金额由服务端按 CRM 实时报价决定；
 * 返回值含 wx.requestPayment 参数与 prepayMode（是否真实扣款）。
 */
export function purchaseCard(productCode) {
  return request('/customer/brand-member/purchase', {
    method: 'POST',
    data: { productCode: String(productCode || '') }
  });
}

/** 最近一张会员卡订单：支付后轮询它收敛状态，服务端会顺手向渠道查一次。 */
export function latestCardOrder() {
  return request('/customer/brand-member/orders/latest');
}

/** 单张会员卡订单（轮询用，避免被顾客随后新建的单顶掉）。 */
export function loadCardOrder(orderId) {
  return request(`/customer/brand-member/orders/${encodeURIComponent(orderId)}`);
}

/** 顾客放弃支付：关闭本单，未扣款。若其实已付款，迟到回调仍会开卡。 */
export function closeCardOrder(orderId) {
  return request(`/customer/brand-member/orders/${encodeURIComponent(orderId)}/close`, {
    method: 'POST'
  });
}

/**
 * 支付完成后服务端确认。
 * 渠道异步通知可能晚于 wx.requestPayment 返回，这里只轮询服务端状态；
 * 回调没到之前不本地假定成功，也不会因为「开卡中」就提示已开通。
 *
 * 「已付款、开卡没确认」不再直接放弃：服务端会按退避自动重开，而每次轮询本身
 * 也会推它一把，所以这里继续多等几轮，把自动重试的结果等回来（约 12 秒）。
 */
export async function confirmCardOrder(orderId, attempts = 13) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await loadCardOrder(orderId);
      const order = result && result.order;
      if (order) {
        last = order;
        if (order.issueStatus === 'issued') return order;
        // 钱没到而单已失败/关闭，等下去也不会变：如实返回，由页面说明。
        if (order.payStatus === 'failed' || order.payStatus === 'closed') return order;
      }
    } catch (error) {
      // 网络抖动继续等下一轮；最终未确认由调用方如实提示。
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }
  return last;
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
