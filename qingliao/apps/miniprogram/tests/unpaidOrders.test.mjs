import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const helperCode = await readFile(new URL('../utils/unpaidOrders.js', import.meta.url), 'utf8');
const rules = await import('data:text/javascript;base64,' + Buffer.from(helperCode).toString('base64'));
const home = await readFile(new URL('../pages/index/index.vue', import.meta.url), 'utf8');

const at = (text) => Date.parse(text.replace(/-/g, '/'));

test('倒计时按订单自己的超时窗计算，过期归零', () => {
  const now = at('2026-11-19 10:03:00');
  assert.equal(rules.unpaidSecondsLeft({ createTime: '2026-11-19 10:00:00', overTimeSeconds: 300 }, 300, now), 120);
  assert.equal(rules.unpaidSecondsLeft({ createTime: '2026-11-19 09:50:00', overTimeSeconds: 300 }, 300, now), 0);
  assert.equal(rules.unpaidSecondsLeft({ createTime: '2026-11-19 10:00:00' }, 300, now), 120, '后端没给超时秒数时用兜底值');
});

test('列表倒计时只挂未付单，已付款的单不动', () => {
  const list = [
    { id: 1, state: 0, createTime: '2026-11-19 10:00:00' },
    { id: 2, state: 1, createTime: '2026-11-19 09:00:00' }
  ];
  rules.applyUnpaidCountdowns(list, 300, at('2026-11-19 10:01:00'));
  assert.equal(list[0].cutdown, 240);
  assert.equal(list[1].cutdown, undefined);
});

test('待支付队列先付最先超时的一笔，并排除本轮已付的单', () => {
  const orders = [
    { id: '9', state: 0, cutdown: 200, createTime: '2026-11-19 10:02:00' },
    { id: '8', state: 0, cutdown: 60, createTime: '2026-11-19 10:00:00' },
    { id: '7', state: 0, cutdown: 0, createTime: '2026-11-19 09:58:00' },
    { id: '6', state: 1, cutdown: 120, createTime: '2026-11-19 09:57:00' }
  ];
  assert.deepEqual(rules.buildUnpaidQueue(orders).map(o => o.id), ['8', '9']);
  assert.deepEqual(rules.buildUnpaidQueue(orders, ['8']).map(o => o.id), ['9'], '刚付完的单即使回执未落库也不能再拉起一次支付');
  assert.deepEqual(rules.buildUnpaidQueue(orders, ['8', '9']), []);
});

test('倒计时到点的单本地先按已关闭标记，且整轮只刷新一次', () => {
  const orders = [
    { id: 1, state: 0, cutdown: 1, appointmentState: 0 },
    { id: 2, state: 0, cutdown: 1, appointmentState: 0 },
    { id: 3, state: 1, cutdown: 1, appointmentState: 1 }
  ];
  assert.equal(rules.tickUnpaidCountdowns(orders), true);
  assert.deepEqual(orders.map(o => [o.cutdown, o.state, o.appointmentState]), [[0, 3, 3], [0, 3, 3], [1, 1, 1]]);
  assert.equal(rules.tickUnpaidCountdowns(orders), false, '同一批到期的单不应反复触发刷新');
});

test('首页接入连续支付：队列驱动卡片、换单重建弹框、付完仍有未付单不跳成功页', () => {
  assert.match(home, /buildUnpaidQueue\(lastOrderInfo\.value, paidOrderIds\.value\)/);
  assert.match(home, /const heroRaw = computed\(\(\) => unpaidQueue\.value\[0\]/);
  assert.match(home, /<PayModelPage :key="payModalKey"/);
  assert.match(home, /payModalKey\.value \+= 1/);
  assert.match(home, /const nextOrder = unpaidQueue\.value\[0\]/);
  assert.match(home, /handleToPay\(nextOrder\)/);
  assert.match(home, /paidOrderIds\.value = \[\.\.\.paidOrderIds\.value, String\(paymentData\)\]/);
  assert.ok(home.indexOf('const nextOrder = unpaidQueue.value[0]') < home.indexOf('appointment-success?topdisplayStatus=false'),
    '还有未付单时必须先续付，不能直接跳预约成功页');
});