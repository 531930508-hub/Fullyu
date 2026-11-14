/**
 * 到店确认页的前端辅助：定位、上海墙钟换算、时长格式化。
 *
 * 这里刻意不做任何距离计算：围栏判定只在服务端 `evaluateGate` 里有一份，
 * 前端把定位读数交给 /attendance/mine 换回 preview（距离/有效半径/结论）。
 * 两边各算一遍迟早会漂成「界面说在范围内、点下去被拒」。
 */

export type GeoFix = { lat: number; lng: number; accuracyM: number | null };

/** 时段状态的统一文案与色调：门店页和总部看板共用，避免两处对同一状态各写一套说法。 */
export const SESSION_LABEL: Record<string, string> = {
  open: '在店中',
  pending_close: '待审批',
  closed: '已结束',
  lapsed: '待补签',
  voided: '已作废'
};

export function sessionTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (status === 'open') return 'ok';
  if (status === 'pending_close') return 'warn';
  if (status === 'lapsed') return 'danger';
  return 'neutral';
}

const SHANGHAI = 'Asia/Shanghai';

function geoMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case 1:
      return '定位权限被拒绝。请在浏览器设置里允许本站获取位置，然后刷新页面重试';
    case 2:
      return '暂时无法获取位置，可能是室内信号弱。走到门口或靠窗处再试一次';
    case 3:
      return '定位超时。请确认已打开手机定位后再试一次';
    default:
      return '定位失败，请重试';
  }
}

/** 取一次当前位置。不缓存：几个小时前的坐标会让「到店」变成假数据。 */
export function currentPosition(timeoutMs = 15_000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo) {
      reject(new Error('当前浏览器不支持定位。请用手机浏览器打开，或通过 HTTPS 访问后再试'));
      return;
    }
    geo.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
        }),
      (error) => reject(new Error(geoMessage(error))),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** 毫秒时间戳 → 上海墙钟 'YYYY-MM-DDTHH:mm'，用于 datetime-local 的默认值。 */
export function shanghaiWallClock(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * datetime-local 的值按上海时间解释。
 * 不能直接 new Date(value)：那会按设备本地时区解析，店员在国内改系统时区就会错开。
 */
export function wallClockToMs(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(ms) ? ms : null;
}

/** 分钟 → 「8h05m」，与后端摘要同一套写法，避免两边显示不一致。 */
export function minutesText(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours ? `${hours}h${String(rest).padStart(2, '0')}m` : `${rest}m`;
}

/** 在店倒计时/正计时：从某个时刻到现在的时长，秒级刷新。 */
export function elapsedText(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/* ------------------------------ 班表 ------------------------------ */

/** 分钟数 → 「09:00」；1440 是「当天 24:00」，班表里按结束时刻展示。 */
export function shiftClock(minutes: number): string {
  const value = Math.max(0, Math.min(1440, Math.round(minutes)));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}

/** 「09:00–18:00」。中间用 en dash，和其它时段文案一致。 */
export function shiftText(startMin: number, endMin: number): string {
  return `${shiftClock(startMin)}–${shiftClock(endMin)}`;
}

/** 日期字符串按 UTC 运算：班表只关心「哪一天」，不受设备时区与夏令时影响。 */
export function addDaysText(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** 周一为一周的第一天，与后端 `weekStartOf` 同一口径。 */
export function weekStartText(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = 周日
  return addDaysText(date, -((dow + 6) % 7));
}

const WEEKDAY_TEXT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 'YYYY-MM-DD' → 「周四」。 */
export function weekdayText(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return WEEKDAY_TEXT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || '';
}

/** 「09:00」→ 540。24:00 合法（班表按「到 24:00」结束）；格式不对返回 null。 */
export function clockToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

/** 计划 vs 实际的结论文案：只用于提示，不用于任何计算。 */
export const SHIFT_STATE_LABEL: Record<string, string> = {
  planned: '未开始',
  done: '已对上',
  short: '短时',
  absent: '没来'
};

export function shiftStateTone(state: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (state === 'done') return 'ok';
  if (state === 'short') return 'warn';
  if (state === 'absent') return 'danger';
  return 'neutral';
}
