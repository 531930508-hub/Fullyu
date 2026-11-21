import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 被测模块之间用相对 import 串起来，data: URL 里没法解析相对路径，
// 所以去掉 import 行、把两个模块拼成一段源码：export 保留，两边的名字不冲突。
const stripImports = (code) => code.replace(/^\s*import[^\n]*\n/gm, '');
const clockCode = await readFile(new URL('../utils/serverClock.js', import.meta.url), 'utf8');
const helperCode = await readFile(new URL('../utils/unpaidOrders.js', import.meta.url), 'utf8');
const rules = await import('data:text/javascript;base64,' +
  Buffer.from(stripImports(clockCode) + '\n' + stripImports(helperCode)).toString('base64'));
const home = await readFile(new URL('../pages/index/index.vue', import.meta.url), 'utf8');
const orderPage = await readFile(new URL('../pages/user/order/order.vue', import.meta.url), 'utf8');
const payModal = await readFile(new URL('../components/PayModelPage.vue', import.meta.url), 'utf8');
// 注释里会提到「老实现」「不要这么写」，校验实现时先刨掉注释，只留真正会跑的代码
const codeOnly = (source) => source
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// 测试里一律用带时区的时间串，跑测试的机器在哪个时区都不影响结果
const shanghai = (text) => Date.parse(text.replace(' ', 'T') + '+08:00');

test('createTime 按服务器时区解析，不受设备时区影响', () => {
  // 后端给的是东八区的无时区本地时间：11-19 10:00 就是 02:00Z
  assert.equal(rules.parseServerTime('2026-11-19 10:00:00'), Date.parse('2026-11-19T02:00:00Z'));
  assert.equal(rules.parseServerTime('2026-11-19T10:00:00'), Date.parse('2026-11-19T02:00:00Z'));
  // 已经带时区的时间串按它自己的时区解析，不能再套服务器时区
  assert.equal(rules.parseServerTime('2026-11-19T02:00:00Z'), Date.parse('2026-11-19T02:00:00Z'));
  assert.equal(rules.parseServerTime('2026-11-19T10:00:00+08:00'), Date.parse('2026-11-19T02:00:00Z'));
  assert.ok(Number.isNaN(rules.parseServerTime('')));
  assert.ok(Number.isNaN(rules.parseServerTime(null)));
});

test('倒计时按订单自己的超时窗计算，过期归零', () => {
  const now = shanghai('2026-11-19 10:03:00');
  assert.equal(rules.unpaidSecondsLeft({ createTime: '2026-11-19 10:00:00', overTimeSeconds: 300 }, 300, now), 120);
  assert.equal(rules.unpaidSecondsLeft({ createTime: '2026-11-19 09:50:00', overTimeSeconds: 300 }, 300, now), 0);
  assert.equal(rules.unpaidSecondsLeft({ createTime: '2026-11-19 10:00:00' }, 300, now), 120, '后端没给超时秒数时用兜底值');
});

test('券单用订单自己的 60 秒超时窗，不套 300 秒', () => {
  const now = shanghai('2026-11-19 10:00:30');
  assert.equal(rules.unpaidSecondsLeft({ createTime: '2026-11-19 10:00:00', overTimeSeconds: 60 }, 300, now), 30);
  // 同样的创建时间，产品单还剩 270 秒
  assert.equal(rules.unpaidSecondsLeft({ createTime: '2026-11-19 10:00:00', overTimeSeconds: 300 }, 300, now), 270);
});

