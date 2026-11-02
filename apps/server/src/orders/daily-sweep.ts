import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { OrdersService } from './orders.service';

const SHANGHAI = 'Asia/Shanghai';
const DEFAULT_SWEEP_HOUR = 3;
const TICK_MS = 60_000;

/** 上海时区的当前日期与小时，避免服务器时区或 UTC 跨日影响营业日判断。 */
export function shanghaiClock(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour'))
  };
}

/** 上海时区当天零点（北京时间无夏令时，可直接用 +08:00 构造）。 */
export function shanghaiStartOfDay(now: Date): Date {
  return new Date(`${shanghaiClock(now).date}T00:00:00+08:00`);
}

/** 每天凌晨把前一日仍未归档的待取餐订单标记为已取餐；进程重启后当天仍会补跑一次。 */
@Injectable()
export class DailySweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DailySweep');
  private timer?: NodeJS.Timeout;
  private lastRunDate = '';
  private running = false;

  constructor(private readonly orders: OrdersService) {}

  onModuleInit() {
    // 集成测试里订单由用例自己控制，避免定时任务在断言中途改状态。
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
    if (['0', 'false', 'off'].includes(String(process.env.READY_SWEEP_ENABLED || '').toLowerCase())) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private sweepHour(): number {
    const parsed = Number(process.env.READY_SWEEP_HOUR || DEFAULT_SWEEP_HOUR);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : DEFAULT_SWEEP_HOUR;
  }

  private async tick() {
    if (this.running) return;
    const now = new Date();
    const { date, hour } = shanghaiClock(now);
    if (hour < this.sweepHour() || this.lastRunDate === date) return;
    this.running = true;
    try {
      const count = await this.orders.autoDeliverReadyOrders(shanghaiStartOfDay(now), now);
      this.lastRunDate = date;
      if (count) this.logger.log(`已自动确认前一日待取餐订单 ${count} 单`);
    } catch (error) {
      // 失败不记 lastRunDate，下一分钟继续重试；订单状态未变时不会产生副作用。
      this.logger.error(`自动确认取餐失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
