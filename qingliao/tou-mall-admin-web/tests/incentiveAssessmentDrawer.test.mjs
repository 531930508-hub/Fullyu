import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/views/incentive/training/components/AssessmentDrawer.vue', import.meta.url), 'utf8');

function setup(overrides = {}) {
  const calls = [], emitted = [], notices = [];
  const ctx = vm.createContext({
    incentiveApi: {
      assessmentDetail: async params => {
        calls.push({kind: 'detail', params});
        return {data: {
          massagistId: 7,
          massagistName: '合成人员',
          shopName: '一店',
          projectKey: 'head60',
          projectName: '头部 60 分钟',
          certId: 21,
          passedAt: '2026-10-01',
          certSource: 'TEAM',
          certifiedAt: '2026-10-03T10:00:00',
          teamSize: 3,
          votes: [{id: 1, trainerName: '内训甲', trainerShopName: '一店', assessDate: '2026-10-01', result: 1, submittedAt: '2026-10-01T10:00:00', voided: 0}]
        }};
      },
      revokeCert: async (id, data) => { calls.push({kind: 'revoke', id, data}); },
      voidAssessment: async (id, data) => { calls.push({kind: 'void', id, data}); },
      ...overrides
    }
  });
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), ctx);
  const state = Object.assign(ctx.options.data(), ctx.options.methods, {
    visible: true,
    massagistId: 7,
    projectKey: 'head60',
    superAdmin: true,
    $emit: (...args) => emitted.push(args),
    $message: {success: message => notices.push(message)},
    $prompt: async () => ({value: '外聘老师考核'})
  });
  for (const [name, getter] of Object.entries(ctx.options.computed)) {
    const descriptor = typeof getter === 'function'
      ? {get: () => getter.call(state)}
      : {get: () => getter.get.call(state), set: value => getter.set.call(state, value)};
    Object.defineProperty(state, name, descriptor);
  }
  return {state, calls, emitted, notices};
}

test('drawer loads blind-safe detail and labels sources', async () => {
  const {state, calls} = setup();
  await state.load();
  assert.equal(calls[0].kind, 'detail');
  assert.equal(calls[0].params.massagistId, 7);
  assert.equal(state.detail.projectName, '头部 60 分钟');
  assert.equal(state.title, '头部 60 分钟 · 考核明细');
  assert.equal(state.sourceLabel('TEAM'), '三人认证');
  assert.equal(state.sourceLabel('MANUAL'), '人工特批');
  assert.equal(state.sourceLabel(null), '历史登记');
});

test('closing the drawer emits visibility update', () => {
  const {state, emitted} = setup();
  state.innerVisible = false;
  assert.deepEqual(emitted[0], ['update:visible', false]);
});

test('revoke requires reason and refreshes matrix', async () => {
  const {state, calls, emitted, notices} = setup();
  await state.load();
  state.$prompt = async () => ({value: '  '});
  await state.revoke();
  assert.equal(calls.filter(call => call.kind === 'revoke').length, 0);

  state.$prompt = async () => ({value: '重复认证'});
  await state.revoke();
  const revoke = calls.filter(call => call.kind === 'revoke').pop();
  assert.equal(revoke.id, 21);
  assert.equal(revoke.data.reason, '重复认证');
  assert.ok(emitted.some(item => item[0] === 'changed'));
  assert.ok(notices.includes('认证已撤销'));
});

test('void vote sends non-empty reason and reloads detail', async () => {
  const {state, calls, notices} = setup();
  await state.load();
  await state.voidVote({id: 1});
  const voids = calls.filter(call => call.kind === 'void');
  assert.equal(voids.length, 1);
  assert.equal(voids[0].data.reason, '外聘老师考核');
  assert.ok(calls.filter(call => call.kind === 'detail').length >= 2);
  assert.ok(notices.includes('考核记录已作废'));
});
