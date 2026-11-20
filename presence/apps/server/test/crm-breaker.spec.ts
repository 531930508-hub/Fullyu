import { CrmCircuitBreaker } from '../src/common/crm/crm-breaker'

describe('CRM 熔断器（在场）', () => {
  it('连续三次失败后打开，冷却期内直接短路', () => {
    let now = 0
    const breaker = new CrmCircuitBreaker(3, 15_000, () => now)
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.isOpen()).toBe(false)
    breaker.recordFailure()
    expect(breaker.isOpen()).toBe(true)
    now = 14_999
    expect(breaker.isOpen()).toBe(true)
  })

  it('冷却结束进入半开：探针成功恢复正常，再失败立刻重新打开', () => {
    let now = 0
    const breaker = new CrmCircuitBreaker(3, 15_000, () => now)
    for (let i = 0; i < 3; i++) breaker.recordFailure()
    now = 15_000
    expect(breaker.isOpen()).toBe(false)

    // 半开只放一个探针：这一次失败就重新打开，不等再攒三次。
    breaker.recordFailure()
    expect(breaker.isOpen()).toBe(true)

    now = 30_000
    expect(breaker.isOpen()).toBe(false)
    breaker.recordSuccess()
    expect(breaker.isOpen()).toBe(false)
  })

  it('成功会清零失败计数：偶发失败不会误熔断', () => {
    const breaker = new CrmCircuitBreaker(3, 15_000, () => 0)
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordSuccess()
    breaker.recordFailure()
    breaker.recordFailure()
    expect(breaker.isOpen()).toBe(false)
    breaker.recordFailure()
    expect(breaker.isOpen()).toBe(true)
  })
})