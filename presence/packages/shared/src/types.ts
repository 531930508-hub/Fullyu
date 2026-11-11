/**
 * Full愈 共享类型定义
 * 前后端通用的数据模型和接口类型
 */

// ========== 用户相关 ==========

/** 用户身份类型 */
export enum UserRole {
  /** 普通注册用户 */
  NORMAL = 'NORMAL',
  /** 会员用户 */
  MEMBER = 'MEMBER',
  /** 培训师 */
  TRAINER = 'TRAINER',
}

/** 会员卡类型 */
export enum MemberCardType {
  MONTHLY = 'MONTHLY',     // 月卡
  QUARTERLY = 'QUARTERLY', // 季卡
  YEARLY = 'YEARLY',       // 年卡
}

/** 会员卡状态 */
export enum MemberCardStatus {
  ACTIVE = 'ACTIVE',       // 有效
  FROZEN = 'FROZEN',       // 冻结
  EXPIRED = 'EXPIRED',     // 过期
}

/** 用户基础信息 */
export interface IUser {
  id: string
  phone: string
  nickname: string
  avatar?: string
  roles: UserRole[]
  language: 'zh' | 'en'
  createdAt: string
  updatedAt: string
}

// ========== 课程相关 ==========

/** 课程类型 */
export enum CourseType {
  SINGLE = 'SINGLE',   // 单次课程
  SERIES = 'SERIES',   // 系列课程
}

/** 排课方式 */
export enum ScheduleType {
  ONE_TIME = 'ONE_TIME', // 单次排课
  WEEKLY = 'WEEKLY',     // 每周周期排课
}

/** 课程分类标签 */
export enum CourseCategory {
  MINDFULNESS = 'MINDFULNESS',  // 正念
  SOUND = 'SOUND',              // 音声
  DRAMA = 'DRAMA',              // 戏剧
  DANCE = 'DANCE',              // 舞动
  ESSENTIAL_OIL = 'ESSENTIAL_OIL', // 精油
  OTHER = 'OTHER',              // 其他
}

/** 课程状态 */
export enum CourseStatus {
  DRAFT = 'DRAFT',         // 暂存
  PUBLISHED = 'PUBLISHED', // 生效
  CANCELLED = 'CANCELLED', // 已取消
  COMPLETED = 'COMPLETED', // 已完成
  EXPIRED = 'EXPIRED',     // 失效
}

/** 阶梯价格区间（按报名顺序锁价） */
export interface IPriceTier {
  seatFrom: number   // 区间起（含）
  seatTo: number     // 区间止（含）
  price: number      // 该区间价格
}

/** 课程会员折扣（按卡类型） */
export interface ICourseMemberDiscount {
  cardType: MemberCardType
  discountPercent: number // 折扣百分比，如 70 表示 7 折
}

/** 退款规则区间 */
export interface IRefundRule {
  hoursFrom: number    // 距开课小时数下界（含）
  hoursTo: number | null // 距开课小时数上界；null 表示无上界
  refundPercent: number // 退款百分比 0-100
}

/** 课程信息 */
export interface ICourse {
  id: string
  title: string
  coverImage: string
  gallery?: string[]
  type: CourseType
  categories: CourseCategory[]
  description: string
  targetAudience?: string[]
  learningGoals?: string
  scheduleType?: ScheduleType
  weekdays?: number[]
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  trainerId: string
  trainerName: string
  trainerAvatar?: string
  minCapacity: number
  maxCapacity: number
  currentEnrolled: number
  originalPrice: number
  priceTiers?: IPriceTier[]
  memberDiscounts?: ICourseMemberDiscount[]
  refundRules?: IRefundRule[]
  waitlistEnabled?: boolean
  waitlistDeadlineHours?: number
  memberWaitlistSeats?: number
  venueId: string
  venueName: string
  status: CourseStatus
  createdAt: string
}

// ========== 订单相关 ==========

/** 订单状态 */
export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT', // 待支付
  PAID = 'PAID',                       // 已支付（待开课）
  COMPLETED = 'COMPLETED',             // 已完成
  CANCELLED = 'CANCELLED',             // 已取消
  REFUNDING = 'REFUNDING',             // 退款中
  REFUNDED = 'REFUNDED',               // 已退款
}

/** 订单类型 */
export enum OrderType {
  COURSE = 'COURSE',           // 普通课程报名
  WAITLIST = 'WAITLIST',       // 候补报名（预付）
  MEMBER_CARD = 'MEMBER_CARD', // 会员卡购买
}