test('设备时钟偏移由响应头 Date 校准', () => {
  rules.resetServerClock();
  const nowMs = Date.now();
  // 用「此刻」创建的订单，避免测试依赖当前真实日期：带 Z 的时间串按绝对时刻解析
  const order = { createTime: new Date(nowMs).toISOString(), overTimeSeconds: 300 };
  // 服务端比设备快 90 秒：响应头 Date 就是「设备时间 + 90 秒」
  assert.equal(rules.syncServerClock(new Date(nowMs + 90000).toUTCString()), true);
  const left = rules.unpaidSecondsLeft(order, 300, rules.serverNow());
  const naive = rules.unpaidSecondsLeft(order, 300, nowMs);
  assert.ok(Math.abs((naive - left) - 90) <= 1, '校准后剩余时间应比用设备时钟少 90 秒');
  // 抖动在死区内不重复校准，避免倒计时来回跳
  assert.equal(rules.syncServerClock(new Date(nowMs + 91000).toUTCString()), false);
  // 手改过手机时间（差几个小时）也能校准回来：这才是真正要救的场景
  rules.resetServerClock();
  assert.equal(rules.syncServerClock(new Date(nowMs + 5 * 3600 * 1000).toUTCString()), true);
  assert.ok(Math.abs((rules.serverNow() - Date.now()) - 5 * 3600 * 1000) <= 1000, '校准后 serverNow 要跟着偏移');
  // 离谱到 7 天以上的响应头不参与校准
  rules.resetServerClock();
  assert.equal(rules.syncServerClock(new Date(nowMs + 8 * 24 * 3600 * 1000).toUTCString()), false);
  rules.resetServerClock();
  assert.equal(rules.syncServerClock(''), false);
  assert.equal(rules.hasServerClock(), false);
});

