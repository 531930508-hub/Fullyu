/**
 * 在店时段的时间口径。全部按 Asia/Shanghai 计算——
 * 店铺都在国内，服务器时区可能是 UTC 或美西，用本地时间会让「今天」在凌晨错一天。
 * 北京时间没有夏令时，可以直接用固定 +08:00 构造，不需要引入时区库。
 */

const SHANGHAI = 'Asia/Shanghai';

/** 上海时区的 YYYY-MM-DD。营业日/工时归属日都用它，不用服务器本地日期。 */
export function shanghaiDate(input: Date | number = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(input));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 上海时区的 HH:mm，用于审批摘要和提示文案。 */
export function shanghaiTimeText(input: Date | number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(input));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${get('hour')}:${get('minute')}`;
}

/** '2026-11-14' → '2026-11' */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** 结算周期的首末日（含）。月结 = 自然月的 1 号到月末。 */
export function monthRange(month: string): { start: string; end: string; label: string } {
  const [y, m] = month.split('-').map((part) => Number(part));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(days).padStart(2, '0')}`,
    label: month
  };
}

/** 上一个自然月，用于月结出单的默认周期。 */
export function previousMonth(now: Date = new Date()): string {
  const [y, m] = shanghaiDate(now).split('-').map((part) => Number(part));
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, '0')}`;
}

/** 两个时刻之间的分钟数（四舍五入到整分钟）。 */
export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

/** 分钟数 → 「8h05m」/「45m」，看板和审批摘要统一用这个格式。 */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

/** 前端 datetime-local 的墙钟值 → 毫秒时间戳（按 +08:00 解释）。 */
export function shanghaiWallClockToMs(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const ms = Date.parse(`${withSeconds}+08:00`);
  return Number.isFinite(ms) ? ms : null;
}