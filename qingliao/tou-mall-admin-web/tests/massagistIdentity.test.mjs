import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const listSource = await readFile(new URL('../src/views/massagist/management/index.vue', import.meta.url), 'utf8');
const formSource = await readFile(new URL('../src/views/massagist/management/MassagistForm.vue', import.meta.url), 'utf8');

function loadOptions(source, ctx) {
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options='), ctx);
  return ctx.options;
}

test('list sends identity filter only when selected', async () => {
  const calls = [];
  const ctx = vm.createContext({
    mapGetters: () => ({}),
    massagistApi: {page: async query => { calls.push(query); return {data: {list: [], total: 0}}; }},
    ShopSelector: {}, MassagistForm: {}
  });
  const options = loadOptions(listSource, ctx);
  const state = Object.assign(options.data(), options.methods, {listLoading: false});
  state.searchForm.identity = '';
  await state.fetchData();
  assert.equal('identity' in calls[0], false);
  state.searchForm.identity = 'trainer';
  await state.fetchData();
  assert.equal(calls[1].identity, 'trainer');
});

test('identity tags render every identity plus missing-account warning', () => {
  assert.match(listSource, /identityCodes\(scope\.row\)/);
  assert.match(listSource, /hasIdentity\(scope\.row, 'TRAINER'\)[\s\S]*?待开通账号/);
  assert.match(listSource, /identityCodes\(row\)[\s\S]*?row\.identities/);
  assert.match(listSource, /value="trainer_pending_account"/);
});

test('form loads identities and submits multi-select values', async () => {
  const saves = [];
  const ctx = vm.createContext({
    mapGetters: () => ({}),
    massagistApi: {
      saveOrUpd: async form => { saves.push({...form}); },
      identities: async id => ({data: id === 5 ? ['SHOP_MANAGER', 'TRAINER'] : []}),
      identityOptions: async () => ({data: []}),
    },
    ShopSelector: {}, SingleUpload: {}, generatePreSignedUrl: async () => ({data: {}}),
    uploadFile: async () => {}
  });
  const options = loadOptions(formSource, ctx);
  const state = Object.assign(options.data(), options.methods, {
    imageFile: null,
    shopId: 3,
    $refs: {refForm: {validate: async () => true}},
    showFullLoading: () => {}, hideFullLoading: () => {},
    $notify: {success: () => {}},
    $emit: () => {},
    $store: {dispatch: () => {}}
  });
  await state.open({id: 5, name: '合成人员', identities: ['SHOP_MANAGER']});
  assert.deepEqual([...state.form.identities], ['SHOP_MANAGER', 'TRAINER']);
  assert.equal(state.wasShopManager, true);
  assert.equal(state.hasIdentity('TRAINER'), true);

  state.form.identities = ['TRAINER'];
  await state.onSubmit();
  assert.deepEqual([...saves[0].identities], ['TRAINER']);
});

test('resigning manager requires a successor only when identity was held', () => {
  const ctx = vm.createContext({
    mapGetters: () => ({}),
    massagistApi: {},
    ShopSelector: {}, SingleUpload: {}, generatePreSignedUrl: async () => ({data: {}}),
    uploadFile: async () => {}
  });
  const options = loadOptions(formSource, ctx);
  const state = Object.assign(options.data(), options.methods, {
    $store: {dispatch: () => {}},
    loadSuccessors: () => {}
  });
  state.form = {id: 5, identities: ['TRAINER'], status: 0};
  state.wasShopManager = false;
  assert.equal(state.hasIdentity('SHOP_MANAGER'), false);
  state.form.identities = ['SHOP_MANAGER'];
  assert.equal(state.hasIdentity('SHOP_MANAGER'), true);
  assert.match(formSource, /wasShopManager && form\.status === 0/);
});

test('missing account warning only shows for identity without umsAdminId', () => {
  assert.match(formSource, /hasIdentity\('SHOP_MANAGER'\) && !form\.umsAdminId/);
  assert.match(formSource, /hasIdentity\('TRAINER'\) && !form\.umsAdminId/);
  assert.match(formSource, /尚未关联后台账号/);
  assert.match(formSource, /v-model="form\.identities"/);
});
