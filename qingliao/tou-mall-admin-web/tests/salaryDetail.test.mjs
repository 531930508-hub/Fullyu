import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/statistics/salaryDetail/index.vue', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/api/salaryRecord.js', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const template = source.slice(0, source.indexOf('<script>'));

function setup(overrides = {}) {
  const calls = [], loading = [], errors = [];
  const context = vm.createContext({mapGetters: () => ({}), setTimeout, clearTimeout,
    SalaryRecordDetail: {}, SalaryOtherAmountDialog: {},
    salaryRecordApi: {
      people: async params => {calls.push({kind: 'people', ...params}); return {data: {list: [{id: 7, name: '合成人员7'}, {id: 8, name: '合成人员8'}], total: 55}}; },
      monthCodes: async () => {calls.push({kind: 'monthCodes'}); return {data: ['2026-10', '2026-09']}; },
      monthRows: async params => {calls.push({kind: 'rows', ...params}); return {data: [{massagistId: 7, name: '合成人员7', actualIncome: 100}]}; },
      monthSummary: async params => {calls.push({kind: 'summary', ...params}); return {data: {peopleCount: 2, actualIncome: 300}}; },
      info: async params => {calls.push({kind: 'info', ...params}); return {data: {actualIncome: 123, ...params}}; },
      reset: async params => {calls.push({kind: 'reset', ...params}); },
      findMassagistAllMonthCode: async id => {calls.push({kind: 'months', id}); return {data: ['2026-10', '2026-09']}; },
      ...overrides.api
    }
  });
  const raw = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  // 组件默认导入会被剥离，按导入名补占位，避免新增子组件后 setup 直接 ReferenceError
  for (const [, name] of raw.matchAll(/import\s+(\w+)\s+from/g)) if (!(name in context)) context[name] = {};
  vm.runInContext(raw.replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), context);
  const state = Object.assign(context.options.data(), context.options.methods, {
    roles: overrides.roles || ['财务'], massagistId: overrides.massagistId, trainer: false,
    $store: {dispatch: async () => {throw new Error('must not fetch the whole person list');}},
    notifyConfirm: overrides.notifyConfirm || (async () => {}),
    $message: {error: text => errors.push(text)},
    showFullLoading: () => loading.push('show'), hideFullLoading: () => loading.push('hide')
  });
  for (const [name, getter] of Object.entries(context.options.computed || {})) Object.defineProperty(state, name, {get: () => getter.call(state)});
  return {state, calls, loading, errors, options: context.options};
}

test('settlement scoped APIs replace the whole-person list', () => {
  assert.match(source, /salaryRecordApi\.people\(/);
  assert.doesNotMatch(source, /massagistApi/);
  assert.match(api, /url: '\/salaryRecord\/people'/);
  assert.match(api, /url: '\/salaryRecord\/monthRows'/);
  assert.match(api, /url: '\/salaryRecord\/monthSummary'/);
});

test('manager first paint loads rows and the month summary together', async () => {
  const {state, options, calls} = setup();
  await options.created.call(state);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.filter(c => c.kind === 'rows').length, 1);
  assert.equal(calls.filter(c => c.kind === 'summary').length, 1);
  assert.equal(calls.filter(c => c.kind === 'monthCodes').length, 1);
  assert.equal(state.rows.length, 1);
  assert.equal(state.summaryData.actualIncome, 300);
});

test('viewer people list is one bounded server page of cooperating therapists', async () => {
  const {state, calls} = setup({roles: ['店长']});
  await state.fetchPeople('  合成  ');
  assert.deepEqual(calls[0], {kind: 'people', status: 1, page: 1, size: 50, name: '合成'});
  assert.equal(state.people.length, 2);
  assert.equal(state.viewPersonId, 7);
  assert.equal(calls.some(c => c.kind === 'months' && c.id === 7), true);
});

