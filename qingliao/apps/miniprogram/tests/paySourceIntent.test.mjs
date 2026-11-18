import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pay = await readFile(new URL('../components/PayModelPage.vue', import.meta.url), 'utf8');
const orderApi = await readFile(new URL('../api/order.js', import.meta.url), 'utf8');

test('0 元单结清把界面上选中的优惠来源一起传给服务端', () => {
  // 服务端只在「用户明确选了券」时才核销券：不传等于没有意图，券单不会被结清
  assert.match(orderApi, /settleZero\(orderId, priceSource\)/);
  assert.match(orderApi, /params\.priceSource = priceSource/);
  assert.match(pay, /settleZero\(order\.id, selectedSource\.value\)/);
});

test('点微信支付必须等服务端真的切了方案，切不过去不能先把界面摆成微信支付', () => {
  assert.match(pay, /const payMothed = async \(text\) =>/);
  assert.match(pay, /await choosePriceSource\(5\)/);
  assert.match(pay, /await choosePriceSource\(target\)/);
  // 没有任何现金方案时按原价走：也要落到服务端（choosePriceSource(0)），不能只改本地显示
  assert.match(pay, /await choosePriceSource\(0\)/);
  assert.doesNotMatch(pay, /payMothedValue\.value = text\s*\n\s*selectedSource\.value = null/,
    '本地把支付方式改成微信、优惠来源清空，会让确认时走到券支付分支');
});

test('切换方案失败要告知用户并保持原选中项', () => {
  assert.match(pay, /切换支付方式失败, 请重试/);
  const start = pay.indexOf('const choosePriceSource');
  const body = pay.slice(start, pay.indexOf('const payMothed = ', start));
  assert.ok(body.length > 0, 'choosePriceSource 应该位于 payMothed 之前');
  assert.match(body, /catch \(e\) \{[\s\S]*?return false/);
  assert.match(body, /return true/);
});

test('购券意图只对当时那张单有效，打开别的单不能自动核销券', () => {
  assert.match(pay, /if \(waitOrderId && order\.id && waitOrderId != order\.id\) \{\s*waitOrderId = null/);
});
