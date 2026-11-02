import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map();

vi.stubGlobal('uni', {
  getStorageSync: (key) => (storage.has(key) ? storage.get(key) : ''),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key)
});

vi.mock('@/api', () => ({
  api: {
    bootstrap: vi.fn(),
    ensureCustomerSession: vi.fn()
  }
}));

import { api } from '@/api';
import { expireStaleTable, init, state } from './index';

const cst = (value) => Date.parse(`${value}+08:00`);
const STORE = { id: 'sh', name: '上海·西岸店', positions: ['A013'] };

function storeTable(entry) {
  storage.set('teahour.customer.store', 'sh');
  storage.set('teahour.customer.table', { tables: { sh: entry } });
}

describe('桌号缓存按天恢复', () => {
  beforeEach(() => {
    storage.clear();
    Object.assign(state, {
      store: null,
      storeChosen: false,
      seat: '',
      dining: 'takeaway',
      customer: null,
      loading: true,
      error: ''
    });
    api.bootstrap.mockResolvedValue({
      stores: [],
      store: STORE,
      categories: [],
      products: [],
      retail: []
    });
    api.ensureCustomerSession.mockResolvedValue(null);
  });

  it('昨天扫的桌号不恢复，并清掉缓存', async () => {
    storeTable({ seat: 'A013', dining: 'dine', at: cst('2026-11-01T21:00:00') });

    await init(true);

    expect(state.seat).toBe('');
    expect(state.dining).toBe('takeaway');
    expect(storage.get('teahour.customer.table').tables.sh).toBeUndefined();
  });

  it('当天扫的桌号仍然恢复', async () => {
    const today = cst('2026-11-02T09:30:00');
    storeTable({ seat: 'A013', dining: 'dine', at: today });

    await init(true);

    expect(state.seat).toBe('A013');
    expect(state.dining).toBe('dine');
    expect(storage.get('teahour.customer.table').tables.sh.seat).toBe('A013');
  });

  it('零点后回到前台：跨天桌号从内存与缓存一起清除', () => {
    state.store = STORE;
    state.seat = 'A013';
    state.dining = 'dine';
    storeTable({ seat: 'A013', dining: 'dine', at: cst('2026-11-01T21:00:00') });

    expect(expireStaleTable()).toBe(true);
    expect(state.seat).toBe('');
    expect(state.dining).toBe('takeaway');
    expect(storage.get('teahour.customer.table').tables.sh).toBeUndefined();
  });

  it('当天的桌号不会被误清', () => {
    state.store = STORE;
    state.seat = 'A013';
    state.dining = 'dine';
    storeTable({ seat: 'A013', dining: 'dine', at: cst('2026-11-02T09:30:00') });

    expect(expireStaleTable()).toBe(false);
    expect(state.seat).toBe('A013');
    expect(state.dining).toBe('dine');
  });
});
