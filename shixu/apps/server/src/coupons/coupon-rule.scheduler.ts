import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { StaffContext } from '../common/auth.types';
import { CouponMonthlyService } from './coupon-monthly.service';
import { CouponRulesService } from './coupon-rules.service';

/** 每天扫一遍的检查间隔：比一天短，避免进程在 10 点前后重启而漏跑。 */
const TICK_MS = 10 * 60 * 1000;
/** 每天只在上海时间这个整点后的第一轮执行。 */
const DEFAULT_HOUR = 10;

const SYSTEM_ACTOR: StaffContext = {
  id: 'system',
  name: '系统自动发放',
  username: 'system',
  active: true,
  allStores: true,
  storeIds: [],
  roles: [],
  perms: new Set(['*']),
  tokenVersion: 0
};

/**
 * 自动发券调度：每天北京时间 10:00 执行一次全部启用规则。
 *
 * - 幂等由券侧保证：同一规则同一天只产生一个批次（requestKey 含日期），
 *   进程重启或同一小时多轮触发都不会重复发；
 * - 用 lastRunAt 做当日标记，跨天自然失效，不依赖额外的任务表；
 * - 默认关闭，需显式 COUPON_RULES_ENABLED=1；测试环境不启动定时器。
 */
@Injectable()
export class CouponRuleScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CouponRuleScheduler');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly rules: CouponRulesService,
    private readonly monthly: CouponMonthlyService
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
    if (!['1', 'true', 'on'].includes(String(process.env.COUPON_RULES_ENABLED || '').toLowerCase())) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    const now = new Date();
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(now)
    );
    const targetHour = Number(process.env.COUPON_RULE_HOUR || DEFAULT_HOUR);
    this.running = true;
    try {
      // 月度规则每轮都检查：既接管上次中断的 run，也在到了执行日时启动当月发放。
      // 它不依赖 10 点这个整点，进程在当天任意时刻重启都能补上。
      await this.monthly.tick(SYSTEM_ACTOR);
    } catch (error) {
      this.logger.error(`月度发券检查失败：${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      // 生日/新客/沉睡仍是每天目标整点后的第一轮执行，错过整点会顺延到下一轮。
      if (hour !== targetHour) return;
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(now);
      const executed = await this.rules.runAll(SYSTEM_ACTOR);
      const issued = executed.results.reduce((sum, row) => sum + row.issued, 0);
      if (issued || executed.results.some((row) => row.error)) {
        this.logger.log(
          `自动发券 ${today}：规则 ${executed.results.length} 条，发出 ${issued} 张` +
            (executed.results.some((row) => row.error) ? `，失败 ${executed.results.filter((row) => row.error).length} 条` : '')
        );
      }
    } catch (error) {
      this.logger.error(`自动发券执行失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}