import { Injectable, Inject } from '@nestjs/common'
import type { Redis } from 'ioredis'

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, value)
    } else {
      await this.redis.set(key, value)
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key)
  }

  /**
   * 席位锁定：使用 SETNX 实现分布式锁
   * @returns true 表示锁定成功
   */
  async lockSeat(courseId: string, userId: string, ttlSeconds: number): Promise<boolean> {
    const key = `seat_lock:${courseId}:${userId}`
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  }

  async unlockSeat(courseId: string, userId: string): Promise<void> {
    const key = `seat_lock:${courseId}:${userId}`
    await this.redis.del(key)
  }

  async getSeatLockTTL(courseId: string, userId: string): Promise<number> {
    const key = `seat_lock:${courseId}:${userId}`
    return this.redis.ttl(key)
  }

  /**
   * 通用分布式锁：SET NX EX。返回 true 表示获取成功
   */
  async acquireLock(key: string, ttlSeconds = 10): Promise<boolean> {
    const result = await this.redis.set(`lock:${key}`, '1', 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  }

  async releaseLock(key: string): Promise<void> {
    await this.redis.del(`lock:${key}`)
  }

  /**
   * 在分布式锁保护下执行 fn，自带重试与自动释放
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    opts: { ttlSeconds?: number; retries?: number; retryDelayMs?: number } = {},
  ): Promise<T> {
    const { ttlSeconds = 10, retries = 20, retryDelayMs = 100 } = opts
    let acquired = false
    for (let i = 0; i < retries; i++) {
      acquired = await this.acquireLock(key, ttlSeconds)
      if (acquired) break
      await new Promise((r) => setTimeout(r, retryDelayMs))
    }
    if (!acquired) {
      throw new Error('系统繁忙，请稍后重试')
    }
    try {
      return await fn()
    } finally {
      await this.releaseLock(key)
    }
  }
}
