import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/filter/index.js', import.meta.url), 'utf8');

// 过滤器模块依赖 store / constant / dateUtil，用例里按导入名注入假对象，只关心脱敏逻辑本身
function load(roles) {
  const context = vm.createContext({
    store: {getters: {roles}},
    constant: {},
    dateUtil: {},
    console,
  });
  const script = source
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '')
    .replace(/\bexport\s+/g, '');
  vm.runInContext(script, context);
  return context;
}

test('非特权角色看到脱敏手机号', () => {
  const ctx = load(['店长']);
  assert.equal(ctx.maskPhoneFilter('13812345678'), '1381***5678');
  assert.equal(ctx.maskPhoneFilter(''), '');
  assert.equal(ctx.maskPhoneFilter(null), '');
  // 已脱敏的文本再次过滤保持原样，不会叠加星号
  assert.equal(ctx.maskPhoneFilter('1381***5678'), '1381***5678');
  assert.equal(ctx.canSeeFullPhone(), false);
});

test('超级管理员看到完整手机号与称呼', () => {
  const ctx = load(['超级管理员']);
  assert.equal(ctx.canSeeFullPhone(), true);
  assert.equal(ctx.maskPhoneFilter('13812345678'), '13812345678');
  assert.equal(ctx.maskPhoneFilter(' 13812345678 '), '13812345678');
  assert.equal(ctx.maskPhoneFilter(null), '');
  assert.equal(ctx.maskNicknameFilter('用户13812345678'), '用户13812345678');
  assert.equal(ctx.maskNicknameFilter('13812345678'), '13812345678');
});

test('总助看到完整手机号与称呼', () => {
  const ctx = load(['总助']);
  assert.equal(ctx.canSeeFullPhone(), true);
  assert.equal(ctx.maskPhoneFilter('13812345678'), '13812345678');
  assert.equal(ctx.maskPhoneFilter(' 13812345678 '), '13812345678');
  assert.equal(ctx.maskPhoneFilter(null), '');
  assert.equal(ctx.maskPhoneFilter(''), '');
  assert.equal(ctx.maskNicknameFilter('用户13812345678'), '用户13812345678');
  assert.equal(ctx.maskNicknameFilter('13812345678'), '13812345678');
});

test('总助叠加在其它角色里仍可见完整手机号', () => {
  const ctx = load(['店长', '总助']);
  assert.equal(ctx.canSeeFullPhone(), true);
  assert.equal(ctx.maskPhoneFilter('13812345678'), '13812345678');
});

test('非特权角色的称呼脱敏规则保持不变', () => {
  const ctx = load(['门店店长', '财务']);
  assert.equal(ctx.maskNicknameFilter('用户13812345678'), '用户1381***5678');
  assert.equal(ctx.maskNicknameFilter('13812345678'), '1381***5678');
  // 真实姓名不做处理
  assert.equal(ctx.maskNicknameFilter('王小姐'), '王小姐');
  assert.equal(ctx.maskNicknameFilter(''), '');
});

test('roles 缺失时按非特权角色处理', () => {
  const ctx = load(undefined);
  assert.equal(ctx.canSeeFullPhone(), false);
  assert.equal(ctx.maskPhoneFilter('13812345678'), '1381***5678');
});