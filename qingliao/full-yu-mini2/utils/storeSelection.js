// 门店选择规则：入口若指定门店优先，否则按定位自动选最近门店。
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasCoord(store) {
  return store && toNumber(store.latitude) !== null && toNumber(store.longitude) !== null;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function shopDistance(store, latitude, longitude) {
  if (!store) return null;
  if (hasCoord(store) && toNumber(latitude) !== null && toNumber(longitude) !== null) {
    return haversineKm(toNumber(latitude), toNumber(longitude), toNumber(store.latitude), toNumber(store.longitude));
  }
  const distance = toNumber(store.distanceInMeters);
  return distance !== null && distance > 0 ? distance : null;
}

export function nearestStore(stores, latitude, longitude) {
  if (!Array.isArray(stores) || !stores.length) return null;
  let nearest = null;
  let min = null;
  for (const store of stores) {
    const distance = shopDistance(store, latitude, longitude);
    if (distance === null) continue;
    if (min === null || distance < min) {
      min = distance;
      nearest = store;
    }
  }
  return nearest;
}

export function pickDefaultStore(stores, options = {}) {
  if (!Array.isArray(stores) || !stores.length) return null;
  const explicitId = toNumber(options.shopId);
  if (explicitId !== null && explicitId > 0) {
    const explicit = stores.find(store => Number(store.id) === explicitId);
    if (explicit) return explicit.id;
  }
  const nearest = nearestStore(stores, options.latitude, options.longitude);
  if (nearest) return nearest.id;
  const preferredId = toNumber(options.preferredId);
  if (preferredId !== null && stores.some(store => Number(store.id) === preferredId)) return preferredId;
  return stores[0].id;
}

export function distanceText(store) {
  const distance = toNumber(store && store.distanceInMeters);
  if (distance === null || distance <= 0) return '';
  return distance.toFixed(1) + 'km';
}
