import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
let rules;
try {
  const code = await readFile(new URL('../utils/bookingSelection.js', import.meta.url), 'utf8');
  rules = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
} catch { rules = {}; }

test('loading and invalid slots cannot confirm', () => {
  assert.equal(typeof rules.canConfirmBooking, 'function', '预约确认规则尚未实现');
  assert.equal(rules.canConfirmBooking(true, '14:00', [{time:'14:00', state:1}]), false);
  assert.equal(rules.canConfirmBooking(false, '14:00', [{time:'14:00', state:0}]), false);
  assert.equal(rules.canConfirmBooking(false, '14:00', [{time:'15:00', state:1}]), false);
});
test('only a current available slot can confirm', () => {
  assert.equal(typeof rules.canConfirmBooking, 'function');
  assert.equal(rules.canConfirmBooking(false, '14:00', [{time:'14:00', state:1}]), true);
  assert.equal(rules.canConfirmBooking(false, null, []), false);
});
test('string backend errors preserve store explanation', () => {
  assert.equal(typeof rules.bookingFailureMessage, 'function');
  assert.equal(rules.bookingFailureMessage('所选疗愈师在当前门店没有当天排班'), '所选疗愈师在当前门店没有当天排班');
});
test('network objects get a readable fallback', () => {
  assert.equal(typeof rules.bookingFailureMessage, 'function');
  assert.equal(rules.bookingFailureMessage({errno:600001}), '暂时无法确认预约，请稍后重试');
});