test('倒计时时钟只保留一套补零实现，三个入口共用', () => {
  // 秒 → HH:MM:SS：分秒补零、小时不截断、负数与非法值落到 00:00:00
  assert.equal(rules.formatCountdownClock(0), '00:00:00');
  assert.equal(rules.formatCountdownClock(9), '00:00:09');
  assert.equal(rules.formatCountdownClock(299), '00:04:59');
  assert.equal(rules.formatCountdownClock(3600), '01:00:00');
  assert.equal(rules.formatCountdownClock(3661), '01:01:01');
  assert.equal(rules.formatCountdownClock(60), '00:01:00');
  assert.equal(rules.formatCountdownClock(-5), '00:00:00');
  assert.equal(rules.formatCountdownClock(undefined), '00:00:00');
  assert.equal(rules.formatCountdownClock('61'), '00:01:01', '接口给的秒数可能是字符串');
  // 首页卡片、订单列表、支付弹框都只加自己的前缀，数字部分不再各写一遍补零
  for (const [name, source] of [['首页', home], ['订单列表', orderPage], ['支付弹框', payModal]]) {
    assert.match(source, /formatCountdownClock\(/, name + ' 要用共用的时钟格式');
    assert.doesNotMatch(source, /hours < 10/, name + ' 不能再留一份自己的补零逻辑');
  }
});

test('支付弹框只在有真实截止时刻时显示倒计时，不自减、不伪造 300 秒窗口', () => {
  const code = codeOnly(payModal);
  // 没有截止时刻（仅退款打回未付款、createTime 解析不出来）就不挂角标，也不编一个支付窗口
  assert.match(code, /<view class="countdown-timer" v-if="hasDeadline">/);
  assert.doesNotMatch(code, /constant\.payCutDownSeconds/, '不能再用 300 秒兜底假扮支付窗口');
  assert.doesNotMatch(code, /countdown\.value--/, '倒计时必须每秒从截止时刻重算，不能自减');
  assert.match(code, /Math\.ceil\(\(deadlineMs - serverNow\(\)\) \/ 1000\)/);
  // 打开弹框时窗口已经过了：直接停在提示位，不开一个每秒空转的定时器
  assert.match(code, /if \(refreshCountdown\(\) <= 0\) \{\s*payWindowEnded\.value = true;\s*return;\s*\}/);
});

test('列表倒计时只挂未付单，已付款的单不动', () => {
  const list = [
    { id: 1, state: 0, createTime: '2026-11-19 10:00:00' },
    { id: 2, state: 1, createTime: '2026-11-19 09:00:00' }
  ];
  rules.applyUnpaidCountdowns(list, 300, shanghai('2026-11-19 10:01:00'));
  assert.equal(list[0].cutdown, 240);
  assert.equal(list[0].payDeadlineMs, shanghai('2026-11-19 10:05:00'), '截止时刻要缓存下来供每秒重算');
  assert.equal(list[1].cutdown, undefined);
  assert.equal(list[1].payDeadlineMs, undefined);
});

test('待支付队列只按服务端 state 排队，倒计时归零的单仍留在队列里', () => {
  const orders = [
    { id: '9', state: 0, cutdown: 200, createTime: '2026-11-19 10:02:00' },
    { id: '8', state: 0, cutdown: 60, createTime: '2026-11-19 10:00:00' },
    // 本地倒计时已归零，但服务端还是未支付：这时后端多半还没关单，必须继续给它支付入口
    { id: '7', state: 0, cutdown: 0, createTime: '2026-11-19 09:58:00' },
    { id: '6', state: 1, cutdown: 120, createTime: '2026-11-19 09:57:00' }
  ];
  assert.deepEqual(rules.buildUnpaidQueue(orders).map(o => o.id), ['7', '8', '9'], '先付最早超时的一笔，含已到点但未关闭的');
  assert.deepEqual(rules.buildUnpaidQueue(orders, ['8']).map(o => o.id), ['7', '9'], '刚付完的单即使回执未落库也不能再拉起一次支付');
  assert.deepEqual(rules.buildUnpaidQueue(orders, ['7', '8', '9']), []);
});

test('倒计时每秒从截止时刻重算，且不在本地改写订单状态', () => {
  const orders = [
    { id: 1, state: 0, createTime: '2026-11-19 10:00:00', overTimeSeconds: 300, cutdown: 300 },
    { id: 2, state: 0, createTime: '2026-11-19 10:00:00', overTimeSeconds: 300, cutdown: 120 },
    { id: 3, state: 1, createTime: '2026-11-19 10:00:00', cutdown: 300 }
  ];
  // 模拟切后台 200 秒后回来：靠自减只少 1 秒，重算才能对
  const ended = rules.tickUnpaidCountdowns(orders, shanghai('2026-11-19 10:02:00'));
  assert.deepEqual(orders.map(o => o.cutdown), [180, 180, 300]);
  assert.deepEqual(ended, [], '还没到点时不触发刷新');

  // 到点：不把 state 改成已关闭，能不能付由服务端决定；同一秒只上报一次
  const expired = rules.tickUnpaidCountdowns(orders, shanghai('2026-11-19 10:05:01'));
  assert.deepEqual(orders.map(o => o.state), [0, 0, 1]);
  assert.deepEqual(orders.map(o => o.cutdown), [0, 0, 300]);
  assert.deepEqual(expired.map(o => o.id), [1, 2], '到点的单上报一次，页面据此刷新一次');

  const again = rules.tickUnpaidCountdowns(orders, shanghai('2026-11-19 10:05:02'));
  assert.deepEqual(again, [], '同一批到点的单不应反复触发刷新');
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

test('首页的支付入口由服务端 state 决定，本地倒计时归零不隐藏入口', () => {
  // 倒计时只影响文案，不再参与 canPay / canRebook 的判定
  assert.match(home, /canPay: unpaid,/);
  assert.doesNotMatch(home, /canPay: unpaid && !expired/);
  assert.doesNotMatch(home, /canRebook: state === 3 \|\| appointmentState === 2 \|\| expired/);
  // 点支付时先向服务端核对状态，而不是拿本地倒计时挡掉
  assert.match(home, /latest = await orderApi\.infoWithDetail\(record\.id\)/);
  assert.match(home, /Number\(latest\.state\) !== 0/);
  // 倒计时按截止时刻重算，弹框拿绝对截止时刻
  assert.match(home, /const ended = tickUnpaidCountdowns\(lastOrderInfo\.value\)/);
  assert.match(home, /payDeadline\.value = payDeadlineMs/);
});

test('订单列表页同样不再本地判死，也不自减倒计时', () => {
  assert.match(orderPage, /tickUnpaidCountdowns\(data\.tableData\)/);
  assert.doesNotMatch(orderPage, /o\.state = 3/, '本地没有关闭订单的权力');
  assert.doesNotMatch(orderPage, /o\.cutdown = Math\.max\(0, o\.cutdown - 1\)/);
  assert.match(orderPage, /applyUnpaidCountdowns\(list\)/);
  // iOS 上 Date.parse('2026-11-19 10:00:00') 是 NaN，不能再用它判断支付窗口
  assert.doesNotMatch(home, /Date\.parse\(orderInfo\.value\.createTime\)/);
  assert.doesNotMatch(orderPage, /Date\.parse\(orderInfo\.value\.createTime\)/);
  assert.doesNotMatch(orderPage, /Date\.parse\(record\.createTime\)/);
});