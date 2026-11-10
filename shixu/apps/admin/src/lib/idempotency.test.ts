import { describe, expect, it } from 'vitest';
import { IdempotencyKeys } from './idempotency';

describe('代点幂等键', () => {
  it('同一份内容重复提交复用同一个键', () => {
    let seq = 0;
    const keys = new IdempotencyKeys(() => `key-${(seq += 1)}`);
    const signature = 'sh|takeaway|wechat||醒-1';

    expect(keys.keyFor(signature)).toBe('key-1');
    expect(keys.keyFor(signature)).toBe('key-1');
  });

  it('内容变化后生成新键，旧键不会被继续使用', () => {
    let seq = 0;
    const keys = new IdempotencyKeys(() => `key-${(seq += 1)}`);

    expect(keys.keyFor('a')).toBe('key-1');
    expect(keys.keyFor('b')).toBe('key-2');
    expect(keys.keyFor('a')).toBe('key-3');
  });

  it('提交成功后重置，同样的内容再次下单是新的一单', () => {
    let seq = 0;
    const keys = new IdempotencyKeys(() => `key-${(seq += 1)}`);

    expect(keys.keyFor('same')).toBe('key-1');
    keys.reset();
    expect(keys.keyFor('same')).toBe('key-2');
  });
});
