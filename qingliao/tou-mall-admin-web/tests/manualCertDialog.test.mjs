import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/views/incentive/training/components/ManualCertDialog.vue', import.meta.url), 'utf8');

function setup(overrides = {}) {
  const calls = [], emitted = [], notices = [];
  const ctx = vm.createContext({
    incentiveApi: {
      massagists: async () => ({data: [{id: 7, name: '疗愈师甲', shopName: '一店'}]}),
      manualCert: async data => { calls.push(data); },
      ...overrides
    }
  });
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), ctx);
  const state = Object.assign(ctx.options.data(), ctx.options.methods, {
    visible: true,
    projects: [
      {projectKey: 'head60', projectName: '头部 60 分钟', enabled: 1},
      {projectKey: 'old', projectName: '已停用项目', enabled: 0}
    ],
    $emit: (...args) => emitted.push(args),
    $message: {success: message => notices.push(message), warning: message => notices.push(message)}
  });
  for (const [name, getter] of Object.entries(ctx.options.computed)) {
    const descriptor = typeof getter === 'function'
      ? {get: () => getter.call(state)}
      : {get: () => getter.get.call(state), set: value => getter.set.call(state, value)};
    Object.defineProperty(state, name, descriptor);
  }
  return {state, calls, emitted, notices};
}

test('manual cert requires therapist project date and reason', async () => {
  const {state, calls, notices} = setup();
  state.form = {massagistId: null, projectKey: '', passedAt: null, reason: ''};
  await state.submit();
  assert.equal(calls.length, 0);
  assert.ok(notices.some(message => message.indexOf('疗愈师') >= 0));

  state.form = {massagistId: 7, projectKey: 'head60', passedAt: '2026-10-01', reason: '   '};
  await state.submit();
  assert.equal(calls.length, 0);
  assert.ok(notices.some(message => message.indexOf('原因') >= 0));
});

test('manual cert trims reason and emits changed', async () => {
  const {state, calls, emitted, notices} = setup();
  state.form = {massagistId: 7, projectKey: 'head60', passedAt: '2026-10-01', reason: ' 外聘考核 '};
  await state.submit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].massagistId, 7);
  assert.equal(calls[0].projectKey, 'head60');
  assert.equal(calls[0].passedAt, '2026-10-01');
  assert.equal(calls[0].reason, '外聘考核');
  assert.ok(emitted.some(item => item[0] === 'changed'));
  assert.ok(notices.includes('人工特批已生效'));
});

test('submit failure keeps form for retry and releases lock', async () => {
  const {state} = setup({manualCert: async () => { throw new Error('synthetic failure'); }});
  state.form = {massagistId: 7, projectKey: 'head60', passedAt: '2026-10-01', reason: '保留'};
  await assert.rejects(state.submit(), /synthetic failure/);
  assert.equal(state.form.reason, '保留');
  assert.equal(state.saving, false);
});

test('only enabled projects are selectable', () => {
  const {state} = setup();
  assert.deepEqual(state.enabledProjects.map(project => project.projectKey), ['head60']);
});

test('therapist search filters by name', async () => {
  const {state} = setup();
  await state.searchTherapist('无此人');
  assert.equal(state.therapists.length, 0);
  await state.searchTherapist('疗愈');
  assert.equal(state.therapists.length, 1);
});
