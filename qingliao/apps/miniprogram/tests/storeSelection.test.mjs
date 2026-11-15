import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
let rules;
try {
  const code = await readFile(new URL('../utils/storeSelection.js', import.meta.url), 'utf8');
  rules = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
} catch { rules = {}; }

const stores = [
  { id: 1, name: '人广来福士店', latitude: 31.2304, longitude: 121.4737, distanceInMeters: 3.2 },
  { id: 2, name: '静安嘉里店', latitude: 31.2230, longitude: 121.4450, distanceInMeters: 1.1 },
  { id: 3, name: '徐汇滨江店', latitude: 31.1900, longitude: 121.4600, distanceInMeters: 5.7 }
];

test('explicit store from entry link wins over location', () => {
  assert.equal(typeof rules.pickDefaultStore, 'function', '门店选择规则尚未实现');
  const id = rules.pickDefaultStore(stores, { shopId: '3', latitude: 31.2304, longitude: 121.4737 });
  assert.equal(id, 3);
});

test('without explicit store the nearest one is selected', () => {
  const id = rules.pickDefaultStore(stores, { latitude: 31.2250, longitude: 121.4500 });
  assert.equal(id, 2);
});

test('distance is computed from coordinates when backend distance is missing', () => {
  const raw = stores.map(({ distanceInMeters, ...s }) => s);
  const id = rules.pickDefaultStore(raw, { latitude: 31.2250, longitude: 121.4500 });
  assert.equal(id, 2);
});

test('backend distance is used when coordinates are missing', () => {
  const raw = [
    { id: 1, name: 'A', distanceInMeters: 4.4 },
    { id: 2, name: 'B', distanceInMeters: 0.8 },
    { id: 3, name: 'C' }
  ];
  assert.equal(rules.pickDefaultStore(raw, {}), 2);
});

test('unknown explicit store falls back to nearest instead of breaking', () => {
  const id = rules.pickDefaultStore(stores, { shopId: 999, latitude: 31.2304, longitude: 121.4737 });
  assert.equal(id, 1);
});

test('no location keeps the preferred store, otherwise the first one', () => {
  const raw = stores.map(({ distanceInMeters, latitude, longitude, ...s }) => s);
  assert.equal(rules.pickDefaultStore(raw, { preferredId: 3 }), 3);
  assert.equal(rules.pickDefaultStore(raw, {}), 1);
});

test('empty store list returns null', () => {
  assert.equal(rules.pickDefaultStore([], { latitude: 1, longitude: 1 }), null);
  assert.equal(rules.pickDefaultStore(null, {}), null);
});

test('distance text keeps one decimal and hides unknown values', () => {
  assert.equal(typeof rules.distanceText, 'function', '距离文案规则尚未实现');
  assert.equal(rules.distanceText(stores[1]), '1.1km');
  assert.equal(rules.distanceText({ id: 9 }), '');
  assert.equal(rules.distanceText({ id: 9, distanceInMeters: 0 }), '');
});
