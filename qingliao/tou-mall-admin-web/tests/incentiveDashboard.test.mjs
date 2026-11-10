import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/incentive/dashboard/index.vue', import.meta.url), 'utf8');
function setup(overrides = {}) {
  const calls = [], downloads = [];
  let fullLoading = 0;
  const context = vm.createContext({
    mapGetters: () => ({}), BoardDrawer: {}, money: x => x, decimal: x => x, percent: x => x, numberValue: Number,
    Blob, saveAs: (blob, filename) => downloads.push({blob, filename}),
    incentiveApi: {
      dashboard: async params => { calls.push({...params}); return {data: {therapists: [{massagistId: 7}], therapistCount: 51}}; },
      config: async () => ({data: {id: 1}}), board: async () => ({data: {massagistId: 7}}),
      exportCsv: async params => { calls.push({...params}); return {data: 'CSV'}; }, ...overrides
    }
  });
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), context);
  const state = Object.assign(context.options.data(), context.options.methods, {
    notifyConfirm: async () => {}, showFullLoading: () => fullLoading++, hideFullLoading: () => fullLoading--
  });
  return {state, calls, downloads, options: context.options, fullLoading: () => fullLoading};
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
test('defaults to cooperating partners and bounded page', () => {
  const {state} = setup(); assert.equal(state.status, 1); assert.equal(state.page, 1); assert.equal(state.size, 20);
});
test('stale dashboard and config cannot replace new filter results', async () => {
  const pending = [];
  const {state} = setup({dashboard: params => { const d = deferred(); pending.push(d); return d.promise; }});
  const first = state.loadData(); state.status = 0; const second = state.loadData();
  pending[1].resolve({data: {therapists: [{massagistId: 2}], therapistCount: 2}}); await second;
  pending[0].resolve({data: {therapists: [{massagistId: 1}], therapistCount: 9}}); await first;
  assert.equal(state.dashboard.therapists[0].massagistId, 2);
});
test('old finally cannot hide current dashboard loading', async () => {
  const pending = []; const {state} = setup({dashboard: () => { const d = deferred(); pending.push(d); return d.promise; }});
  const first = state.loadData(), second = state.loadData();
  pending[0].resolve({data: {therapists: []}}); await first; assert.equal(state.loading, true);
  pending[1].resolve({data: {therapists: []}}); await second; assert.equal(state.loading, false);
});
test('failed dashboard keeps previous visible data and releases loading', async () => {
  const {state} = setup({dashboard: async () => { throw new Error('synthetic failure'); }});
  state.dashboard = {therapists: [{massagistId: 8}]};
  await assert.rejects(state.loadData(), /synthetic failure/);
  assert.equal(state.dashboard.therapists[0].massagistId, 8); assert.equal(state.loading, false);
});
test('newer drawer wins and closing drawer invalidates pending detail', async () => {
  const pending = []; const {state} = setup({board: () => { const d = deferred(); pending.push(d); return d.promise; }});
  const first = state.openBoard({massagistId: 1}), second = state.openBoard({massagistId: 2});
  pending[1].resolve({data: {massagistId: 2}}); await second;
  pending[0].resolve({data: {massagistId: 1}}); await first;
  assert.equal(state.selectedBoard.massagistId, 2);
  const third = state.openBoard({massagistId: 3}); state.drawerVisible = false;
  pending[2].resolve({data: {massagistId: 33}}); await third;
  assert.equal(state.selectedBoard.massagistId, 3); assert.equal(state.drawerLoading, false);
});
test('export captures status month and shop before confirmation', async () => {
  const {state, calls, downloads, fullLoading} = setup();
  const confirm = deferred(); state.notifyConfirm = () => confirm.promise;
  state.month = '2026-01'; state.shopId = 5; state.status = 0;
  const exportRequest = state.exportCsv(); state.month = '2026-02'; state.status = 1; confirm.resolve();
  await exportRequest;
  assert.equal(calls[0].status, 0); assert.equal(calls[0].month, '2026-01'); assert.equal(calls[0].shopId, 5);
  assert.equal(downloads[0].filename, '接单奖励明细-2026-01.csv');
  assert.equal(fullLoading(), 0); assert.equal(state.exporting, false);
});
test('duplicate export clicks issue one export only', async () => {
  const confirm = deferred(); const {state, calls} = setup(); state.notifyConfirm = () => confirm.promise;
  const first = state.exportCsv(), second = state.exportCsv(); confirm.resolve(); await Promise.all([first, second]);
  assert.equal(calls.length, 1);
});
test('export failure releases local and global loading', async () => {
  const {state, fullLoading} = setup({exportCsv: async () => { throw new Error('export failure'); }});
  await assert.rejects(state.exportCsv(), /export failure/); assert.equal(fullLoading(), 0); assert.equal(state.exporting, false);
});
test('cancelled confirmation does not export or show loading', async () => {
  const {state, calls, fullLoading} = setup(); state.notifyConfirm = async () => { throw new Error('cancel'); };
  await assert.rejects(state.exportCsv(), /cancel/); assert.equal(calls.length, 0); assert.equal(fullLoading(), 0);
  assert.equal(state.exporting, false);
});
test('destroyed page ignores pending dashboard response', async () => {
  const pending = deferred(); const {state, options} = setup({dashboard: () => pending.promise});
  const request = state.loadData(); assert.equal(typeof options.beforeDestroy, 'function');
  options.beforeDestroy.call(state); pending.resolve({data: {therapists: [{massagistId: 99}]}}); await request;
  assert.equal(state.dashboard.therapists.length, 0);
});
test('state labels and sort description use actual cooperation and subtotal wording', () => {
  assert.match(source, /已结束合作/); assert.match(source, /暂停合作/); assert.match(source, /按激励合计从高到低排序/);
  assert.match(source, /:loading="exporting"/);
});
