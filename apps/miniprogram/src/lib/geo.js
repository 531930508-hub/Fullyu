/**
 * 门店距离：只做本地球面距离估算，用于「就近选店」排序与展示。
 * 门店坐标来自后台维护的经纬度；顾客坐标来自 uni.getLocation。
 * 任意一端缺失时返回 null，调用方按无距离处理，不显示 0 或编造数值。
 */

const EARTH_RADIUS_KM = 6371;
const toRad = (value) => (value * Math.PI) / 180;

const coordOf = (point) => {
  if (!point) return null;
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

/** 两点球面距离（公里）；坐标缺失或非法时返回 null。 */
export function distanceKm(from, to) {
  const a = coordOf(from);
  const b = coordOf(to);
  if (!a || !b) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 展示文案：1km 内用米并取整到 10m，超过 1km 保留一位小数；无有效距离返回空串。 */
export function formatDistance(km) {
  if (km == null || !Number.isFinite(km) || km < 0) return '';
  if (km < 1) {
    const meters = Math.max(10, Math.round((km * 1000) / 10) * 10);
    return `${meters}m`;
  }
  return `${km.toFixed(km < 10 ? 1 : 0)}km`;
}
