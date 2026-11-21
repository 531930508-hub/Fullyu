import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/customParseFormat'));
const source = readFileSync(new URL('../src/views/home/Board.vue', import.meta.url), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)![1];
const projects = [{id: 1, type: 1, category: 1, title: '头部水疗'}, {id: 2, type: 2, category: 1, title: '全感舒筋'}];

function setup() {
  const saves: any[] = [];
  const confirmations: any[] = [];
  const warnings: string[] = [];
  const context: any = {
    console: {log() {}}, window: {innerHeight: 800, innerWidth: 1600},
    mapGetters: () => ({}), dayjs, setTimeout,
    dateUtil: {format: (value: string, format: string) => dayjs(value).format(format)},
    projectApi: {list: async () => ({data: projects})},
    orderDetailApi: {schedulingMap: async () => ({data: []}), updateOrderDetail: async (p: any) => saves.push(p)},
    document: {querySelectorAll: () => [], elementFromPoint: () => null}
  };
  for (const [, name] of script.matchAll(/import\s+(\w+)\s+from/g)) if (!(name in context)) context[name] = {};
  vm.createContext(context);
  vm.runInContext(script.replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options ='), context);
  const state = Object.assign(context.options.data(), context.options.methods);
  state.isMassagist = false;
  state.searchForm = {date: '2026-11-21', shopId: 1, type: 1, massagistId: ''};
  state.timeList = ['14:00', '14:15', '14:30', '14:45', '15:00', '15:15', '15:30', '15:45'];
  state.fetchShopTimeList = async () => {};
  state.$nextTick = (fn: any) => fn();
  state.$message = {warning: (s: string) => warnings.push(s), error: (s: string) => warnings.push(s), success() {}};
  state.$createElement = (_tag: any, _props: any, text: any) => text;
  state.$confirm = async (message: any) => { confirmations.push(message); };
  state.$refs = {refMainWrapper: {getBoundingClientRect: () => ({top: 100}), scrollTop: 0}};
  return {state, context, saves, confirmations, warnings};
}

function dragFixture() {
  const fixture = setup();
  const {state, context} = fixture;
  const detail = {id: 101, bedId: 5, bedType: 1, bedName: '湿1', projectId: 1, projectTitle: '头部水疗',
    massagistId: 11, massagist: {name: '疗愈师甲'}, startTime: '2026-11-21 14:00:00', duration: 60, state: 0};
  state.dataList = [{id: 5, name: '湿1', type: 1, orderDetailList: [detail]}, {id: 7, name: '干1', type: 2, orderDetailList: []}];
  const column = {dataset: {itemId: '7'}, getBoundingClientRect: () => ({top: 110}), closest() {return this;}};
  context.document.elementFromPoint = () => column;
  const item = {dataset: {detailId: '101'}, getBoundingClientRect: () => ({left: 76, top: 118})};
  const from = {dataset: {itemId: '5'}};
  const to = {dataset: {itemId: '7'}};
  state.onDragStart({item, from, oldIndex: 0, originalEvent: {clientX: 110, clientY: 148}});
  state.lastMouseX = 280;
  state.lastMouseY = 148;
  return {...fixture, detail, item, from, to, end: {item, from, to, newIndex: 0}};
}

test('鼠标不长按，只有触摸使用启动延迟', () => {
  assert.match(source, /:delayOnTouchOnly="true"/);
  assert.doesNotMatch(source, /delayOnTouchStart/);
});

test('拖动或确认期间不请求刷新看板', async () => {
  for (const key of ['isDragging', 'pendingMove']) {
    const {state, context} = setup();
    let requests = 0;
    context.orderDetailApi.schedulingMap = async () => {requests++; return {data: []};};
    state[key] = true;
    await state.updateData();
    assert.equal(requests, 0, key);
  }
});

test('拖动前发出的迟到响应不能覆盖拖动中的数据', async () => {
  const {state, context} = setup();
  let resolve: any;
  context.orderDetailApi.schedulingMap = () => new Promise(r => {resolve = r;});
  const data = [{id: 5}];
  state.dataList = data;
  const pending = state.updateData();
  state.isDragging = true;
  resolve({data: [{id: 99}]});
  await pending;
  assert.equal(state.dataList, data);
});

test('营业时间的迟到响应不能在拖动时改变时间轴', async () => {
  const {state, context} = setup();
  let resolve: any;
  context.shopApi.timeShopEnd = async () => ({data: '22:00'});
  context.shopApi.timeList = () => new Promise(r => {resolve = r;});
  context.shopApi.timeListNew = async () => ({data: {}});
  const original = state.timeList;
  const pending = context.options.methods.fetchShopTimeList.call(state);
  for (let i = 0; i < 5 && !resolve; i++) await Promise.resolve();
  state.isDragging = true;
  resolve({data: ['10:00']});
  await pending;
  assert.equal(state.timeList, original);
});

test('查询项在项目预览加载期间改变时不保存旧操作', async () => {
  const {state, context, saves, warnings, end} = dragFixture();
  state.updateData = async () => {};
  context.projectApi.list = async () => {
    state.searchForm.date = '2026-11-22';
    return {data: projects};
  };
  await state.onDragEnd(end);
  assert.equal(saves.length, 0);
  assert.match(warnings.join(''), /已变化/);
});

test('定时更新时间不抢用户滚动位置', () => {
  const {state} = setup();
  let located = 0;
  state.scrollToCurrentTime = () => located++;
  state.updateTime();
  assert.equal(located, 0);
});

test('非整刻跨小时的位置按完整分钟差计算', () => {
  const {state} = setup();
  state.timeList = ['13:30', '13:45', '14:00'];
  state.calculateOverlapOffset = () => ({leftOffset: 16, width: 128, zIndex: 1});
  const style = state.getStyle({startTime: '2026-11-21 13:50:00', duration: 60}, 1);
  assert.ok(Math.abs(parseFloat(style.top) - (20 / 15 * 80 + 8)) < 0.01);
});

test('按拖起时的订单ID保存，不依赖拖拽库的目标数组索引', async () => {
  const {state, saves, confirmations, end} = dragFixture();
  state.updateData = async () => {};
  await state.onDragEnd(end);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, 101);
  assert.equal(saves[0].bedId, '7');
  assert.equal(saves[0].startTime, '2026-11-21 14:00:00');
  assert.match(String(confirmations[0]), /头部水疗/);
  assert.match(String(confirmations[0]), /全感舒筋/);
  assert.match(String(confirmations[0]), /疗愈师甲/);
  assert.match(String(confirmations[0]), /湿1/);
  assert.match(String(confirmations[0]), /干1/);
});

