import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/statistics/salaryDetail/index.vue', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
function setup(overrides = {}) {
  const calls = [], loading = [];
  const context = vm.createContext({mapGetters: () => ({}), SalaryOtherAmountDialog: {}, setTimeout, clearTimeout,
    salaryRecordApi: {
      people: async params => {calls.push({kind: 'people', ...params}); return {data: {list: [{id: 7, name: '合成人员7', status: 1}], total: 55}}; },
      findMassagistAllMonthCode: async id => {calls.push({kind: 'months', id}); return {data: ['2026-10', '2026-09']}; },
      info: async params => {calls.push({kind: 'info', ...params}); return {data: {actualIncome: 123, ...params}}; },
      reset: async params => {calls.push({kind: 'reset', ...params}); }, ...overrides.salary
    }
  });
  if (overrides.people) context.salaryRecordApi.people = overrides.people;
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), context);
  const state = Object.assign(context.options.data(), context.options.methods, {roles: ['财务'], massagistId: 7, massagistList: [{id: 7, status: 1}],
    $store: {dispatch: async () => {throw new Error('must not fetch the whole person list');}},
    $options: {filters: {massagistNameFilter: id => '合成人员' + id}}, notifyConfirm: async () => {}, notifyWarning: () => {},
    showFullLoading: () => loading.push('show'), hideFullLoading: () => loading.push('hide')});
  for (const [name, getter] of Object.entries(context.options.computed)) Object.defineProperty(state, name, {get: () => getter.call(state)});
  return {state, calls, loading, options: context.options};
}
test('people selection uses the settlement-scoped minimal-field API', async () => {
  assert.match(source, /salaryRecordApi\.people\(params\)/);
  assert.doesNotMatch(source, /massagistApi/);
  const api = await readFile(new URL('../src/api/salaryRecord.js', import.meta.url), 'utf8');
  assert.match(api, /url: '\/salaryRecord\/people'/);
});
test('default people page is bounded and cooperating only', () => { const {state} = setup(); assert.equal(state.massagistStatus, 1); assert.equal(state.peoplePage, 1); assert.equal(state.peopleSize, 20); });
test('manager gets one server people page and loads only the selected person', async () => {
  const {state, calls} = setup(); await state.fetchPeoplePage();
  assert.equal(calls[0].kind, 'people'); assert.equal(calls[0].size, 20); assert.equal(calls[0].page, 1); assert.equal(calls[0].status, 1);
  assert.equal(state.peopleTotal, 55); assert.equal(state.people.length, 1); assert.equal(state.currentMassagistId, 7); assert.equal(state.salaryData.actualIncome, 123);
});
test('page two carries the name and all-state omits status instead of filtering minus one', async () => {
  const {state, calls} = setup(); state.massagistStatus = -1; state.massagistKeyword = '  合成  '; await state.handlePeoplePageChange(2);
  assert.equal(calls[0].page, 2); assert.equal(calls[0].name, '合成'); assert.equal(calls[0].status, undefined); assert.equal(calls[0].order, 'name,id');
});
test('empty state clears person month and detail but retains filter controls', async () => {
  const {state} = setup({people: async () => ({data: {list: [], total: 0}})});
  state.currentMassagistId = 7; state.selectedMonth = '2026-09'; state.salaryData = {actualIncome: 999}; state.peoplePage = 3;
  await state.handleStatusChange(); assert.equal(state.peoplePage, 1); assert.equal(state.currentMassagistId, ''); assert.equal(state.selectedMonth, ''); assert.equal(Object.keys(state.salaryData).length, 0);
  assert.doesNotMatch(source, /<div v-if="currentMassagistId" class="salary-detail"/); assert.match(source, /暂无符合筛选条件的疗愈师/);
});
test('stale people page cannot replace later status results', async () => {
  const pending = []; const {state} = setup({people: () => { const d = deferred(); pending.push(d); return d.promise; }});
  const old = state.fetchPeoplePage(); state.massagistStatus = 0; const newer = state.handleStatusChange();
  pending[1].resolve({data: {list: [{id: 9, name: '已结束合成人员'}], total: 1}}); await newer;
  pending[0].resolve({data: {list: [{id: 7}], total: 55}}); await old; assert.equal(state.currentMassagistId, 9); assert.equal(state.peopleTotal, 1);
});
test('old finally cannot hide current people spinner', async () => {
  const pending = []; const {state} = setup({people: () => {const d = deferred(); pending.push(d); return d.promise; }});
  const a = state.fetchPeoplePage(), b = state.fetchPeoplePage(); pending[0].resolve({data: {list: [], total: 0}}); await a;
  assert.equal(state.peopleLoading, true); pending[1].resolve({data: {list: [], total: 0}}); await b; assert.equal(state.peopleLoading, false);
});
test('person switch immediately removes old money before awaiting new months', async () => {
  const d = deferred(); const {state} = setup({salary: {findMassagistAllMonthCode: () => d.promise}});
  state.people = [{id: 7}, {id: 8}]; state.currentMassagistId = 7; state.selectedMonth = '2026-10'; state.salaryData = {actualIncome: 999};
  const request = state.handleUserSelect(8); assert.equal(Object.keys(state.salaryData).length, 0); assert.equal(state.selectedMonth, '');
  d.resolve({data: ['2026-09']}); await request; assert.equal(state.selectedMonth, '2026-09'); assert.equal(state.salaryData.massagistId, 8);
});
test('months from old person cannot replace new person months', async () => {
  const pending = []; const {state} = setup({salary: {findMassagistAllMonthCode: () => {const d = deferred(); pending.push(d); return d.promise; }}});
  state.people = [{id: 7}, {id: 8}]; const a = state.handleUserSelect(7), b = state.handleUserSelect(8);
  pending[1].resolve({data: ['2026-09']}); await b; pending[0].resolve({data: ['2026-10']}); await a;
  assert.equal(state.selectedMonth, '2026-09'); assert.equal(state.salaryData.massagistId, 8);
});
test('month with no records never fetches an old selected month', async () => {
  const {state, calls} = setup({salary: {findMassagistAllMonthCode: async () => ({data: []})}}); state.people = [{id: 7}]; state.selectedMonth = '2026-10';
  await state.handleUserSelect(7); assert.equal(state.selectedMonth, ''); assert.equal(calls.filter(c => c.kind === 'info').length, 0);
});
test('stale info cannot replace later month amount', async () => {
  const pending = []; const {state} = setup({salary: {info: () => {const d = deferred(); pending.push(d); return d.promise; }}});
  state.currentMassagistId = 7; state.selectedMonth = '2026-09'; const a = state.fetchData(); state.selectedMonth = '2026-10'; const b = state.fetchData();
  pending[1].resolve({data: {actualIncome: 100}}); await b; pending[0].resolve({data: {actualIncome: 999}}); await a; assert.equal(state.salaryData.actualIncome, 100);
});
test('failed info shows a retryable error not a misleading zero-income record', async () => {
  const {state} = setup({salary: {info: async () => {throw new Error('合成详情失败');}}}); state.currentMassagistId = 7; state.selectedMonth = '2026-10';
  await assert.rejects(state.fetchData(), /合成详情失败/); assert.equal(state.detailLoading, false); assert.equal(state.detailError, '结算详情加载失败，请重试'); assert.equal(Object.keys(state.salaryData).length, 0);
});
test('nonmanager cannot list people or switch to another person', async () => {
  const {state, calls} = setup(); state.roles = ['疗愈师']; state.currentMassagistId = 7; await state.fetchPeoplePage(); await state.handleUserSelect(8);
  assert.equal(state.currentMassagistId, 7); assert.equal(calls.length, 0);
});
test('destroy invalidates all pending reads', async () => {
  const d = deferred(); const {state, options} = setup({people: () => d.promise}); const request = state.fetchPeoplePage();
  assert.equal(typeof options.beforeDestroy, 'function'); options.beforeDestroy.call(state); d.resolve({data: {list: [{id: 7}], total: 55}}); await request;
  assert.equal(state.people.length, 0); assert.equal(state.currentMassagistId, '');
});
test('reset captures person and month before confirmation and locks duplicates', async () => {
  const {state, calls, loading} = setup(); const d = deferred(); state.notifyConfirm = () => d.promise; state.currentMassagistId = 7; state.selectedMonth = '2026-10';
  const a = state.resetRecord(), b = state.resetRecord(); state.currentMassagistId = 8; state.selectedMonth = '2026-09'; d.resolve(); await Promise.all([a, b]);
  const resets = calls.filter(c => c.kind === 'reset'); assert.equal(resets.length, 1); assert.equal(resets[0].massagistId, 7); assert.equal(resets[0].monthCode, '2026-10'); assert.deepEqual(loading, ['show', 'hide']);
});
test('reset failure releases both loading locks and retains the selected record', async () => {
  const {state, loading} = setup({salary: {reset: async () => {throw new Error('合成重算失败');}}}); state.currentMassagistId = 7; state.selectedMonth = '2026-10'; state.salaryData = {actualIncome: 123};
  await assert.rejects(state.resetRecord(), /合成重算失败/); assert.equal(state.resetting, false); assert.deepEqual(loading, ['show', 'hide']); assert.equal(state.salaryData.actualIncome, 123);
});
test('cancelled reset writes nothing and never shows global loading', async () => {
  const {state, calls, loading} = setup(); state.currentMassagistId = 7; state.selectedMonth = '2026-10'; state.notifyConfirm = async () => {throw new Error('cancel');};
  await assert.rejects(state.resetRecord(), /cancel/); assert.equal(state.resetting, false); assert.equal(calls.length, 0); assert.equal(loading.length, 0);
});
test('nonmanager cannot reset even through a direct handler call', async () => {
  const {state, calls} = setup(); state.roles = ['疗愈师']; state.currentMassagistId = 7; state.selectedMonth = '2026-10'; await state.resetRecord(); assert.equal(calls.length, 0);
});
test('template keeps paging accessible and preserves settlement arithmetic', () => {
  assert.match(source, /:total="peopleTotal"/); assert.match(source, /aria-label="合作状态"/); assert.match(source, /结算月份/); assert.match(source, /本月接单结算/);
  assert.doesNotMatch(source.split('</template>')[0], /在职|离职|计薪|在岗/); assert.match(source, /this\.jsCanshu\s*=\s*'1\.068'/);
});
