/**
 * 订单 / 候补 / 课程数据状态的前端展示口径（后台与小程序共用）。
 *
 * 只收录后端确实会返回的状态；未知值不猜测、不归入默认业务状态，
 * 由调用方决定原样展示还是提示「未知」。
 */

import {
  CommunityStatus,
  CourseStatus,
  MemberCardProductStatus,
  MemberCardStatus,
  MemberCardType,
  OrderStatus,
  OrderType,
  TaskClaimStatus,
  TaskStatus,
  VoucherStatus,
  WaitlistStatus,
} from './types'

export interface StatusMeta {
  /** 中文文案 */
  zh: string
  /** 英文文案 */
  en: string
  /** 后台 a-tag 颜色 */
  color: string
}

/** 订单状态：与 Prisma OrderStatus 一一对应 */
export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  PENDING_PAYMENT: { zh: '待支付', en: 'Payment due', color: 'orange' },
  PAID: { zh: '已支付', en: 'Paid', color: 'green' },
  COMPLETED: { zh: '已完成', en: 'Completed', color: 'cyan' },
  CANCELLED: { zh: '已取消', en: 'Cancelled', color: 'default' },
  REFUNDING: { zh: '退款中', en: 'Refunding', color: 'orange' },
  REFUNDED: { zh: '已退款', en: 'Refunded', color: 'red' },
}

/** 候补状态：与 Prisma WaitlistStatus 一一对应 */
export const WAITLIST_STATUS_META: Record<WaitlistStatus, StatusMeta> = {
  PENDING_PAYMENT: { zh: '待支付', en: 'Payment due', color: 'orange' },
  WAITING: { zh: '排队中', en: 'Waiting', color: 'blue' },
  CONVERTED: { zh: '已递补', en: 'Promoted', color: 'green' },
  CANCELLED: { zh: '已取消', en: 'Cancelled', color: 'default' },
  REFUNDED: { zh: '已退款', en: 'Refunded', color: 'red' },
}

/** 课程数据状态：与 Prisma CourseStatus 一一对应 */
export const COURSE_STATUS_META: Record<CourseStatus, StatusMeta> = {
  DRAFT: { zh: '草稿', en: 'Draft', color: 'default' },
  PUBLISHED: { zh: '已发布', en: 'Published', color: 'green' },
  CANCELLED: { zh: '已下架', en: 'Cancelled', color: 'red' },
  COMPLETED: { zh: '已完成', en: 'Completed', color: 'cyan' },
  EXPIRED: { zh: '已过期', en: 'Expired', color: 'default' },
}

/** 订单类型：与 Prisma OrderType 一一对应 */
export const ORDER_TYPE_META: Record<OrderType, StatusMeta> = {
  COURSE: { zh: '课程', en: 'Course', color: 'blue' },
  WAITLIST: { zh: '候补', en: 'Waitlist', color: 'orange' },
  MEMBER_CARD: { zh: '会员卡', en: 'Member card', color: 'purple' },
  COMMUNITY: { zh: '社群', en: 'Community', color: 'cyan' },
}

/** 会员卡类型：与 Prisma MemberCardType 一一对应 */
export const MEMBER_CARD_TYPE_META: Record<MemberCardType, StatusMeta> = {
  MONTHLY: { zh: '月卡', en: 'Monthly', color: 'blue' },
  QUARTERLY: { zh: '季卡', en: 'Quarterly', color: 'purple' },
  YEARLY: { zh: '年卡', en: 'Yearly', color: 'gold' },
}

/** 会员卡状态：与 Prisma MemberCardStatus 一一对应 */
export const MEMBER_CARD_STATUS_META: Record<MemberCardStatus, StatusMeta> = {
  ACTIVE: { zh: '有效', en: 'Active', color: 'green' },
  FROZEN: { zh: '冻结', en: 'Frozen', color: 'orange' },
  EXPIRED: { zh: '过期', en: 'Expired', color: 'default' },
}

/** 会员卡商品状态：与 Prisma MemberCardProductStatus 一一对应 */
export const MEMBER_CARD_PRODUCT_STATUS_META: Record<MemberCardProductStatus, StatusMeta> = {
  ON_SHELF: { zh: '已上架', en: 'On shelf', color: 'green' },
  OFF_SHELF: { zh: '已下架', en: 'Off shelf', color: 'default' },
}

/** 代金券状态：与 Prisma VoucherStatus 一一对应 */
export const VOUCHER_STATUS_META: Record<VoucherStatus, StatusMeta> = {
  UNUSED: { zh: '未使用', en: 'Unused', color: 'blue' },
  USED: { zh: '已使用', en: 'Used', color: 'green' },
  EXPIRED: { zh: '已过期', en: 'Expired', color: 'default' },
  REVOKED: { zh: '已作废', en: 'Revoked', color: 'red' },
}

/** 任务状态：与 Prisma TaskStatus 一一对应 */
export const TASK_STATUS_META: Record<TaskStatus, StatusMeta> = {
  PUBLISHED: { zh: '进行中', en: 'Ongoing', color: 'processing' },
  COMPLETED: { zh: '已完成', en: 'Completed', color: 'success' },
  CANCELLED: { zh: '已取消', en: 'Cancelled', color: 'default' },
}

/** 任务领取状态：与 Prisma TaskClaimStatus 一一对应 */
export const TASK_CLAIM_STATUS_META: Record<TaskClaimStatus, StatusMeta> = {
  CLAIMED: { zh: '已领取', en: 'Claimed', color: 'processing' },
  COMPLETED: { zh: '已完成', en: 'Completed', color: 'success' },
  CANCELLED: { zh: '已取消', en: 'Cancelled', color: 'default' },
}

