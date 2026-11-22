import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/home/Board.vue', import.meta.url), 'utf8');
const template = source.slice(0, source.indexOf('<script>'));
const scriptSource = source.match(/<script>([\s\S]*?)<\/script>/)[1];
function toScript(raw, context) {
  for (const [, name] of raw.matchAll(/import\s+(\w+)\s+from/g)) if (!(name in context)) context[name] = {};
  return raw.replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options =');
}
function setup(roles) {
  const requests = [];
  const context = vm.createContext({
    mapGetters: () => ({
      roles, massagistId: 9, avatar: '', sidebar: {opened: true}, shopList: [], shopId: 3
    }),
    console: {log() {}},
    window: {innerHeight: 800, innerWidth: 1600},
    dateUtil: {getCurrentDateCode: () => '2026-11-21'},
    shopApi: {},
    orderDetailApi: {
      schedulingMap: async params => {
        requests.push({...params});
        return {data: []};
      }
    },
    massagistSchedulesApi: {
      myDay: async () => ({data: {hasSchedule: true, shopId: 5, shops: [{shopId: 5, label: '排班门店'}]}})
    },
    roundScheduleApi: {queuePositions: async () => ({data: []})}
  });
  vm.runInContext(toScript(scriptSource, context), context);
  const state = Object.assign(context.options.data(), context.options.methods);
  Object.defineProperty(state, 'isMassagist', {
    get() {
      return this.roles.filter(s => s == '疗愈师').length > 0;
    }
  });
  state.roles = roles;
  state.$refs = {};
  state.$nextTick = fn => fn();
  state.fetchShopTimeList = () => {};
  state.updateTime = () => {};
  state.fetchReceptionData = () => {};
  return {state, requests};
}

test('床位和疗愈师两种视图对疗愈师都可切换', () => {
  assert.doesNotMatch(template, /v-if="!isMassagist"[^>]*v-model="searchForm\.type"/, '疗愈师不应被隐藏床位/疗愈师切换');
  assert.match(template, /<el-radio-button :label="1">床位<\/el-radio-button>[\s\S]*?<el-radio-button :label="2">疗愈师<\/el-radio-button>/);
});
test('疗愈师默认进入床位视图', () => {
  const {state} = setup(['疗愈师']);
  let fetched = 0;
  state.fetchData = () => {
    fetched++;
  };
  state.initData();
  assert.equal(fetched, 1);
  assert.equal(state.searchForm.type, 1, '疗愈师默认视图应为床位');
  assert.equal(state.searchForm.massagistId, '', '床位视图不应限定本人');
});
test('疗愈师在床位视图按当天排班门店拉取看板且请求 type=1', async () => {
  const {state, requests} = setup(['疗愈师']);
  state.searchForm.type = 1;
  state.searchForm.date = '2026-11-21';
  await state.updateData();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].type, 1);
  assert.equal(requests[0].shopId, 5, '门诊按当天排班所在门店解析');
});
test('疗愈师切回疗愈师视图时不被强制改回床位', async () => {
  const {state, requests} = setup(['疗愈师']);
  state.searchForm.type = 2;
  state.searchForm.date = '2026-11-21';
  await state.updateData();
  assert.equal(state.searchForm.type, 2);
  assert.equal(requests[0].type, 2);
  assert.equal(state.searchForm.massagistId, '', '疗愈师视图仍看全店排班');
});
test('床位视图对疗愈师依旧是只读：拖拽、新增预约与写入入口都关闭', () => {
  assert.match(template, /:disabled="isMassagist \|\| item\.type == 0 \|\| pendingMove"/);
  assert.match(template, /:read-only="isMassagist"/);
  const {state} = setup(['疗愈师']);
  let openedAppointment = 0;
  let openedDetail = null;
  state.timeGreyNew = () => false;
  state.timeGrey = () => false;
  state.$refs = {refAppointmentDrawer: {open: () => openedAppointment++}, refPadOrderDetail: {open: d => (openedDetail = d)}};
  state.showAppointment({id: 1}, '10:00');
  assert.equal(openedAppointment, 0, '疗愈师不能新增预约');
  state.handleItemClick({id: 2, type: 1}, {});
  assert.equal(openedDetail && openedDetail.id, 2, '点击订单只打开只读详情');
});