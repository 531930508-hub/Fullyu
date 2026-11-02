export type SeriesKey = 'xing' | 'song' | 'qing' | 'mian' | 'retail';

export const SERIES: Record<
  SeriesKey,
  { char: string; name: string; nameEn: string; color: string; phrase: string; phraseEn: string }
> = {
  xing: { char: '醒', name: '醒', nameEn: 'GOOD DAY', color: 'apricot', phrase: '进入今天的状态', phraseEn: 'A brighter beginning' },
  song: { char: '松', name: '松', nameEn: 'CHILL', color: 'sage', phrase: '给日间留个停顿', phraseEn: 'A pause in your day' },
  qing: { char: '庆', name: '庆', nameEn: 'CHEERS', color: 'rose', phrase: '为此刻碰杯', phraseEn: "Here's to this moment" },
  mian: { char: '眠', name: '眠', nameEn: 'GOOD NIGHT', color: 'lilac', phrase: '把夜晚慢下来', phraseEn: 'Ease into the evening' },
  retail: { char: '零', name: '零售', nameEn: 'RETAIL', color: 'blue', phrase: '把喜欢的茶带回家', phraseEn: 'A ritual to take home' }
};

export const TEAS = ['热', '冰'] as const;
export type Temp = (typeof TEAS)[number];

/** 冰量选项顺序即展示顺序；热饮隐藏冰量，切冷默认标准冰。 */
export const ICE_OPTIONS = ['标准冰', '少冰', '去冰'] as const;
export type Ice = (typeof ICE_OPTIONS)[number];

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

/** 直接退款无需审批的限额（分）。 */
export const REFUND_DIRECT_LIMIT_CENTS = 5000;

/** 单笔报损需总部审批的阈值（分）。 */
export const LOSS_APPROVAL_THRESHOLD_CENTS = 10000;

/** 月度损耗率预警线（百分比）。 */
export const LOSS_MONTHLY_WARN_PERCENT = 3;