test('late people response cannot replace a newer keyword result', async () => {
  const pending = [];
  const {state} = setup({roles: ['店长'], api: {people: () => {const d = deferred(); pending.push(d); return d.promise;}}});
  const first = state.fetchPeople('旧');
  const second = state.fetchPeople('新');
  pending[1].resolve({data: {list: [{id: 9, name: '合成人员9'}]}});
  await second;
  pending[0].resolve({data: {list: [{id: 7, name: '合成人员7'}]}});
  await first;
  assert.deepEqual(state.people.map(person => person.id), [9]);
  assert.equal(state.peopleLoading, false);
});

test('person switch clears the previous money before the new months arrive', async () => {
  const d = deferred();
  const {state} = setup({roles: ['店长'], api: {findMassagistAllMonthCode: () => d.promise}});
  state.viewPersonId = 7;
  state.selectedMonth = '2026-10';
  state.salaryData = {actualIncome: 999};
  const request = state.handlePersonChange(8);
  assert.equal(Object.keys(state.salaryData).length, 0);
  assert.equal(state.selectedMonth, '');
  d.resolve({data: ['2026-09']});
  await request;
  assert.equal(state.selectedMonth, '2026-09');
  assert.equal(state.salaryData.massagistId, 8);
});

test('months from the previous person cannot replace the new person months', async () => {
  const pending = [];
  const {state} = setup({roles: ['店长'], api: {findMassagistAllMonthCode: () => {const d = deferred(); pending.push(d); return d.promise;}}});
  state.viewPersonId = 7;
  const oldRequest = state.fetchMonthCodeData();
  state.viewPersonId = 8;
  state.monthCodeList = [];
  const newRequest = state.fetchMonthCodeData();
  pending[1].resolve({data: ['2026-09']});
  await newRequest;
  pending[0].resolve({data: ['2026-10']});
  await oldRequest;
  assert.equal(state.selectedMonth, '2026-09');
  assert.equal(state.salaryData.massagistId, 8);
});

test('late rows for an old month cannot replace the current month table', async () => {
  const pending = [];
  const {state} = setup({api: {monthRows: () => {const d = deferred(); pending.push(d); return d.promise;}}});
  state.selectedMonth = '2026-10';
  const oldRequest = state.fetchRows();
  state.selectedMonth = '2026-11';
  const newRequest = state.fetchRows();
  pending[1].resolve({data: [{massagistId: 2}]});
  await newRequest;
  pending[0].resolve({data: [{massagistId: 1}]});
  await oldRequest;
  assert.equal(state.rows[0].massagistId, 2);
  assert.equal(state.rowsLoading, false);
});

test('failed rows clears the previous month table and offers a retry', async () => {
  const {state} = setup({api: {monthRows: async () => {throw new Error('合成明细失败');}}});
  state.selectedMonth = '2026-11';
  state.rows = [{massagistId: 9, actualIncome: 999}];
  await state.fetchRows();
  assert.equal(state.rows.length, 0);
  assert.equal(state.rowsLoading, false);
  assert.equal(state.rowsError, '全员明细加载失败，请重试');
  assert.match(template, /rowsError \|\| monthsError[\s\S]*?@click="retryLoad"/);
});

test('failed month summary clears stale numbers and offers a retry', async () => {
  const {state} = setup({api: {monthSummary: async () => {throw new Error('合成汇总失败');}}});
  state.selectedMonth = '2026-11';
  state.summaryData = {peopleCount: 5, actualIncome: 888};
  await state.fetchMonthSummary();
  assert.equal(Object.keys(state.summaryData).length, 0);
  assert.equal(state.summaryLoading, false);
  assert.equal(state.summaryError, '本月合计加载失败，请重试');
  assert.match(template, /summaryError[\s\S]*?fetchMonthSummary/);
});

test('reset locks through confirmation and captures person and month', async () => {
  const d = deferred();
  const {state, calls, loading} = setup({notifyConfirm: () => d.promise});
  state.selectedMonth = '2026-10';
  const row = {massagistId: 7, name: '合成人员7'};
  const first = state.resetRow(row);
  const second = state.resetRow(row);
  state.selectedMonth = '2026-09';
  d.resolve();
  await Promise.all([first, second]);
  const resets = calls.filter(c => c.kind === 'reset');
  assert.equal(resets.length, 1);
  assert.equal(resets[0].massagistId, 7);
  assert.equal(resets[0].monthCode, '2026-10');
  assert.deepEqual(loading, ['show', 'hide']);
  assert.equal(state.resettingId, null);
  assert.equal(state.resetPending, false);
});

