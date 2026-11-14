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
