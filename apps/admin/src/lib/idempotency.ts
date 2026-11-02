/**
 * 代点提交的幂等键。
 *
 * 同一份内容（门店/用餐方式/桌位/支付/会员/备注/商品）在提交成功前复用同一个键：
 * 断网重试、双击「确认收款」都只会落一单；内容一改就换新键，避免把新单当成旧单重放。
 * 提交成功后必须 reset，否则顾客连点两杯完全相同的东西会被服务端当成重复请求。
 */
export class IdempotencyKeys {
  private current: { signature: string; key: string } | null = null;

  constructor(private readonly createKey: () => string = () => randomKey()) {}

  keyFor(signature: string): string {
    if (this.current && this.current.signature === signature) return this.current.key;
    this.current = { signature, key: this.createKey() };
    return this.current.key;
  }

  reset(): void {
    this.current = null;
  }
}

function randomKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
