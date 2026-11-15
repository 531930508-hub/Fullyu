/**
 * 门店围栏判定：纯函数，无 IO，便于单测。
 *
 * 为什么要「精度补偿」而不是直接比距离：
 * 商场中庭、B1 和沿街二楼在浏览器里的 GPS 常漂 200~800m。如果只比直线距离，
 * 店员站在店里也打不上卡，业务会退回纸质记录——数据比没有更差。
 * 所以判定用「距离 ≤ 半径 + min(精度, 补偿上限)」，同时用精度上限挡掉基站定位
 * 那种完全不可信的读数（accuracy 2km 的坐标没有意义）。
 *
 * 补偿上限（默认 50m）的作用是给 100m 的半径封顶，避免一个 ±400m 的读数
 * 把围栏外扩到 500m，那等于没有围栏。
 */

import { effectiveRadiusM, haversineMeters } from '@teahour/shared';

export { haversineMeters };

export type GatePolicy = {
  /** 门店半径（米），门店级可配 */
  radiusM: number;
  /** 精度上限：accuracy 超过它视为「定位不可信」，直接拒绝 */
  accuracyCeilingM: number;
  /** 精度补偿上限：允许 accuracy 把围栏外扩的最大米数 */
  accuracyAllowanceM: number;
};

export type GateReason = 'ok' | 'no_location' | 'untrusted_accuracy' | 'out_of_range';

export type GateResult = {
  ok: boolean;
  reason: GateReason;
  /** 上报坐标到门店的直线距离（米，取整）；没有坐标时为 null */
  distanceM: number | null;
  /** 本次判定实际采用的有效半径（radius + 精度补偿），前端据此展示 */
  limitM: number;
};

type Point = { lat: number; lng: number };
type GatePoint = Point & { accuracyM?: number | null };

/**
 * 判定一次到店位置是否可接受。
 *
 * accuracy 缺失（部分浏览器不给）时不做补偿，也不放宽上限：
 * 拿不到精度就无法证明读数可信，此时按「必须在半径内」处理。
 */
export function evaluateGate(input: {
  point: GatePoint | null | undefined;
  store: Point;
  policy: GatePolicy;
}): GateResult {
  const { point, store, policy } = input;
  const radiusM = Math.max(0, Math.round(policy.radiusM));
  if (!point) {
    return { ok: false, reason: 'no_location', distanceM: null, limitM: radiusM };
  }
  const distanceM = Math.round(haversineMeters(point, store));
  const raw = point.accuracyM;
  const accuracyM = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;

  if (accuracyM != null && accuracyM > policy.accuracyCeilingM) {
    return { ok: false, reason: 'untrusted_accuracy', distanceM, limitM: radiusM };
  }
  const limitM = effectiveRadiusM({
    radiusM,
    accuracyM,
    accuracyAllowanceM: policy.accuracyAllowanceM
  });
  return {
    ok: distanceM <= limitM,
    reason: distanceM <= limitM ? 'ok' : 'out_of_range',
    distanceM,
    limitM
  };
}

/** 把判定结果翻译成给店员看的句子——五种状态五种文案，别合并成「打卡失败」。 */
export function describeGate(result: GateResult, storeName: string): string {
  switch (result.reason) {
    case 'ok':
      return `已在「${storeName}」范围内（${result.distanceM}m）`;
    case 'no_location':
      return '没有拿到定位，请在手机设置里允许浏览器获取位置后重试';
    case 'untrusted_accuracy':
      return '定位精度太差（可能用的是基站定位），请走到店门口或靠窗处再试一次';
    case 'out_of_range':
    default:
      return `距「${storeName}」约 ${result.distanceM}m，超出 ${result.limitM}m 范围；到店后再确认`;
  }
}