/** 订单信息 */
export interface IOrder {
  id: string
  userId: string
  orderType: OrderType
  courseId?: string
  courseName?: string
  memberCardProductId?: string
  memberCardId?: string
  cardType?: MemberCardType
  originalPrice: number
  discountAmount: number
  pointsDeduction: number
  voucherDeduction: number
  actualPaid: number
  status: OrderStatus
  paymentTime?: string
  cancelTime?: string
  cancelReason?: string
  refundAmount?: number
  createdAt: string
}

// ========== 会员卡商品 ==========

/** 会员卡商品状态 */
export enum MemberCardProductStatus {
  ON_SHELF = 'ON_SHELF',   // 上架
  OFF_SHELF = 'OFF_SHELF', // 下架
}

/** 会员卡商品 */
export interface IMemberCardProduct {
  id: string
  type: MemberCardType
  name: string
  price: number
  durationDays: number
  description?: string
  benefits: string[]
  status: MemberCardProductStatus
  sort: number
  createdAt?: string
}

// ========== 候补队列（预付 + 双队列） ==========

/** 候补席位类型 */
export enum WaitlistSeatType {
  MEMBER = 'MEMBER',   // 会员候补席位
  NORMAL = 'NORMAL',   // 普通候补席位
}

/** 候补状态 */
export enum WaitlistStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT', // 待支付（已锁价/锁顺序）
  WAITING = 'WAITING',                 // 已支付，排队中
  CONVERTED = 'CONVERTED',             // 已递补上课
  CANCELLED = 'CANCELLED',             // 未支付超时/取消
  REFUNDED = 'REFUNDED',               // 未轮上或主动退出，已退款
}

/** 候补记录 */
export interface IWaitlistEntry {
  id: string
  courseId: string
  userId: string
  seatType: WaitlistSeatType
  position: number
  orderId?: string
  lockedPrice: number
  status: WaitlistStatus
  paidAt?: string
  convertedAt?: string
  refundedAt?: string
  createdAt: string
}

// ========== 积分与代金券 ==========

/** 积分变动类型 */
export enum PointsChangeType {
  COURSE_REWARD = 'COURSE_REWARD',     // 上课奖励
  REVIEW_REWARD = 'REVIEW_REWARD',     // 评价奖励
  CONSUMPTION = 'CONSUMPTION',          // 消费抵扣
  EXCHANGE = 'EXCHANGE',                // 积分兑换
  ADMIN_ADJUST = 'ADMIN_ADJUST',        // 管理员调整
  OTHER = 'OTHER',                      // 其他奖励
}

/** 代金券状态 */
export enum VoucherStatus {
  UNUSED = 'UNUSED',     // 未使用
  USED = 'USED',         // 已使用
  EXPIRED = 'EXPIRED',   // 已过期
  REVOKED = 'REVOKED',   // 已回收
}

/** 代金券信息 */
export interface IVoucher {
  id: string
  /** 兑换码批次券在被领取前不归属用户 */
  userId?: string | null
  mode?: 'REDUCE_BY' | 'REDUCE_TO'
  amount: number
  targetPrice?: number | null
  applicableCourseIds?: string[]
  applicableAll: boolean
  expiresAt: string
  status: VoucherStatus
  source: string
  usedAt?: string
  createdAt: string
  /** 兑换码（批量发券） */
  redeemCode?: string | null
  /** 发券批次号 */
  batchNo?: string | null
  /** 兑换时间 */
  redeemedAt?: string | null
}

// ========== 任务相关（培训师） ==========

/** 任务状态 */
export enum TaskStatus {
  PUBLISHED = 'PUBLISHED',   // 已发布
  CLAIMED = 'CLAIMED',       // 已领取
  COMPLETED = 'COMPLETED',   // 已完成
  CANCELLED = 'CANCELLED',   // 已取消
}

/** 任务信息 */
export interface ITask {
  id: string
  title: string
  description: string
  seedsReward: number
  maxParticipants: number
  currentParticipants: number
  scope: 'ALL' | 'SPECIFIC'
  specificTrainerIds?: string[]
  status: TaskStatus
  createdAt: string
}

// ========== 后台管理相关 ==========

/** 后台用户角色 */
export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',   // 超级管理员
  EDUCATION = 'EDUCATION',        // 教务
  SALES = 'SALES',                // 销售
  VIEWER = 'VIEWER',              // 只读
}

// ========== 通用类型 ==========

/** 分页请求 */
export interface IPaginationQuery {
  page: number
  pageSize: number
}

/** 分页响应 */
export interface IPaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** API 统一响应 */
export interface IApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/** 语言类型 */
export type Language = 'zh' | 'en'
