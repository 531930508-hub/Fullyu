import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentPosition,
  elapsedText,
  minutesText,
  shanghaiWallClock,
  wallClockToMs
} from './attendance';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('上海墙钟换算', () => {
  it('datetime-local 的值按北京时间解析，而不是设备本地时区', () => {
    // 2026-11-03 09:30 北京时间 = 01:30 UTC
    expect(wallClockToMs('2026-11-03T09:30')).toBe(Date.UTC(2026, 10, 3, 1, 30));
  });

  it('格式不对时返回 null，交给调用方提示，不猜一个时间出来', () => {
    expect(wallClockToMs('')).toBeNull();
    expect(wallClockToMs('2026-11-03')).toBeNull();
    expect(wallClockToMs('2026-11-03T09:30:00')).toBeNull();
  });

  it('时间戳换回墙钟后能原样解析回去（分钟精度）', () => {
    const ms = Date.UTC(2026, 10, 3, 15, 45);
    expect(wallClockToMs(shanghaiWallClock(ms))).toBe(ms);
  });

  it('跨日不会错一天：UTC 前一日 16:00 对应北京时间次日 00:00', () => {
    expect(shanghaiWallClock(Date.UTC(2026, 10, 3, 16, 0))).toBe('2026-11-04T00:00');
  });
});

describe('时长展示', () => {
  it('分钟数写成 h/m，与后端摘要同一套写法', () => {
    expect(minutesText(0)).toBe('0m');
    expect(minutesText(59)).toBe('59m');
    expect(minutesText(60)).toBe('1h00m');
    expect(minutesText(488)).toBe('8h08m');
  });

  it('负数不显示成负工时', () => {
    expect(minutesText(-30)).toBe('0m');
  });

  it('在店计时到秒，补零对齐', () => {
    expect(elapsedText(0, 1000)).toBe('00:00:01');
    expect(elapsedText(0, 3_661_000)).toBe('01:01:01');
    expect(elapsedText(1000, 500)).toBe('00:00:00');
  });
});

describe('定位', () => {
  it('浏览器没有 geolocation 时给出可执行的提示', async () => {
    vi.stubGlobal('navigator', {});
    await expect(currentPosition()).rejects.toThrow(/不支持定位/);
  });

  it('成功时只取读数，不做任何范围判断', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 31.23, longitude: 121.47, accuracy: 12 } } as GeolocationPosition)
      }
    });
    await expect(currentPosition()).resolves.toEqual({ lat: 31.23, lng: 121.47, accuracyM: 12 });
  });

  it('精度缺失时保留 null，交给服务端按「必须在半径内」处理', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 31.23, longitude: 121.47 } } as GeolocationPosition)
      }
    });
    await expect(currentPosition()).resolves.toMatchObject({ accuracyM: null });
  });

  it('权限被拒绝时翻译成店员看得懂的话', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
          fail({ code: 1 } as GeolocationPositionError)
      }
    });
    await expect(currentPosition()).rejects.toThrow(/定位权限被拒绝/);
  });
});