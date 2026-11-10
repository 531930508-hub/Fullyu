import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/incentive/training/index.vue', import.meta.url), 'utf8');
const fixtureRow = (id = 7) => ({massagistId: id, massagistName: '合成人员' + id, certifiedCount: 1,
  certs: [{certId: 21, projectKey: 'head60', passedAt: '2026-01-01'}],
  progress: [{projectKey: 'head60', status: 'completed-this-month', count: 2, target: 2, earnedAmount: '100.00'}]});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
function setup(overrides = {}) {
  const calls = [], notices = [];
  const ctx = vm.createContext({mapGetters: () => ({}), money: x => x, trainingStatus: p => ({text: p?.status || '未登记'}),
    AssessmentDrawer: {}, AssessmentRecords: {}, AssessmentAnalytics: {}, ManualCertDialog: {},
    incentiveApi: {
      trainingRecords: async params => { calls.push({...params}); return {data: {list: [fixtureRow()], total: 51, cutoff: '2026-01-31', trainingProjects: [{projectKey: 'head60'}]}}; },
      dashboard: async () => { throw new Error('training must not compute entire settlement dashboard'); },
      config: async () => ({data: {trainingProjects: [{projectKey: 'head60'}]}}),
      saveTrainingRecord: async params => { calls.push({...params}); }, deleteTrainingRecord: async id => { calls.push({deleteId: id}); }, ...overrides
    }
  });
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), ctx);
  const state = Object.assign(ctx.options.data(), ctx.options.methods, {roles: ['运营'], userId: 9, notifyConfirm: async () => {},
    notifySuccess: message => notices.push(message), notifyWarning: message => notices.push(message)});
  for (const [name, getter] of Object.entries(ctx.options.computed)) Object.defineProperty(state, name, {get: () => getter.call(state)});
  return {state, calls, notices, options: ctx.options};
}
test('default cooperation state and page size are bounded', () => { const {state} = setup(); assert.equal(state.status, 1); assert.equal(state.page, 1); assert.equal(state.size, 20); });
test('one server page supplies rows total config and project progress', async () => {
  const {state, calls} = setup(); state.page = 2; state.keyword = '合成'; await state.loadData();
  assert.equal(calls.length, 1); assert.equal(calls[0].page, 2); assert.equal(calls[0].size, 20); assert.equal(calls[0].keyword, '合成');
  assert.equal(state.total, 51); assert.equal(state.records.length, 1); assert.equal(state.projects[0].projectKey, 'head60');
  assert.equal(state.progressOf(state.records[0], state.projects[0]).earnedAmount, '100.00');
});
test('page two is not sliced again and summaries explicitly calculate current page', async () => {
  const {state} = setup(); state.page = 2; await state.loadData();
  assert.equal(state.pagedRecords.length, 1); assert.equal(state.totalCerts, 1); assert.equal(state.monthCompleted, 1); assert.equal(state.trainingTotal, 100);
});
test('changing page requests same filters at the new page', async () => {
  const {state, calls} = setup(); state.status = 0; state.keyword = '合成'; await state.handlePageChange(3);
  assert.equal(calls[0].page, 3); assert.equal(calls[0].status, 0); assert.equal(calls[0].keyword, '合成');
});
test('changing filters or size resets page', async () => {
  const {state, calls} = setup(); state.page = 4; await state.resetAndLoad(); assert.equal(calls[0].page, 1);
  state.page = 3; await state.handleSizeChange(50); assert.equal(calls[1].page, 1); assert.equal(calls[1].size, 50);
});
test('stale response cannot overwrite newer training page', async () => {
  const pending = []; const {state} = setup({trainingRecords: () => { const d = deferred(); pending.push(d); return d.promise; }});
  const first = state.loadData(), second = state.loadData();
  pending[1].resolve({data: {list: [fixtureRow(8)], total: 2, trainingProjects: []}}); await second;
  pending[0].resolve({data: {list: [fixtureRow(7)], total: 51, trainingProjects: []}}); await first;
  assert.equal(state.records[0].massagistId, 8); assert.equal(state.total, 2);
});
test('old finally cannot hide current training spinner', async () => {
  const pending = []; const {state} = setup({trainingRecords: () => { const d = deferred(); pending.push(d); return d.promise; }});
  const first = state.loadData(), second = state.loadData(); pending[0].resolve({data: {list: [], total: 0}}); await first;
  assert.equal(state.loading, true); pending[1].resolve({data: {list: [], total: 0}}); await second; assert.equal(state.loading, false);
});
test('failed lookup keeps previous rows and releases spinner', async () => {
  const {state} = setup({trainingRecords: async () => { throw new Error('synthetic failure'); }}); state.records = [fixtureRow(8)];
  await assert.rejects(state.loadData(), /synthetic failure/); assert.equal(state.records[0].massagistId, 8); assert.equal(state.loading, false);
});
test('placeholder project without cert id is not shown as certified', () => {
  const {state} = setup(); const row = {certs: [{projectKey: 'head60', certId: null, passedAt: null}]};
  assert.equal(state.certOf(row, {projectKey: 'head60'}).certId, null);
  assert.equal(state.cellClass(row, {projectKey: 'head60'}), 'pending');
});
test('three tabs exist and heavy tabs are lazy', () => {
  assert.match(source, /label="认证矩阵"/);
  assert.match(source, /label="考核记录"/);
  assert.match(source, /label="考核分析"/);
  assert.match(source, /name="records" lazy/);
  assert.match(source, /name="analytics" lazy/);
});
test('team cert matrix opens detail drawer instead of legacy dialog', () => {
  const {state} = setup(); state.teamCertEnabled = true;
  state.openCert(fixtureRow(), {projectKey: 'head60'});
  assert.equal(state.drawerVisible, true);
  assert.equal(state.drawerRowId, 7);
  assert.equal(state.drawerProjectKey, 'head60');
  assert.equal(state.dialogVisible, false);
});
test('cell shows attempt count without marking certified', () => {
  const {state} = setup();
  const row = {massagistId: 7, certs: [{projectKey: 'head60', certId: null, attemptCount: 2, passedAt: null}]};
  assert.equal(state.cellClass(row, {projectKey: 'head60'}), 'pending has-attempt');
  assert.equal(state.attemptOf(row, {projectKey: 'head60'}), '考核 2 次');
});
test('super admin derives from user id or role', () => {
  const {state} = setup();
  state.roles = ['运营']; state.userId = 2; assert.equal(state.superAdmin, false);
  state.roles = ['超级管理员']; assert.equal(state.superAdmin, true);
  state.roles = ['运营']; state.userId = 1; assert.equal(state.superAdmin, false);
});
test('manual cert and drawer wiring is gated by feature flag and super admin', () => {
  assert.match(source, /<assessment-drawer[\s\S]*?v-if="teamCertEnabled"/);
  assert.match(source, /<manual-cert-dialog[\s\S]*?v-if="teamCertEnabled && superAdmin"/);
  assert.match(source, /v-if="teamCertEnabled && superAdmin"[\s\S]*?人工特批/);
});
test('non global account cannot open editable certificate dialog', () => {
  const {state} = setup(); state.roles = ['店长']; state.openCert(fixtureRow(), {projectKey: 'head60'}); assert.equal(state.dialogVisible, false);
});
test('save failure preserves form for retry and releases lock', async () => {
  const {state} = setup({saveTrainingRecord: async () => { throw new Error('save failed'); }});
  state.openCert(fixtureRow(), {projectKey: 'head60'}); state.certForm.remark = '保留说明';
  await assert.rejects(state.saveCert(), /save failed/); assert.equal(state.certForm.remark, '保留说明'); assert.equal(state.dialogVisible, true); assert.equal(state.saving, false);
});
test('double save issues one write and successful refresh uses page API', async () => {
  const pending = deferred(); let writes = 0; const {state} = setup({saveTrainingRecord: () => { writes++; return pending.promise; }});
  state.openCert(fixtureRow(), {projectKey: 'head60'}); const first = state.saveCert(), second = state.saveCert(); pending.resolve();
  await Promise.all([first, second]); assert.equal(writes, 1); assert.equal(state.saving, false); assert.equal(state.dialogVisible, false);
});
test('deletion captures id before confirmation and locks duplicate click', async () => {
  const {state, calls} = setup(); const confirm = deferred(); state.notifyConfirm = () => confirm.promise;
  state.openCert(fixtureRow(), {projectKey: 'head60'}); const first = state.deleteCert(), second = state.deleteCert();
  state.certForm.certId = 99; confirm.resolve(); await Promise.all([first, second]);
  const deletes = calls.filter(call => 'deleteId' in call); assert.equal(deletes.length, 1); assert.equal(deletes[0].deleteId, 21);
});
test('destroyed page ignores late results', async () => {
  const pending = deferred(); const {state, options} = setup({trainingRecords: () => pending.promise}); const request = state.loadData();
  assert.equal(typeof options.beforeDestroy, 'function'); options.beforeDestroy.call(state);
  pending.resolve({data: {list: [fixtureRow()], total: 51}}); await request; assert.equal(state.records.length, 0);
});
test('pagination uses total and labels distinguish whole scope from current page', () => {
  assert.match(source, /:total="total"/); assert.match(source, /当前页已登记/); assert.match(source, /当前页本月达标/);
  assert.match(source, /当前页培训奖励/); assert.match(source, /已结束合作/); assert.doesNotMatch(source, /incentiveApi\.dashboard\(/);
});
