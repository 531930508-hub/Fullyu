/**
 * 订单金额单位换算。
 *
 * 订单金额列（originalPrice / discountAmount / pointsDeduction /
 * voucherDeduction / actualPaid / refundAmount）的单位随订单类型而不同：
 * COURSE / WAITLIST 跟随课程价格链，单位为「分」；MEMBER_CARD 跟随卡商品
 * 价格，单位为「元」。凡是要换算到支付网关（分）或展示/统计（元），都必须
 * 经过本文件的函数，禁止在调用方直接乘除 100。
 */

import { POINTS_TO_YUAN_RATIO } from './constants'

/** 该订单类型的金额列是否以「分」为单位 */
export function isFenDenominatedOrder(orderType: string): boolean {
  return orderType === 'COURSE' || orderType === 'WAITLIST'
}

/** 订单金额列值 → 分（支付网关口径） */
export function orderAmountToFen(orderType: string, columnValue: number): number {
  const n = Number(columnValue) || 0
  return Math.round(isFenDenominatedOrder(orderType) ? n : n * 100)
}

/** 订单金额列值 → 元（展示 / 统计口径） */
export function orderAmountToYuan(orderType: string, columnValue: number): number {
  const n = Number(columnValue) || 0
  return isFenDenominatedOrder(orderType) ? n / 100 : n
}

/**
 * 积分按元计价（POINTS_TO_YUAN_RATIO），而课程链抵扣列以分为单位，
 * 报名抵扣积分时必须用分口径，否则抵扣额会小 100 倍。
 */
export const POINTS_TO_FEN_RATIO = POINTS_TO_YUAN_RATIO * 100

/** 代金券面额（amount / targetPrice）后台按元录入，课程链金额列为分 */
export function voucherYuanToFen(yuan: number): number {
  return Math.round((Number(yuan) || 0) * 100)
}
