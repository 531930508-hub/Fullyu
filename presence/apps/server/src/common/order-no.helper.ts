import { RedisService } from './redis.service'
import type { PrismaService } from './prisma.service'

/**
 * 生成格式化订单号：前缀+YYMMDD+5位流水
 * C=课程 M=会员卡 W=候补 S=社群
 *
 * 健壮性：Redis 计数键可能因重启/清空/手工补数据而丢失，导致流水从 1 重新开始
 * 并撞上当天已占用订单号（生产曾出现报名直接 400）。因此：
 * - 计数键首次创建时，以库内当天同前缀最大流水为起点；
 * - 生成后若命中已占用订单号，继续自增直到空闲；
 * - 初始化用分布式锁串行化，避免并发请求同时从 1 起算。
 */
export async function generateOrderNo(
  redis: RedisService,
  type: 'COURSE' | 'MEMBER_CARD' | 'WAITLIST' | 'COMMUNITY',
  prisma?: PrismaService,
): Promise<string> {
  const prefixMap: Record<string, string> = {
    COURSE: 'C',
    MEMBER_CARD: 'M',
    WAITLIST: 'W',
    COMMUNITY: 'S',
  }
  const prefix = prefixMap[type] || 'X'
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const dateStr = `${yy}${mm}${dd}`

  const key = `order_seq:${prefix}:${dateStr}`
  const head = `${prefix}${dateStr}`
  const format = (seq: number) => `${head}${String(seq).padStart(5, '0')}`

  /** 读取库内当天同前缀的最大流水 */
  const maxSeqInDb = async (): Promise<number> => {
    if (!prisma) return 0
    const latest = await prisma.order.findFirst({
      where: { orderNo: { startsWith: head } },
      orderBy: { orderNo: 'desc' },
      select: { orderNo: true },
    })
    return latest ? Number(latest.orderNo.slice(head.length)) || 0 : 0
  }

  let seq = await redis.incr(key)
  if (seq === 1) {
    await redis.expire(key, 86400 * 2)
    if (prisma) {
      // 计数键刚被创建：串行对齐库内流水后再取下一个号
      seq = await redis.withLock(
        `order_seq_init:${prefix}:${dateStr}`,
        async () => {
          const current = Number((await redis.get(key)) ?? 0) || 0
          const base = Math.max(await maxSeqInDb(), current)
          if (base > 0) await redis.set(key, String(base))
          return redis.incr(key)
        },
        { ttlSeconds: 5, retries: 10, retryDelayMs: 50 },
      )
    }
  }

  let orderNo = format(seq)
  if (prisma) {
    // 兜底：计数键存在但落后于库内流水时，跳过已占用号
    for (let i = 0; i < 10; i++) {
      const occupied = await prisma.order.findUnique({
        where: { orderNo },
        select: { id: true },
      })
      if (!occupied) break
      const current = Number((await redis.get(key)) ?? 0) || 0
      const base = Math.max(await maxSeqInDb(), current)
      if (base > current) await redis.set(key, String(base))
      seq = await redis.incr(key)
      orderNo = format(seq)
    }
  }

  return orderNo
}
