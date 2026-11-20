/**
 * 会员中心（CRM）客户端熔断器（在场）。
 *
 * 背景：CRM 一挂，每次登录/读取都要先等满超时。定时任务、多人同时登录时排队等超时
 * 会把 node 的 socket 与请求上下文占满，连带拖慢商城与预约主链路。
 *
 * 语义与轻疗侧一致：
 * - 连续 failureThreshold 次失败后打开；
 * - 打开 cooldownMs 内的调用直接失败（调用方走各自的降级分支），不再排队等超时；
 * - 冷却结束后进入半开：放一个探针，失败立刻重新打开，成功才恢复正常。
 */
export class CrmCircuitBreaker {
  private failures = 0
  private openedAt: number | null = null

  constructor(
    private readonly failureThreshold = 3,
    private readonly cooldownMs = 15_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  isOpen(): boolean {
    if (this.openedAt === null) return false
    if (this.now() - this.openedAt >= this.cooldownMs) {
      // 半开：保留一次失败余量，探针再失败就马上重新打开。
      this.openedAt = null
      this.failures = Math.max(0, this.failureThreshold - 1)
      return false
    }
    return true
  }

  recordSuccess(): void {
    this.failures = 0
    this.openedAt = null
  }

  recordFailure(): void {
    this.failures += 1
    if (this.failures >= this.failureThreshold) this.openedAt = this.now()
  }
}