// 顾客端双语文案，逐条对应 teahour-app/web 顾客端 CustomerApp.tsx。

export const SPEC_EN = {
  热: 'Hot',
  冰: 'Iced',
  冰镇: 'Chilled',
  标准冰: 'Regular ice',
  少冰: 'Less ice',
  去冰: 'No ice',
  热饮: 'Hot',
  杯: 'cup',
  瓶: 'bottle',
  枚: 'pack',
  盒: 'box',
  袋: 'bag'
};

export const STATUS_EN = {
  unpaid: 'Unpaid',
  pending: 'Preparing',
  ready: 'Ready',
  awaiting: 'To collect',
  delivered: 'Collected',
  refunded: 'Refunded',
  cancelled: 'Cancelled'
};

const STATUS_ZH = {
  unpaid: '待支付',
  pending: '制作中',
  ready: '已出餐',
  awaiting: '待提货',
  delivered: '已交付',
  refunded: '已退款',
  cancelled: '已取消'
};

export function t(locale, zh, en) {
  return locale === 'en' ? en : zh;
}

export function pname(locale, product) {
  if (!product) return '';
  return locale === 'en' ? product.nameEn || product.name : product.name;
}

export function sname(locale, store) {
  if (!store) return '';
  return locale === 'en' ? store.nameEn || store.name : store.name;
}

export function spec(locale, value) {
  if (locale !== 'en') return value;
  if (SPEC_EN[value]) return SPEC_EN[value];
  return String(value).replace('吧台', 'Counter ').replace('窗边', 'Window ').replace('桌', ' Table');
}

export function ostatus(locale, status) {
  return locale === 'en' ? STATUS_EN[status] || status : STATUS_ZH[status] || status;
}

export function orderLabel(locale, order) {
  if (order.business === 'retail') return t(locale, '任意门店领取', 'Pickup at any store');
  if (order.type === 'dine') return order.seat ? spec(locale, order.seat) : t(locale, '取餐口自取', 'Counter pickup');
  if (order.type === 'takeaway') return t(locale, '现场外带', 'Takeaway');
  if (order.channel === 'meituan') return '美团外卖';
  if (order.channel === 'taobao') return '淘宝闪购';
  return t(locale, '平台外卖', 'Delivery');
}
