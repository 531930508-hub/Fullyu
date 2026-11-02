import { LoginAttemptLimiter } from './login-attempts';

describe('登录失败限流', () => {
  const policy = { limit: 3, windowMs: 60_000 };

  it('连续失败达到上限后锁定，窗口过期自动解禁', () => {
    let now = 1_000;
    const limiter = new LoginAttemptLimiter(policy, () => now);
    const key = '127.0.0.1|13800000004';

    limiter.recordFailure(key);
    limiter.recordFailure(key);
    expect(limiter.retryAfterMs(key)).toBe(0);

    limiter.recordFailure(key);
    expect(limiter.retryAfterMs(key)).toBe(60_000);

    now += 60_001;
    expect(limiter.retryAfterMs(key)).toBe(0);
  });

  it('成功登录清空计数，不同账号与来源互不影响', () => {
    const limiter = new LoginAttemptLimiter(policy, () => 0);
    const key = 'ip-a|u1';

    limiter.recordFailure(key);
    limiter.recordFailure(key);
    limiter.clear(key);
    limiter.recordFailure(key);
    limiter.recordFailure(key);

    expect(limiter.retryAfterMs(key)).toBe(0);
    expect(limiter.retryAfterMs('ip-b|u1')).toBe(0);
    expect(limiter.retryAfterMs('ip-a|u2')).toBe(0);
  });

  it('锁定期间继续失败不会延长解禁时间', () => {
    let now = 0;
    const limiter = new LoginAttemptLimiter(policy, () => now);
    const key = 'ip|u';

    limiter.recordFailure(key);
    limiter.recordFailure(key);
    limiter.recordFailure(key);
    now += 30_000;
    limiter.recordFailure(key);

    expect(limiter.retryAfterMs(key)).toBe(30_000);
  });
});
