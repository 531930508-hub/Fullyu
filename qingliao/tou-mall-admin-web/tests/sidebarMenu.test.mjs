import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const permissionSource = await readFile(new URL('../src/store/modules/permission.js', import.meta.url), 'utf8');
const sidebarSource = await readFile(new URL('../src/views/layout/components/Sidebar/SidebarItem.vue', import.meta.url), 'utf8');

// 与 src/router/index.js 同构的最小路由表：一个常驻首页 + 三个需要权限的一级分组
const constantRouterMap = [
  {path: '', meta: {title: '首页'}, children: [{path: 'home', name: 'home', meta: {title: '首页'}}]}
];
const asyncRouterMap = [
  {
    path: '/booking', name: 'booking', meta: {title: '预约与订单'}, children: [
      {path: '/appointment/board', name: 'board', meta: {title: '排班看板'}},
      {path: '/order/approval', name: 'approval', meta: {title: '退款审批'}, hidden: true}
    ]
  },
  {
    path: '/growth', name: 'growth', meta: {title: '客户与营销'}, children: [
      {path: '/crm/customer', name: 'customer', meta: {title: '客户列表'}}
    ]
  },
  {
    path: '/staff', name: 'staff', meta: {title: '门店与系统'}, children: [
      {path: '/staff/team', name: 'teamCenter', meta: {title: '门店团队'}},
      {path: '/staff/allocMenu', name: 'allocMenu', meta: {title: '分配菜单'}, hidden: true}
    ]
  }
];

function loadPermission() {
  const ctx = vm.createContext({constantRouterMap, asyncRouterMap});
  vm.runInContext(permissionSource
    .replace(/^import .*$/gm, '')
    .replace('export default', 'this.permission ='), ctx);
  return ctx.permission;
}

async function generate(menus, roles = ['疗愈师']) {
  const permission = loadPermission();
  const state = {routers: constantRouterMap, addRouters: [], menus: []};
  await permission.actions.GenerateRoutes(
    {commit: (type, payload) => permission.mutations[type](state, payload)},
    {menus, roles}
  );
  return state;
}

function loadSidebarMethods() {
  const ctx = vm.createContext({mapGetters: () => ({}), resolveNavIcon: () => ''});
  vm.runInContext(sidebarSource.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '')
    .replace('export default', 'this.opts ='), ctx);
  return ctx.opts.methods;
}

const isVisible = (methods, item) => methods.hasVisibleChild.call(methods, item);
const names = list => Array.from(list, item => item.name);
const titles = list => Array.from(list, item => item.meta && item.meta.title);

// 侧边栏最终会画出来的分组标题：权限过滤过、并且还有可见页面
function renderedGroups(routers, methods) {
  return Array.from(routers)
    .filter(item => !item.hidden && item.children && isVisible(methods, item))
    .map(item => (item.meta && item.meta.title));
}

test('只勾了父级分组、没有任何子页授权的账号看不到空下拉', async () => {
  const state = await generate([{name: 'booking', title: '预约与订单'}]);
  const methods = loadSidebarMethods();
  const booking = Array.from(state.addRouters).find(r => r.name === 'booking');
  // 隐藏页恒可通过权限过滤（老逻辑），所以分组会留在路由表里注册路由
  assert.deepEqual(names(booking.children), ['approval']);
  // 但侧边栏不能再把它画成一个点开是空的下拉
  assert.deepEqual(renderedGroups(state.routers, methods), ['首页']);
});

test('未授权任何菜单的疗愈师只剩常驻菜单', async () => {
  const state = await generate([]);
  const methods = loadSidebarMethods();
  assert.deepEqual(renderedGroups(state.routers, methods), ['首页']);
  assert.equal(titles(state.routers).includes('客户与营销'), false);
});

test('只授权隐藏子页时路由仍注册，但侧边栏不渲染该分组', async () => {
  const state = await generate([{name: 'allocMenu'}]);
  const methods = loadSidebarMethods();
  const staff = Array.from(state.addRouters).find(r => r.name === 'staff');
  assert.deepEqual(names(staff.children), ['allocMenu']);
  assert.equal(isVisible(methods, staff), false);
  assert.deepEqual(renderedGroups(state.routers, methods), ['首页']);
});

test('有可见子页的分组照常显示，隐藏子页不进下拉', async () => {
  const methods = loadSidebarMethods();
  const state = await generate([{name: 'board'}, {name: 'approval'}, {name: 'teamCenter'}]);
  assert.deepEqual(names(state.addRouters).sort(), ['booking', 'staff']);
  const booking = Array.from(state.addRouters).find(r => r.name === 'booking');
  assert.equal(isVisible(methods, booking), true);
  const childNames = Array.from(methods.childBlocks(booking))
    .flatMap(block => Array.from(block.items, child => child.name));
  assert.deepEqual(childNames, ['board']);
});

test('超级管理员菜单表为空时三个分组全部保留', async () => {
  const state = await generate([], ['超级管理员']);
  assert.deepEqual(names(state.addRouters), ['booking', 'growth', 'staff']);
});

test('嵌套分组按最内层判断是否有可见页面', () => {
  const methods = loadSidebarMethods();
  assert.equal(isVisible(methods, {children: [{hidden: true}, {children: [{hidden: true}]}]}), false);
  assert.equal(isVisible(methods, {children: [{hidden: true}, {children: [{hidden: true}, {path: 'x'}]}]}), true);
  assert.equal(isVisible(methods, {children: []}), false);
});

test('侧边栏模板对空分组加了显隐守卫', () => {
  assert.match(sidebarSource, /v-if="!item\.hidden && item\.children && hasVisibleChild\(item\)"/);
});