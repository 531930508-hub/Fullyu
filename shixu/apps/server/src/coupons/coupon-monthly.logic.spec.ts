import { CouponMonthlyService, parseDayConfig, shanghaiDayOfMonth, shanghaiMonth } from './coupon-monthly.service';
import { CouponRuleScheduler } from './coupon-rule.scheduler';

/**
 * 月度发券里跟数据库无关的那部分：时区换算、执行日解析、调度节奏。
 * 数据库相关的分批写入/断点续跑在 coupon-monthly.spec.ts（集成用例）里覆盖。
 */
describe('月度发券：时区与配置解析', () => {
  it('自然月按中国时区切分，UTC 月末不会串到下个月', () => {
    // 2026-02-28T16:30Z = 北京时间 3 月 1 日 00:30
    expect(shanghaiMonth(new Date('2026-02-28T16:30:00Z'))).toBe('2026-03');
    expect(shanghaiDayOfMonth(new Date('2026-02-28T16:30:00Z'))).toBe(1);
    expect(shanghaiMonth(new Date('2026-02-28T15:59:00Z'))).toBe('2026-02');
    expect(shanghaiDayOfMonth(new Date('2026-02-28T15:59:00Z'))).toBe(28);
  });

  it('执行日只接受 1~28，越界或脏数据退回 1 号', () => {
    expect(parseDayConfig('')).toEqual({ dayOfMonth: 1 });
    expect(parseDayConfig('{"dayOfMonth":15}')).toEqual({ dayOfMonth: 15 });
    expect(parseDayConfig('{"dayOfMonth":"9"}')).toEqual({ dayOfMonth: 9 });
    expect(parseDayConfig('{"dayOfMonth":28}')).toEqual({ dayOfMonth: 28 });
    // 29~31 不是每个月都有，配了也按 1 号处理，避免 2 月漏发
    expect(parseDayConfig('{"dayOfMonth":31}')).toEqual({ dayOfMonth: 1 });
    expect(parseDayConfig('{"dayOfMonth":0}')).toEqual({ dayOfMonth: 1 });
    expect(parseDayConfig('not-json')).toEqual({ dayOfMonth: 1 });
    expect(parseDayConfig('{"dayOfMonth":"abc"}')).toEqual({ dayOfMonth: 1 });
  });
});

describe('发券调度节奏', () => {
  const shanghaiHour = () =>
    Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(
        new Date()
      )
    );

  const build = () => {
    const runAll = jest.fn(async () => ({ results: [] as Array<{ issued: number; error?: string }> }));
    const monthlyTick = jest.fn(async () => undefined);
    const scheduler = new CouponRuleScheduler(
      { runAll } as unknown as ConstructorParameters<typeof CouponRuleScheduler>[0],
      { tick: monthlyTick } as unknown as CouponMonthlyService
    );
    const tick = (scheduler as unknown as { tick: () => Promise<void> }).tick.bind(scheduler);
    return { runAll, monthlyTick, tick };
  };

  const originalHour = process.env.COUPON_RULE_HOUR;

  afterEach(() => {
    if (originalHour === undefined) delete process.env.COUPON_RULE_HOUR;
    else process.env.COUPON_RULE_HOUR = originalHour;
  });

  it('月度规则每轮都检查，不等 10 点整点', async () => {
    // 把日常规则的执行点设成一个「不是当前小时」的值，月度仍然要跑
    process.env.COUPON_RULE_HOUR = String((shanghaiHour() + 3) % 24);
    const { runAll, monthlyTick, tick } = build();
    await tick();
    expect(monthlyTick).toHaveBeenCalledTimes(1);
    expect(runAll).not.toHaveBeenCalled();
  });

  it('到了目标整点，日常规则也跑一遍', async () => {
    process.env.COUPON_RULE_HOUR = String(shanghaiHour());
    const { runAll, monthlyTick, tick } = build();
    await tick();
    expect(monthlyTick).toHaveBeenCalledTimes(1);
    expect(runAll).toHaveBeenCalledTimes(1);
  });

  it('月度检查抛错不影响同轮日常规则，也不会卡住后续轮次', async () => {
    process.env.COUPON_RULE_HOUR = String(shanghaiHour());
    const { runAll, monthlyTick, tick } = build();
    monthlyTick.mockRejectedValueOnce(new Error('boom'));
    await tick();
    expect(runAll).toHaveBeenCalledTimes(1);
    // running 标记在 finally 里复位，下一轮还能继续跑
    await tick();
    expect(monthlyTick).toHaveBeenCalledTimes(2);
  });
});