import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// 登录态里的「当前门店」以服务端授权范围为准：cookie 只是"上次看的那家店"。
// 之前 cookie 无条件优先，调店时段结束后账号只剩档案店，页面却还钉在目标店上，
// 每次请求都被「无权访问该门店」拒掉，刷新也不管用。这里按 GetInfo 的真实流程回归。
const source = await readFile(new URL('../src/store/modules/user.js', import.meta.url), 'utf8');

function loadStore(cookieShopId) {
  const cookie = {value: cookieShopId};
  const context = vm.createContext({
    console: {log() {}},
    login: async () => ({}),
    logout: async () => ({}),
    adminListAll: async () => ({data: []}),
    getInfo: async () => ({data: {}}),
    getToken: () => 'token',
    setToken() {},
    removeToken() {},
    getShopId: () => cookie.value,
    setShopId: (value) => {
      cookie.value = value;
    },
    removeShopId: () => {
      cookie.value = '';
    },
  });
  const script = source
    .replace(/export\s+default\s+user/, 'this.user = user')
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '');
  vm.runInContext(script, context);
  return {context, cookie};
}

async function getInfo(cookieShopId, info) {
  const {context, cookie} = loadStore(cookieShopId);
  context.getInfo = async () => ({data: {roles: ['店长'], ...info}});
  const state = {shopId: cookie.value, roles: []};
  const commit = (type, payload) => {
    if (type === 'SET_SHOP_ID') state.shopId = payload;
  };
  await context.user.actions.GetInfo({commit, state});
  return {shopId: state.shopId, cookie: cookie.value};
}

test('cookie 门店仍在授权范围内时保留用户的选择', async () => {
  const result = await getInfo(2, {shopId: 1, isGlobal: false, authorizedShopIds: [1, 2]});
  assert.equal(result.shopId, 2);
  assert.equal(result.cookie, 2);
});

test('调店时段结束后 cookie 还停在目标店：自动切回授权门店', async () => {
  // 服务端已回到档案店 1，账号也不再授权 2
  const result = await getInfo(2, {shopId: 1, isGlobal: false, authorizedShopIds: [1]});
  assert.equal(result.shopId, 1);
  assert.equal(result.cookie, 1);
});

test('没有 cookie 时用服务端解析出的默认门店', async () => {
  const result = await getInfo('', {shopId: 2, isGlobal: false, authorizedShopIds: [2, 1]});
  assert.equal(result.shopId, 2);
  assert.equal(result.cookie, 2);
});

test('服务端没给默认门店时退到授权集合的第一家', async () => {
  const result = await getInfo('', {shopId: null, isGlobal: false, authorizedShopIds: [3, 4]});
  assert.equal(result.shopId, 3);
});

test('全局角色不受 cookie 校验，仍按 cookie 走', async () => {
  const result = await getInfo(5, {shopId: 1, isGlobal: true, authorizedShopIds: null});
  assert.equal(result.shopId, 5);
  assert.equal(result.cookie, 5);
});

test('老版本服务端不返回作用域字段时保持原来的 cookie 优先', async () => {
  const result = await getInfo(5, {shopId: 1});
  assert.equal(result.shopId, 5);
  assert.equal(result.cookie, 5);
});

test('未配置任何授权门店时清空，交给页面提示未配置', async () => {
  const result = await getInfo(5, {shopId: null, isGlobal: false, authorizedShopIds: []});
  assert.equal(result.shopId, '');
  assert.equal(result.cookie, '');
});

test('cookie 里的脏值不参与比较', async () => {
  const {context} = loadStore('null');
  assert.equal(context.resolveScopedShopId('null', 7, [7], false).shopId, 7);
  assert.equal(context.resolveScopedShopId('undefined', 7, [7, 8], false).shopId, 7);
  assert.equal(context.resolveScopedShopId('abc', null, [8], false).shopId, 8);
});