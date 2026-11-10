import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../src/views/ums/approvalCategory/index.vue', import.meta.url), 'utf8');
const formSource = await readFile(new URL('../src/views/ums/approvalCategory/ApprovalCategoryForm.vue', import.meta.url), 'utf8');
const cardSource = await readFile(new URL('../src/views/ums/approvalCategory/FlowNodeCard.vue', import.meta.url), 'utf8');

const plain = value => JSON.parse(JSON.stringify(value));

function loadOptions(source, ctx) {
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), ctx);
  return ctx.options;
}

function formState(extra = {}) {
  const updates = [];
  const adds = [];
  const ctx = vm.createContext({
    mapGetters: () => ({}),
    FlowNodeCard: {},
    massagistApi: {
      identityOptions: async () => ({data: [{value: 'SHOP_MANAGER', label: '店长'}, {value: 'TRAINER', label: '内训师'}]}),
    },
    approvalCategoryApi: {
      update: async request => { updates.push(request); },
      add: async request => { adds.push(request); },
    },
    ...extra,
  });
  const options = loadOptions(formSource, ctx);
  const state = Object.assign(options.data(), options.methods, {
    $set: (obj, key, value) => { obj[key] = value; },
    showFullLoading: () => {}, hideFullLoading: () => {},
    $notify: {success: () => {}},
    $emit: () => {},
    $message: {warning: message => { state.warnings.push(message); }},
    $store: {dispatch: () => {}},
    warnings: [],
    updates,
    adds,
  });
  return state;
}

test('legacy per-level approvers are converted into ordered nodes', () => {
  const state = formState();
  const nodes = state.buildNodes({approvalIds: '[11,12]', ccIds: '[9]'});
  assert.equal(nodes.length, 2);
  assert.deepEqual(plain(nodes.map(node => node.approveMode)), ['ANY', 'ANY']);
  assert.deepEqual(plain(nodes.map(node => node.targets[0].adminId)), [11, 12]);
  state.open({id: 3, code: 'askForLeave', title: '请假审批', approvalIds: '[11]', ccIds: '[9]'});
  assert.deepEqual(plain(state.form.ccIdList), [9]);
  assert.equal(state.form.nodes.length, 1);
});

test('new configuration starts with an identity node', () => {
  const state = formState();
  state.open({code: 'askForLeave', title: '请假审批'});
  assert.equal(state.form.nodes.length, 1);
  assert.equal(state.form.nodes[0].targets[0].type, 'IDENTITY');
  assert.equal(state.form.nodes[0].targets[0].scope, 'SHOP');
});

test('validation blocks empty nodes and missing approvers', () => {
  const state = formState();
  state.open({code: 'askForLeave', title: '请假审批'});
  state.form.nodes[0].targets[0].code = null;
  assert.match(state.validateNodes(), /请选择身份/);

  state.form.nodes = [{nodeName: '店长审批', approveMode: 'ANY', targets: [{type: 'USER', adminId: null}]}];
  assert.match(state.validateNodes(), /请选择审批人/);

  state.form.nodes = [];
  assert.match(state.validateNodes(), /至少配置一个审批节点/);
});

test('submit sends nodes instead of per-level approver ids', async () => {
  const state = formState();
  state.open({id: 8, code: 'askForLeave', title: '请假审批', approvalIds: '[11]', ccIds: '[9]'});
  state.form.nodes = [
    {nodeName: '店长审批', approveMode: 'ANY', targets: [{type: 'IDENTITY', code: 'SHOP_MANAGER', scope: 'SHOP'}]},
    {nodeName: '复核', approveMode: 'ALL', targets: [{type: 'USER', adminId: 21}, {type: 'IDENTITY', code: 'TRAINER', scope: 'ALL'}]},
  ];
  await state.onSubmit();
  const request = state.updates[0];
  assert.equal(request.id, 8);
  assert.equal('approvalIdList' in request, false);
  assert.equal(request.nodes.length, 2);
  assert.equal(request.nodes[1].approveMode, 'ALL');
  assert.deepEqual(plain(request.nodes[1].targets), [
    {type: 'USER', adminId: 21},
    {type: 'IDENTITY', code: 'TRAINER', scope: 'ALL'},
  ]);
  assert.deepEqual(plain(request.ccIdList), [9]);
});

test('list page renders nodes and drops the manager rule table', () => {
  assert.equal(indexSource.includes('approvalShopManagerApi'), false);
  assert.match(indexSource, /node\.approveMode === 'ALL'[\s\S]*?会签/);
  assert.match(indexSource, /target\.type === 'IDENTITY'[\s\S]*?全部门店/);
  assert.match(indexSource, /旧版逐级审批/);
});

test('node card resets stale target values when switching type', () => {
  const ctx = vm.createContext({AdminUserSelector: {}});
  const options = loadOptions(cardSource, ctx);
  const state = Object.assign(options.data ? options.data() : {}, options.methods);
  state.identityOptions = [{value: 'SHOP_MANAGER'}];
  const toUser = {type: 'USER', adminId: 5, code: 'TRAINER', scope: 'ALL'};
  state.changeType(toUser);
  assert.equal(toUser.adminId, null);
  assert.equal(toUser.code, null);
  assert.equal(toUser.scope, 'SHOP');

  const toIdentity = {type: 'IDENTITY', adminId: 5, code: null, scope: 'ALL'};
  state.changeType(toIdentity);
  assert.equal(toIdentity.code, 'SHOP_MANAGER');
});
