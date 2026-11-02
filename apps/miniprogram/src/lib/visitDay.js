/**
 * 桌号只对“扫码当天”有效：第二天打开小程序应回到未选桌状态，避免昨天坐过的桌子被带到今天。
 * 日期按北京时间（UTC+8，无夏令时）划分，不依赖设备本地时区。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

function toTime(timestamp) {
  const value = typeof timestamp === 'string' ? Date.parse(timestamp) : Number(timestamp);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 时间戳所属的北京时间自然日序号；非法值返回 null。 */
export function visitDayIndex(timestamp) {
  const value = toTime(timestamp);
  if (value === null) return null;
  return Math.floor((value + CN_OFFSET_MS) / DAY_MS);
}

/** 两个时间是否落在同一个北京时间自然日。 */
export function isSameVisitDay(left, right) {
  const a = visitDayIndex(left);
  const b = visitDayIndex(right);
  return a !== null && b !== null && a === b;
}

/** 本地保存的桌号条目是否仍属于当天（没有扫码时间的旧条目按过期处理）。 */
export function isTableEntryFresh(entry, now = Date.now()) {
  return Boolean(entry && entry.at && isSameVisitDay(entry.at, now));
}
