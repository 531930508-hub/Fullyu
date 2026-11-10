/**
 * Full愈 共享常量
 */

/**
 * @deprecated 退款规则已改为课程级可配置（Course.refundRules）。
 * 此处仅作为新建课程时的默认值参考，实际以课程配置为准。
 */
export const DEFAULT_REFUND_RULES = [
  { hoursFrom: 48, hoursTo: null, refundPercent: 100 }, // 开课前48小时以上 - 全额退
  { hoursFrom: 24, hoursTo: 48, refundPercent: 80 },    // 24-48小时 - 退80%
  { hoursFrom: 2, hoursTo: 24, refundPercent: 50 },     // 2-24小时 - 退50%
  { hoursFrom: 0, hoursTo: 2, refundPercent: 0 },       // 2小时内 - 不退
] as const

/** 席位锁定时长（分钟）——报名/候补/会员卡购买统一下单锁定时长 */
export const SEAT_LOCK_DURATION_MINUTES = 10

/** 会员候补席位默认数量 */
export const DEFAULT_MEMBER_WAITLIST_SEATS = 3

/** 候补截止时间可选项（开课前小时数，0.5 表示半小时） */
export const WAITLIST_DEADLINE_OPTIONS = [48, 24, 6, 1, 0.5] as const

/** 会员冻结阈值（连续未出席次数） */
export const MEMBER_FREEZE_THRESHOLD = 3

/** 积分兑换比例：1积分 = 1元 */
export const POINTS_TO_YUAN_RATIO = 1

/** 课程标题最大长度 */
export const COURSE_TITLE_MAX_LENGTH = 30

/** 课程简介最大长度 */
export const COURSE_DESC_MAX_LENGTH = 500

/** 会员到期提醒天数 */
export const MEMBER_EXPIRY_REMIND_DAYS = [7, 3, 1] as const

/** 课程提醒时间（小时） */
export const COURSE_REMIND_HOURS = [24, 3] as const

/** 每日待支付提醒时间 */
export const DAILY_PAYMENT_REMIND_HOUR = 10

/** 课程分类标签（默认） */
export const DEFAULT_COURSE_CATEGORIES = [
  { key: 'MINDFULNESS', zh: '正念', en: 'Mindfulness' },
  { key: 'SOUND', zh: '音声', en: 'Sound Healing' },
  { key: 'DRAMA', zh: '戏剧', en: 'Drama Therapy' },
  { key: 'DANCE', zh: '舞动', en: 'Dance Movement' },
  { key: 'ESSENTIAL_OIL', zh: '精油', en: 'Essential Oil' },
  { key: 'OTHER', zh: '其他', en: 'Other' },
] as const
