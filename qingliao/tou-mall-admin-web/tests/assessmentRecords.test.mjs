import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/views/incentive/training/components/AssessmentRecords.vue', import.meta.url), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };

function setup(overrides = {}) {
  const calls = [], notices = [];
  const ctx = vm.createContext({
    saveAs: (...args) => calls.push({kind: 'saveAs', args}),
    Blob: class Blob { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    incentiveApi: {
      assessmentRecords: async params => {
        calls.push({kind: 'records', params});
        return {data: {list: [{id: 1, massagistName: '合成人员', projectName: '头部'}], total: 1}};
      },
      assessmentTrainers: async () => ({data: [{id: 5, name: '内训师甲', shopId: 3, shopName: '一店'}]}),
      massagists: async () => ({data: [{id: 7, name: '疗愈师甲'}]}),
      exportAssessments: async params => { calls.push({kind: 'exportRecords', params}); return {data: 'csv'}; },
      exportCertifications: async params => { calls.push({kind: 'exportCert', params}); return {data: 'csv'}; },
      voidAssessment: async (id, data) => { calls.push({kind: 'void', id, data}); },
      ...overrides
    }
  });
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), ctx);
  const state = Object.assign(ctx.options.data(), ctx.options.methods, {
    destroyed: false,
    superAdmin: false,
    $message: {success: message => notices.push(message), warning: () => {}},
    $prompt: async () => ({value: '合成原因'})
  });
  for (const [name, getter] of Object.entries(ctx.options.computed)) {
    Object.defineProperty(state, name, {get: () => getter.call(state)});
  }
  return {state, calls, notices, options: ctx.options};
}

test('filters reset page to one and omit empty values', async () => {
  const {state, calls} = setup();
  state.page = 4;
  state.projectKey = 'head60';
  state.result = 1;
  await state.resetAndLoad();
  const request = calls.filter(call => call.kind === 'records').pop();
  assert.equal(request.params.page, 1);
  assert.equal(request.params.projectKey, 'head60');
  assert.equal(request.params.result, 1);
  assert.equal(request.params.voided, 0);
  assert.equal('shopId' in request.params, false);
});

test('stale records response cannot overwrite newer filter', async () => {
  const pending = [];
  const {state} = setup({assessmentRecords: () => { const item = deferred(); pending.push(item); return item.promise; }});
  const first = state.load(1);
  state.projectKey = 'head60';
  const second = state.load(1);
  pending[1].resolve({data: {list: [{id: 2, projectKey: 'head60'}], total: 2}});
  await second;
  pending[0].resolve({data: {list: [{id: 1, projectKey: 'old'}], total: 9}});
  await first;
  assert.equal(state.rows[0].id, 2);
  assert.equal(state.total, 2);
});

test('export sends current filters and correct endpoint kind', async () => {
  const {state, calls} = setup();
  state.month = '2026-11';
  state.shopId = 3;
  state.projectKey = 'head60';
  state.result = 0;
  state.trainerId = 5;
  await state.doExport('record');
  const recordExport = calls.filter(call => call.kind === 'exportRecords').pop();
  assert.equal(recordExport.params.month, '2026-11');
  assert.equal(recordExport.params.shopId, 3);
  assert.equal(recordExport.params.projectKey, 'head60');
  assert.equal(recordExport.params.result, 0);
  assert.equal(recordExport.params.trainerId, 5);

  await state.doExport('cert');
  const certExport = calls.filter(call => call.kind === 'exportCert').pop();
  assert.deepEqual(Object.keys(certExport.params).sort(), ['month', 'shopId']);
});

test('void action is only rendered for super admin', () => {
  assert.match(source, /v-if="superAdmin"[\s\S]*?作废/);
  const {state, calls} = setup();
  state.superAdmin = false;
  return state.doVoid({id: 1, voided: 0}).then(() => assert.equal(calls.filter(call => call.kind === 'void').length, 0));
});

test('void requires non-empty reason before request', async () => {
  const {state, calls, notices} = setup();
  state.superAdmin = true;
  state.$prompt = async () => ({value: '   '});
  await state.doVoid({id: 9, voided: 0});
  assert.equal(calls.filter(call => call.kind === 'void').length, 0);
  state.$prompt = async () => ({value: ' 重复提交 '});
  await state.doVoid({id: 9, voided: 0});
  const voids = calls.filter(call => call.kind === 'void');
  assert.equal(voids.length, 1);
  assert.equal(voids[0].data.reason, '重复提交');
  assert.ok(notices.includes('考核记录已作废'));
});
