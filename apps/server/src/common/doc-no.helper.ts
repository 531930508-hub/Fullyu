import { RedisService } from './redis.service'

/**
 * 后台单据号：前缀 + YYYYMMDD + 3 位流水，如 PO20260810001。
 *
 * AP=审批实例 PO=采购订单 GR=验收入库 SA=库存调整 TR=调拨 MO=生产工单
 * 单据号即主键，直接给人看，所以不用 cuid。
 */
export type DocNoPrefix = 'AP' | 'PO' | 'GR' | 'SA' | 'TR' | 'MO'

/**
 * @param exists 主键占用检查。Redis 被清过之后流水会从 1 重来，
 *               靠这个回调往后跳号，避免直接撞主键报 500。
 */
export async function generateDocNo(
  redis: RedisService,
  prefix: DocNoPrefix,
  exists?: (no: string) => Promise<boolean>,
): Promise<string> {
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`
  const key = `doc_seq:${prefix}:${dateStr}`

  for (let i = 0; i < 20; i++) {
    const seq = await redis.incr(key)
    if (seq === 1) await redis.expire(key, 86400 * 2)
    const no = `${prefix}${dateStr}${String(seq).padStart(3, '0')}`
    if (!exists || !(await exists(no))) return no
  }
  // 连续 20 次都被占用属于异常，用时间戳兜底保证单据仍能创建
  return `${prefix}${dateStr}${String(Date.now()).slice(-6)}`
}
