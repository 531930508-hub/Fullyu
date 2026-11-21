import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 仅退款（不取消预约）之后，真金白银付过的单会回到「未付款」，预约却可能已经停在已到店/已完成。
// 这种单必须还能取消，否则永远挂在看板上既不能收款也不能关单。
// 这里直接取模板里的 v-if 原样求值，改条件时测试会跟着红。
const NOT_PAY = 0, PAID_NOT_COMMENT = 1, PAID_COMMENTED = 2, REFUNDED = 6;
const WAITING = 0, DOING = 1, FINISHED = 2, CANCELED = 3;

const drawerSource = await readFile(new URL('../src/views/home/PadOrderDetail.vue', import.meta.url), 'utf8');
const listSource = await readFile(new URL('../src/views/order/OrderList.vue', import.meta.url), 'utf8');

function buttonCondition(source, label) {
  const re = /<el-button\b([^>]*)>\s*([^<>]*?)\s*<\/el-button>/g;
  for (const [, attrs, text] of source.matchAll(re)) {
    if (text.trim() !== label) continue;
    const condition = attrs.match(/v-if="([^"]+)"/);
    assert.ok(condition, `「${label}」按钮没有 v-if，测试用法要更新`);
    return condition[1];
  }
  assert.fail(`没有找到「${label}」按钮`);
}

const drawerCancel = buttonCondition(drawerSource, '取消订单');
const drawerRefundedCancel = buttonCondition(drawerSource, '已退款取消');
const listCancel = buttonCondition(listSource, '取消');
const listRefundedCancel = buttonCondition(listSource, '已退款取消');

function visible(expression, order, type = 0) {
  const run = new Function('orderDetail', 'scope', 'type', `return (${expression})`);
  return !!run({order}, {row: order, $index: 0}, type);
}

function order(state, appointmentState) {
  return {id: 1, state, appointmentState};
}

function shown(order, type) {
  return {
    drawer: visible(drawerCancel, order, type),
    list: visible(listCancel, order, type),
  };
}

test('仅退款回到未付款的单：预约已完成也能取消', () => {
  assert.deepEqual(shown(order(NOT_PAY, FINISHED)), {drawer: true, list: true},
    '看板和订单列表都要留取消入口，否则这一单永远关不掉');
});

test('仅退款回到未付款的单：预约在任意未取消状态都能取消', () => {
  for (const appointmentState of [WAITING, DOING, FINISHED]) {
    assert.deepEqual(shown(order(NOT_PAY, appointmentState)), {drawer: true, list: true},
      `未付款 + 预约状态 ${appointmentState} 应能取消`);
  }
});

test('已付款的单：预约未完成前可以取消', () => {
  for (const state of [PAID_NOT_COMMENT, PAID_COMMENTED]) {
    for (const appointmentState of [WAITING, DOING]) {
      assert.deepEqual(shown(order(state, appointmentState)), {drawer: true, list: true},
        `已付款 ${state} + 预约 ${appointmentState} 应能取消`);
    }
    assert.deepEqual(shown(order(state, FINISHED)), {drawer: false, list: false},
      '已付款且服务已完成，取消走仅退款/已退款取消，不给普通取消入口');
  }
});

test('已退款单只给「已退款取消」，且预约没取消就能点', () => {
  for (const appointmentState of [WAITING, DOING, FINISHED]) {
    const refunded = order(REFUNDED, appointmentState);
    assert.deepEqual(shown(refunded), {drawer: false, list: false});
    assert.equal(visible(drawerRefundedCancel, refunded), true, `预约 ${appointmentState} 应能已退款取消`);
    assert.equal(visible(listRefundedCancel, refunded), true, `预约 ${appointmentState} 应能已退款取消`);
  }
  const canceledAppointment = order(REFUNDED, CANCELED);
  assert.equal(visible(drawerRefundedCancel, canceledAppointment), false);
  assert.equal(visible(listRefundedCancel, canceledAppointment), false);
});

test('已取消/已超时的单不再给取消入口', () => {
  for (const state of [3, 4]) {
    assert.deepEqual(shown(order(state, CANCELED)), {drawer: false, list: false});
    assert.deepEqual(shown(order(state, DOING)), {drawer: false, list: false});
  }
});

test('接待单沿用原来的取消口径', () => {
  assert.equal(visible(listCancel, order(PAID_NOT_COMMENT, WAITING), 1), true);
  assert.equal(visible(listCancel, order(NOT_PAY, FINISHED), 1), false, '接待单不该被预约单的放宽带进来');
});