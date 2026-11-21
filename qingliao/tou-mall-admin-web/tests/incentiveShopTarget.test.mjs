import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/views/incentive/settings/index.vue', import.meta.url), 'utf8');
const legacyRow = (overrides = {}) => ({id: 3, shopId: 5, shopName: '合成门店', metricType: null,
  targetRevenue: '100000', commissionRate: '1', managerMassagistId: 7, remark: '', ...overrides});
function setup(overrides = {}) {
  const calls = [], notices = [];
  const ctx = vm.createContext({
    mapGetters: () => ({}), money: x => x, decimal: x => x, percent: x => x, numberValue: Number,
    incentiveApi: {
      shopTargets: async params => { calls.push({...params}); return {data: [legacyRow()]}; },
      saveShopTarget: async params => { calls.push({...params}); return {data: true}; },
      massagists: async params => { calls.push({massagists: params}); return {data: [{id: 7, name: '店长甲'}]}; },
      config: async () => ({data: {}}), ...overrides
    }
  });
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), ctx);
  const state = Object.assign(ctx.options.data(), ctx.options.methods, {roles: ['运营'], userId: 9,
    notifySuccess: message => notices.push(message), notifyWarning: message => notices.push(message)});
  for (const [name, getter] of Object.entries(ctx.options.computed)) Object.defineProperty(state, name, {get: () => getter.call(state)});
  return {state, calls, notices};
}
test('new target defaults to revenue metric', () => {
  const {state} = setup();
  assert.equal(state.targetForm.metricType, 0);
  state.targetForm.metricType = 1;
  state.resetTarget();
  assert.equal(state.targetForm.metricType, 0);
});
test('legacy target without metric type stays a revenue target', async () => {
  const {state} = setup();
  await state.openTarget(legacyRow());
  assert.equal(state.targetForm.metricType, 0);
  assert.equal(state.targetLabel, '业绩目标');
  state.targetForm.metricType = 1;
  assert.equal(state.targetLabel, '复购目标');
  assert.match(state.targetHint, /复购/);
});
test('saving a repeat target sends metricType one', async () => {
  const {state, calls} = setup();
  state.month = '2026-11';
  state.targetForm = {id: null, shopId: 5, metricType: 1, targetRevenue: 20000, commissionRate: 1, managerMassagistId: 7, remark: ''};
  await state.saveTarget();
  const payload = calls.find(call => call.monthCode);
  assert.equal(payload.metricType, 1);
  assert.equal(payload.targetRevenue, 20000);
  assert.equal(payload.commissionRate, 1);
});
test('negative target is rejected for both metrics before saving', async () => {
  const {state, calls, notices} = setup();
  state.targetForm = {id: null, shopId: 5, metricType: 1, targetRevenue: -1, commissionRate: 1, managerMassagistId: null, remark: ''};
  await state.saveTarget();
  assert.equal(calls.filter(call => call.monthCode).length, 0);
  assert.ok(notices.some(text => text.includes('复购目标')));
});