/** 社群审核状态：与 Prisma CommunityStatus 一一对应 */
export const COMMUNITY_STATUS_META: Record<CommunityStatus, StatusMeta> = {
  PENDING: { zh: '待审核', en: 'Pending', color: 'orange' },
  APPROVED: { zh: '已通过', en: 'Approved', color: 'green' },
  REJECTED: { zh: '已驳回', en: 'Rejected', color: 'red' },
}

/** 下拉筛选项（顺序固定，避免依赖对象键顺序） */
export const ORDER_STATUS_OPTIONS = [
  { value: OrderStatus.PAID, ...ORDER_STATUS_META.PAID },
  { value: OrderStatus.PENDING_PAYMENT, ...ORDER_STATUS_META.PENDING_PAYMENT },
  { value: OrderStatus.COMPLETED, ...ORDER_STATUS_META.COMPLETED },
  { value: OrderStatus.REFUNDING, ...ORDER_STATUS_META.REFUNDING },
  { value: OrderStatus.REFUNDED, ...ORDER_STATUS_META.REFUNDED },
  { value: OrderStatus.CANCELLED, ...ORDER_STATUS_META.CANCELLED },
] as const

function pick(meta: Record<string, StatusMeta>, status?: string | null): StatusMeta | undefined {
  if (!status) return undefined
  return meta[status]
}

export function orderStatusMeta(status?: string | null): StatusMeta | undefined {
  return pick(ORDER_STATUS_META, status)
}

export function waitlistStatusMeta(status?: string | null): StatusMeta | undefined {
  return pick(WAITLIST_STATUS_META, status)
}

export function courseStatusMeta(status?: string | null): StatusMeta | undefined {
  return pick(COURSE_STATUS_META, status)
}

export function orderTypeMeta(type?: string | null): StatusMeta | undefined {
  return pick(ORDER_TYPE_META, type)
}

export function memberCardTypeMeta(type?: string | null): StatusMeta | undefined {
  return pick(MEMBER_CARD_TYPE_META, type)
}

export function memberCardStatusMeta(status?: string | null): StatusMeta | undefined {
  return pick(MEMBER_CARD_STATUS_META, status)
}

export function memberCardProductStatusMeta(status?: string | null): StatusMeta | undefined {
  return pick(MEMBER_CARD_PRODUCT_STATUS_META, status)
}

export function voucherStatusMeta(status?: string | null): StatusMeta | undefined {
  return pick(VOUCHER_STATUS_META, status)
}

export function taskStatusMeta(status?: string | null): StatusMeta | undefined {
  return pick(TASK_STATUS_META, status)
}

export function taskClaimStatusMeta(status?: string | null): StatusMeta | undefined {
  return pick(TASK_CLAIM_STATUS_META, status)
}

export function communityStatusMeta(status?: string | null): StatusMeta | undefined {
  return pick(COMMUNITY_STATUS_META, status)
}

/** 未知状态返回空字符串，调用方需自行兜底，不能默认成某个真实状态 */
export function statusMetaLabel(meta: StatusMeta | undefined, language: string = 'zh'): string {
  if (!meta) return ''
  return language === 'en' ? meta.en : meta.zh
}

export function orderStatusLabel(status?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(orderStatusMeta(status), language)
}

export function waitlistStatusLabel(status?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(waitlistStatusMeta(status), language)
}

export function courseStatusLabel(status?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(courseStatusMeta(status), language)
}

export function orderTypeLabel(type?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(orderTypeMeta(type), language)
}

export function memberCardTypeLabel(type?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(memberCardTypeMeta(type), language)
}

export function memberCardStatusLabel(status?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(memberCardStatusMeta(status), language)
}

export function memberCardProductStatusLabel(status?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(memberCardProductStatusMeta(status), language)
}

export function voucherStatusLabel(status?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(voucherStatusMeta(status), language)
}

export function taskStatusLabel(status?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(taskStatusMeta(status), language)
}

export function taskClaimStatusLabel(status?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(taskClaimStatusMeta(status), language)
}

export function communityStatusLabel(status?: string | null, language: string = 'zh'): string {
  return statusMetaLabel(communityStatusMeta(status), language)
}

/** 后台标签颜色；未知状态回落到 default */
export function statusMetaColor(meta: StatusMeta | undefined): string {
  return meta?.color || 'default'
}

export function orderStatusColor(status?: string | null): string {
  return statusMetaColor(orderStatusMeta(status))
}

export function waitlistStatusColor(status?: string | null): string {
  return statusMetaColor(waitlistStatusMeta(status))
}

export function courseStatusColor(status?: string | null): string {
  return statusMetaColor(courseStatusMeta(status))
}

export function orderTypeColor(type?: string | null): string {
  return statusMetaColor(orderTypeMeta(type))
}

export function memberCardTypeColor(type?: string | null): string {
  return statusMetaColor(memberCardTypeMeta(type))
}

export function memberCardStatusColor(status?: string | null): string {
  return statusMetaColor(memberCardStatusMeta(status))
}

export function memberCardProductStatusColor(status?: string | null): string {
  return statusMetaColor(memberCardProductStatusMeta(status))
}

export function voucherStatusColor(status?: string | null): string {
  return statusMetaColor(voucherStatusMeta(status))
}

export function taskStatusColor(status?: string | null): string {
  return statusMetaColor(taskStatusMeta(status))
}

export function taskClaimStatusColor(status?: string | null): string {
  return statusMetaColor(taskClaimStatusMeta(status))
}

export function communityStatusColor(status?: string | null): string {
  return statusMetaColor(communityStatusMeta(status))
}