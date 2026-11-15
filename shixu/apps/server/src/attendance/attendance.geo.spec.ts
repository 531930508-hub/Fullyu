import { describeGate, evaluateGate, haversineMeters } from './attendance.geo';

const POLICY = { radiusM: 100, accuracyCeilingM: 100, accuracyAllowanceM: 50 };
const STORE = { lat: 31.176, lng: 121.459 };

/** 纬度方向偏移 degrees → 米（1° 纬度 ≈ 111.32km，门店尺度够用） */
const northMeters = (meters: number) => ({ lat: STORE.lat + meters / 111_320, lng: STORE.lng });

describe('到店围栏判定', () => {
  it('距离计算：同点 0 米，向北 300 米约等于 300', () => {
    expect(haversineMeters(STORE, STORE)).toBe(0);
    const d = haversineMeters(STORE, northMeters(300));
    expect(Math.abs(d - 300)).toBeLessThan(1);
  });

  it('店内、门外 50 米都通过', () => {
    expect(evaluateGate({ point: STORE, store: STORE, policy: POLICY })).toMatchObject({
      ok: true,
      reason: 'ok',
      distanceM: 0
    });
    expect(evaluateGate({ point: northMeters(50), store: STORE, policy: POLICY })).toMatchObject({
      ok: true,
      reason: 'ok'
    });
  });

  it('300 米外拒绝，并且把实际有效半径带出去给前端解释', () => {
    const result = evaluateGate({ point: northMeters(300), store: STORE, policy: POLICY });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('out_of_range');
    expect(result.limitM).toBe(100);
    expect(describeGate(result, '上海·西岸店')).toContain('超出');
  });

  it('精度补偿：130 米外但精度 40 米通过（有效半径 140）', () => {
    const result = evaluateGate({
      point: { ...northMeters(130), accuracyM: 40 },
      store: STORE,
      policy: POLICY
    });
    expect(result).toMatchObject({ ok: true, limitM: 140 });
  });

  it('补偿有上限：精度 90 只外扩到 50，300 米外依然拒绝', () => {
    const near = evaluateGate({
      point: { ...northMeters(140), accuracyM: 90 },
      store: STORE,
      policy: POLICY
    });
    expect(near).toMatchObject({ ok: true, limitM: 150 });

    const far = evaluateGate({
      point: { ...northMeters(300), accuracyM: 90 },
      store: STORE,
      policy: POLICY
    });
    expect(far.ok).toBe(false);
  });

  it('精度超过上限视为定位不可信，直接拒绝（不降级成"距离够近就放行"）', () => {
    const result = evaluateGate({
      point: { ...STORE, accuracyM: 500 },
      store: STORE,
      policy: POLICY
    });
    expect(result).toMatchObject({ ok: false, reason: 'untrusted_accuracy' });
    expect(describeGate(result, '上海·西岸店')).toContain('精度');
  });

  it('没有坐标时给「去开定位权限」的提示，而不是笼统的失败', () => {
    const result = evaluateGate({ point: null, store: STORE, policy: POLICY });
    expect(result).toMatchObject({ ok: false, reason: 'no_location', distanceM: null });
    expect(describeGate(result, '上海·西岸店')).toContain('定位');
  });
});