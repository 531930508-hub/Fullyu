import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

const TICK_MS = 5 * 60_000;

/**
 * 忘点离店的兜底：超过单段上限（默认 16 小时）仍 open 的段转 lapsed。
 * 不定时清理的话，一条 open 段会永久占住 openKey，这个人以后再也打不了到店卡。
 * 转 lapsed 后工时归 0 等补签——与「宁可少算、不可虚增」的口径一致。
 */
@Injectable()
export class AttendanceSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AttendanceSweep');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly attendance: AttendanceService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
    if (['0', 'false', 'off'].includes(String(process.env.ATTENDANCE_SWEEP_ENABLED || '').toLowerCase())) {
      return;
    }
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.attendance.sweepLapsed();
      if (count) this.logger.log(`已将 ${count} 段超时未离店的在店时段转为待补签`);
    } catch (error) {
      this.logger.error(`清理超时在店时段失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}