test('reset failure releases both locks and keeps the selected record', async () => {
  const {state, loading} = setup({api: {reset: async () => {throw new Error('合成重算失败');}}});
  state.selectedMonth = '2026-10';
  await assert.rejects(state.resetRow({massagistId: 7, name: '合成人员7'}), /合成重算失败/);
  assert.equal(state.resettingId, null);
  assert.equal(state.resetPending, false);
  assert.deepEqual(loading, ['show', 'hide']);
  assert.equal(state.selectedMonth, '2026-10');
});

test('cancelled reset writes nothing and never shows global loading', async () => {
  const {state, calls, loading} = setup({notifyConfirm: async () => {throw new Error('cancel');}});
  state.selectedMonth = '2026-10';
  await assert.rejects(state.resetRow({massagistId: 7, name: '合成人员7'}), /cancel/);
  assert.equal(state.resetPending, false);
  assert.equal(calls.length, 0);
  assert.equal(loading.length, 0);
});

test('nonmanager cannot read rows or reset through direct handler calls', async () => {
  const {state, calls} = setup({roles: ['疗愈师']});
  state.selectedMonth = '2026-10';
  await state.fetchRows();
  await state.resetRow({massagistId: 7, name: '合成人员7'});
  assert.equal(calls.length, 0);
});

test('detail drawer loads the selected person and closes on failure', async () => {
  const ok = setup();
  ok.state.selectedMonth = '2026-10';
  await ok.state.openDetail({massagistId: 7, name: '合成人员7'});
  assert.equal(ok.state.detailVisible, true);
  assert.equal(ok.state.detailData.actualIncome, 123);
  assert.equal(ok.state.detailLoading, false);

  const failed = setup({api: {info: async () => {throw new Error('合成详情失败');}}});
  failed.state.selectedMonth = '2026-10';
  await failed.state.openDetail({massagistId: 7, name: '合成人员7'});
  assert.equal(failed.state.detailVisible, false);
  assert.equal(failed.state.detailLoading, false);
  assert.deepEqual(failed.errors, ['结算明细加载失败，请重试']);
});

test('late detail response cannot replace a newer drawer record', async () => {
  const pending = [];
  const {state} = setup({api: {info: () => {const d = deferred(); pending.push(d); return d.promise;}}});
  state.selectedMonth = '2026-10';
  const older = state.openDetail({massagistId: 7, name: '甲'});
  const newer = state.openDetail({massagistId: 8, name: '乙'});
  pending[1].resolve({data: {massagistId: 8, actualIncome: 200}});
  await newer;
  pending[0].resolve({data: {massagistId: 7, actualIncome: 100}});
  await older;
  assert.equal(state.detailPerson.name, '乙');
  assert.equal(state.detailData.massagistId, 8);
  assert.equal(state.detailLoading, false);
});

test('destroy invalidates every pending read', async () => {
  const d = deferred();
  const {state, options} = setup({api: {people: () => d.promise}});
  state.viewPersonId = 7;
  const request = state.fetchPeople('合成');
  assert.equal(typeof options.beforeDestroy, 'function');
  options.beforeDestroy.call(state);
  d.resolve({data: {list: [{id: 9, name: '合成人员9'}]}});
  await request;
  assert.equal(state.people.length, 0);
  assert.equal(state.detailVisible, false);
});

test('template keeps filters, the month summary and settlement arithmetic', () => {
  assert.match(template, /aria-label="合作状态"/);
  assert.match(template, /结算月份/);
  assert.match(template, /接单结算（元）/);
  assert.match(template, /预估税后收入/);
  assert.match(template, /month-summary/);
  assert.match(template, /formatCurrency\(summaryData\.actualIncome/);
  assert.match(template, /summaryError[\s\S]*?fetchMonthSummary/);
  assert.doesNotMatch(template, /在职|离职|计薪|在岗/);
  assert.match(source, /jsCanshu:\s*'1\.068'/);
});