test('确认尚未完成时保持操作锁，取消后不保存并恢复数据', async () => {
  const {state, saves, end} = dragFixture();
  let reject: any;
  let refreshed = 0;
  state.$confirm = () => new Promise((_resolve, r) => {reject = r;});
  state.updateData = async () => {refreshed++;};
  const pending = state.onDragEnd(end);
  for (let i = 0; i < 5 && !reject; i++) await Promise.resolve();
  assert.equal(state.pendingMove, true);
  reject('cancel');
  await pending;
  assert.equal(saves.length, 0);
  assert.equal(refreshed, 1);
  assert.equal(state.pendingMove, false);
  assert.equal(state.isDragging, false);
});

test('落在看板外明确提示且不保存', async () => {
  const {state, context, saves, warnings, end} = dragFixture();
  context.document.elementFromPoint = () => null;
  state.updateData = async () => {};
  await state.onDragEnd(end);
  assert.equal(saves.length, 0);
  assert.equal(warnings.length, 1);
});

test('服务端拒绝换位后刷新恢复，解除操作锁', async () => {
  const {state, context, saves, end} = dragFixture();
  let refreshed = 0;
  state.updateData = async () => {refreshed++;};
  context.orderDetailApi.updateOrderDetail = async () => {throw 'error';};
  await state.onDragEnd(end);
  assert.equal(saves.length, 0);
  assert.equal(refreshed, 1);
  assert.equal(state.pendingMove, false);
});

test('跨区互换预览写明双方项目和疗愈师保持不变', () => {
  const {state, detail} = dragFixture();
  const target = {...detail, id: 102, bedId: 7, bedType: 2, bedName: '干1', projectId: 2,
    projectTitle: '全感舒筋', massagistId: 12, massagist: {name: '疗愈师乙'}, startTime: '2026-11-21 15:00:00'};
  const message = state.buildSwapMessage(detail, target, projects);
  assert.match(message, /疗愈师甲/);
  assert.match(message, /疗愈师乙/);
  assert.match(message, /头部水疗/);
  assert.match(message, /全感舒筋/);
  assert.match(message, /湿1/);
  assert.match(message, /干1/);
});
