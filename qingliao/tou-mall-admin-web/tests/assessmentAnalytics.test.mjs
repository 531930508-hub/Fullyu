import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/views/incentive/training/components/AssessmentAnalytics.vue', import.meta.url), 'utf8');

function setup(overrides = {}) {
  const calls = [];
  const ctx = vm.createContext({
    saveAs: (...args) => calls.push({kind: 'saveAs', args}),
    Blob: class Blob { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    incentiveApi: {
      assessmentSummary: async params => {
        calls.push({kind: 'summary', params});
        return {data: {total: 12, passRate: '66.7%', byProject: [], byTrainer: [], monthlyTrend: [], repeatedTargets: []}};
      },
      exportAssessments: async params => { calls.push({kind: 'exportRecords', params}); return {data: 'csv'}; },
      exportCertifications: async params => { calls.push({kind: 'exportCert', params}); return {data: 'csv'}; },
      ...overrides
    }
  });
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), ctx);
  const state = Object.assign(ctx.options.data(), ctx.options.methods, {destroyed: false});
  return {state, calls, options: ctx.options};
}

test('high failure trainer is flagged only with enough submissions', () => {
  const {state} = setup();
  assert.equal(state.highFailure({total: 2, failRate: '100%'}), false);
  assert.equal(state.highFailure({total: 3, failRate: '79.9%'}), false);
  assert.equal(state.highFailure({total: 3, failRate: '80%'}), true);
  assert.equal(state.highFailure({total: 8, failRate: '85.0%'}), true);
});

test('analytics never computes money or reward amounts', () => {
  assert.doesNotMatch(source, /earnedAmount|rewardAmount|trainingTotal|money\(/);
});

test('summary request carries month and scoped shop', async () => {
  const {state, calls} = setup();
  state.month = '2026-11';
  state.shopId = 3;
  await state.load();
  const summary = calls.filter(call => call.kind === 'summary').pop();
  assert.equal(summary.params.month, '2026-11');
  assert.equal(summary.params.shopId, 3);
  assert.equal(state.summary.total, 12);
});

test('export uses summary filters', async () => {
  const {state, calls} = setup();
  state.month = '2026-10';
  state.shopId = 2;
  await state.doExport('record');
  await state.doExport('cert');
  const record = calls.filter(call => call.kind === 'exportRecords').pop();
  const cert = calls.filter(call => call.kind === 'exportCert').pop();
  assert.equal(record.params.month, '2026-10');
  assert.equal(record.params.shopId, 2);
  assert.equal(cert.params.month, '2026-10');
  assert.equal(cert.params.shopId, 2);
});

test('stale summary cannot overwrite newer month', async () => {
  let resolveFirst;
  let resolveSecond;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  const second = new Promise(resolve => { resolveSecond = resolve; });
  let count = 0;
  const {state} = setup({assessmentSummary: () => (++count === 1 ? first : second)});
  const one = state.load();
  state.month = '2026-10';
  const two = state.load();
  resolveSecond({data: {total: 2, monthlyTrend: []}});
  await two;
  resolveFirst({data: {total: 99, monthlyTrend: []}});
  await one;
  assert.equal(state.summary.total, 2);
});

test('trend bars stay visible for zero submissions', () => {
  const {state} = setup();
  state.summary.monthlyTrend = [{month: '2026-11', total: 4}, {month: '2026-10', total: 0}];
  assert.equal(state.trendHeight(4), '110px');
  assert.equal(state.trendHeight(0), '4px');
});
