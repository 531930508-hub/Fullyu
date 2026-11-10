export const SERIES = {
  xing: {
    char: '醒',
    name: '醒',
    nameEn: 'GOOD DAY',
    phrase: '进入今天的状态',
    phraseEn: 'A brighter beginning',
    lineEn: 'Off the snooze, start the day.',
    color: 'apricot',
    liquid: '#b88355'
  },
  song: {
    char: '松',
    name: '松',
    nameEn: 'CHILL',
    phrase: '给日间留个停顿',
    phraseEn: 'A pause in your day',
    lineEn: 'Off the hook, just chill.',
    color: 'sage',
    liquid: '#c29849'
  },
  qing: {
    char: '庆',
    name: '庆',
    nameEn: 'CHEERS',
    phrase: '为此刻碰杯',
    phraseEn: 'Here’s to this moment',
    lineEn: 'Off work, time to cheers.',
    color: 'rose',
    liquid: '#9b985c'
  },
  mian: {
    char: '眠',
    name: '眠',
    nameEn: 'GOOD NIGHT',
    phrase: '把夜晚慢下来',
    phraseEn: 'Ease into the evening',
    lineEn: 'Off the day, call it a night.',
    color: 'lilac',
    liquid: '#96714b'
  },
  retail: {
    char: '零',
    name: '零售',
    nameEn: 'RETAIL',
    phrase: '把喜欢的茶带回家',
    phraseEn: 'A ritual to take home',
    color: 'blue',
    liquid: '#c6b789'
  }
};

export const STATUS_LABEL = {
  unpaid: '待支付',
  pending: '制作中',
  ready: '已出餐',
  awaiting: '待提货',
  delivered: '已交付',
  refunded: '已退款',
  cancelled: '已取消'
};

export const STATUS_TONE = {
  pending: 'warn',
  unpaid: 'warn',
  ready: 'ok',
  awaiting: 'warn',
  delivered: 'ok',
  refunded: 'danger',
  cancelled: 'danger'
};

export const ORDER_TYPE_LABEL = {
  dine: '堂食',
  takeaway: '外带',
  delivery: '外卖',
  retail: '零售'
};

export const UNIT_STATUS_LABEL = {
  pending: '待制作',
  ready: '已出餐',
  delivered: '已交付'
};

export function seriesMeta(key) {
  return SERIES[key] || SERIES.retail;
}

export function money(cents) {
  const value = Number(cents || 0) / 100;
  const decimals = Math.abs(Number(cents || 0)) % 100 !== 0;
  return `¥${value.toFixed(decimals ? 2 : 0)}`;
}

export function dateTimeText(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeText(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function orderTitle(order) {
  if (order.business === 'retail') return '零售自提';
  if (order.type === 'dine') return `堂食 · ${order.seat || '取餐口自取'}`;
  return '现场外带';
}

export function itemsSummary(order) {
  const first = order.items && order.items[0];
  if (!first) return '';
  const count = order.items.reduce((n, item) => n + item.qty, 0);
  return count > 1 ? `${first.name} 等 ${count} 件` : `${first.name} × ${first.qty}`;
}
