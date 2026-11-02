import type { Series } from './types';

export function money(cents: number | null | undefined, options: { sign?: boolean; decimals?: boolean } = {}) {
  const value = Number(cents || 0) / 100;
  const showDecimals = options.decimals ?? Math.abs(Number(cents || 0)) % 100 !== 0;
  const text = value.toLocaleString('zh-CN', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2
  });
  const prefix = options.sign && value > 0 ? '+' : '';
  return `${prefix}¥${text}`;
}

export function compactMoney(cents: number | null | undefined) {
  const value = Math.abs(Number(cents || 0)) / 100;
  if (value >= 10000) return `¥${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  return money(cents);
}

export function percent(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function timeText(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateTimeText(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fullDateTimeText(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

export function dateText(value: string | number | null | undefined) {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayText() {
  return dateText(Date.now());
}

export function minutesAgo(ts: number, now = Date.now()) {
  return Math.max(0, Math.floor((now - ts) / 60000));
}

export const SERIES: Record<
  Series,
  { char: string; name: string; nameEn: string; className: string; color: string; phrase: string; phraseEn: string; note: string }
> = {
  xing: {
    char: '醒',
    name: '醒',
    nameEn: 'GOOD DAY',
    className: 'xing',
    color: 'apricot',
    phrase: '进入今天的状态',
    phraseEn: 'A brighter beginning',
    note: '明亮的开始'
  },
  song: {
    char: '松',
    name: '松',
    nameEn: 'CHILL',
    className: 'song',
    color: 'sage',
    phrase: '给日间留个停顿',
    phraseEn: 'A pause in your day',
    note: '给自己一段留白'
  },
  qing: {
    char: '庆',
    name: '庆',
    nameEn: 'CHEERS',
    className: 'qing',
    color: 'rose',
    phrase: '为此刻碰杯',
    phraseEn: 'Here’s to this moment',
    note: '为此刻碰杯'
  },
  mian: {
    char: '眠',
    name: '眠',
    nameEn: 'GOOD NIGHT',
    className: 'mian',
    color: 'lilac',
    phrase: '把夜晚慢下来',
    phraseEn: 'Ease into the evening',
    note: '把夜晚慢下来'
  },
  retail: {
    char: '零',
    name: '零售',
    nameEn: 'RETAIL',
    className: 'retail',
    color: 'blue',
    phrase: '把喜欢的茶带回家',
    phraseEn: 'A ritual to take home',
    note: '把喜欢的茶带回家'
  }
};

export const STATUS_LABEL: Record<string, string> = {
  unpaid: '待支付',
  pending: '制作中',
  ready: '待取餐',
  awaiting: '待提货',
  delivered: '已交付',
  refunded: '已退款',
  cancelled: '已取消',
  paid: '已支付',
  failed: '支付失败',
  queued: '待打印',
  printed: '已打印',
  none: '无需打印',
  approved: '已通过',
  rejected: '已驳回'
};

export const CHANNEL_LABEL: Record<string, string> = {
  mini: '小程序',
  assisted: '伙伴代点',
  meituan: '美团外卖',
  taobao: '淘宝闪购'
};

export const ORDER_TYPE_LABEL: Record<string, string> = {
  dine: '堂食',
  takeaway: '现场外带',
  delivery: '平台外卖',
  retail: '零售'
};

export const EXPENSE_CATEGORIES = [
  { id: 'labor', name: '人力', nameEn: 'Labor' },
  { id: 'rent', name: '租金', nameEn: 'Rent' },
  { id: 'hq', name: '总部管理费', nameEn: 'HQ management' },
  { id: 'utilities', name: '水电物业', nameEn: 'Utilities' },
  { id: 'marketing', name: '营销推广', nameEn: 'Marketing' },
  { id: 'other', name: '其他', nameEn: 'Other' }
] as const;

export function statusTone(status: string) {
  if (['ready', 'delivered', 'approved', 'printed', 'online', 'paid'].includes(status)) return 'ok';
  if (['pending', 'awaiting', 'queued', 'unpaid'].includes(status)) return 'warn';
  if (['refunded', 'cancelled', 'rejected', 'failed', 'offline'].includes(status)) return 'danger';
  return 'neutral';
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

export function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
