import { RedisService } from './redis.service'

/**
 * 生成格式化订单号：前缀+YYMMDD+5位流水
 * C=课程 M=会员卡 W=候补
 */
export async function generateOrderNo(
  redis: RedisService,
  type: 'COURSE' | 'MEMBER_CARD' | 'WAITLIST',
): Promise<string> {
  const prefixMap: Record<string, string> = { COURSE: 'C', MEMBER_CARD: 'M', WAITLIST: 'W' }
  const prefix = prefixMap[type] || 'X'
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const dateStr = `${yy}${mm}${dd}`

  const key = `order_seq:${prefix}:${dateStr}`
  const seq = await redis.incr(key)
  if (seq === 1) await redis.expire(key, 86400 * 2)
  return `${prefix}${dateStr}${String(seq).padStart(5, '0')}`
}
