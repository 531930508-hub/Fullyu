/**
 * 登录失败限流：只统计失败，成功登录不占额度。
 *
 * 为什么不是「所有请求统一限流」：门店多台设备换班、弱网重试都会产生正常登录，
 * 统一限流会误伤；而暴力破解的特征是同一来源对同一账号连续失败。
 *
 * 当前部署是单进程，计数放在内存；多实例部署时需要换成 Redis 或数据库计数，
 * 否则各实例额度独立、实际可尝试次数成倍增加。
 */
export type LoginAttemptPolicy = {
  /** 同一窗口内允许的失败次数，达到后锁定到窗口结束。 */
  limit: number;
  /** 计数窗口长度（毫秒）。 */
  windowMs: number;
};

type Bucket = { count: number; resetAt: number };

export class LoginAttemptLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly policy: LoginAttemptPolicy,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** 返回还需等待的毫秒数；0 表示当前未被锁定。 */
  retryAfterMs(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    const remaining = bucket.resetAt - this.now();
    if (remaining <= 0) {
      this.buckets.delete(key);
      return 0;
    }
    return bucket.count >= this.policy.limit ? remaining : 0;
  }

  /** 记录一次失败；窗口内继续失败只累加计数，不延长解禁时间。 */
  recordFailure(key: string): void {
    const at = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= at) {
      this.buckets.set(key, { count: 1, resetAt: at + this.policy.windowMs });
    } else {
      bucket.count += 1;
    }
    // 防止被大量随机账号名撑爆内存：超过阈值时顺手清掉已过期条目。
    if (this.buckets.size > 1000) this.prune(at);
  }

  /** 登录成功：该来源+账号的失败计数清零。 */
  clear(key: string): void {
    this.buckets.delete(key);
  }

  private prune(at: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= at) this.buckets.delete(key);
    }
  }
}
