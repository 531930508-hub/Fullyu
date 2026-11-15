/**
 * 地理换算：前后端共用同一份距离公式。
 *
 * 前端要「点之前」就把距离和有效半径算给店员看，服务端要「点之后」重算做判定。
 * 两处若各写一份，浮点舍入稍有不同就会出现「界面说在范围内、服务端说超范围」，
 * 店员会反复重试并最终放弃使用。所以公式只保留这一份，服务端的结果才是权威。
 */

export type GeoPoint = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 球面两点距离（米）。门店尺度下 haversine 足够，误差远小于 GPS 自身漂移。 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 有效围栏半径 = 门店半径 + min(定位精度, 补偿上限)。
 * 精度补偿是为了商场/地下层那种动辄 200m 的漂移；补偿上限则防止一个 ±800m 的读数
 * 把 100m 围栏撑成 900m——那等于没有围栏。
 */
export function effectiveRadiusM(input: {
  radiusM: number;
  accuracyM?: number | null;
  accuracyAllowanceM: number;
}): number {
  const radius = Math.max(0, Math.round(input.radiusM));
  const accuracy = input.accuracyM == null ? 0 : Math.max(0, Math.min(input.accuracyM, input.accuracyAllowanceM));
  return radius + Math.round(accuracy);
}