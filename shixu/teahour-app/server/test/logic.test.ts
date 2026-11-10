import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yuanToCents, centsToYuan, formatMoney } from '../src/lib/money.js';
import {
  parseDelimited,
  resolveExpenseCategory,
  resolveExpenseStore,
  parseExpenseDate,
  parseExpenseAmount,
  expenseKey,
  parseExpenseSheet,
  normalizeExpenseText,
  EXPENSE_CATEGORIES
} from '../src/lib/csv.js';
import { resolveRange, monthRange, addDays, parseDateOnly, toDateString } from '../src/lib/dates.js';
import { cupLabel, uniquePickupCode, dayStamp } from '../src/lib/ids.js';
import { PERMISSION_CODES, ROLE_TEMPLATES, PAGE_PERM, PERMISSION_MODULES, PERMISSIONS } from '../src/lib/permissions.js';

const stores = [
  { id: 's1', name: '上海·城市中心店', nameEn: 'Shanghai Central', short: '城市中心', city: '上海', cityEn: 'Shanghai' },
  { id: 's2', name: '上海·西岸店', nameEn: 'Shanghai West Bund', short: '西岸', city: '上海', cityEn: 'Shanghai' }
];

test('金额换算覆盖边界与非法输入', () => {
  assert.equal(yuanToCents('12.34'), 1234);
  assert.equal(yuanToCents('0.01'), 1);
  assert.equal(yuanToCents('1,234.5'), 123450);
  assert.equal(yuanToCents('¥88'), 8800);
  assert.throws(() => yuanToCents('abc'), /金额应为正数/);
  assert.throws(() => yuanToCents(''), /金额应为正数/);
  assert.throws(() => yuanToCents(null), /金额应为正数/);
  assert.throws(() => yuanToCents('-2.5'), /金额应为正数/);
  assert.throws(() => yuanToCents('1.234'), /金额应为正数/);
  assert.throws(() => yuanToCents(0), /超出有效范围/);
  assert.throws(() => yuanToCents(2000000), /超出有效范围/);
  assert.equal(centsToYuan(0), '0');
  assert.equal(centsToYuan(-99), '-0.99');
  assert.equal(formatMoney(123456), '¥1,234.56');
  assert.equal(formatMoney(5), '¥0.05');
  assert.equal(formatMoney(100), '¥1');
  assert.equal(formatMoney(-500), '−¥5');
  assert.equal(formatMoney(-99), '−¥0.99');
});

test('CSV 解析处理引号内逗号、BOM、CRLF 与注释', () => {
  const rows = parseDelimited('﻿日期,门店,备注\r\n2026-10-01,静安,"含,逗号"\n# 注释行\n2026-10-02,西岸,普通');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].cells[0], '日期');
  assert.equal(rows[1].cells[0], '2026-10-01');
  assert.equal(rows[1].line, 2);
  assert.equal(rows[1].cells[2], '含,逗号');
  assert.equal(rows[2].cells[0], '2026-10-02');
  assert.equal(rows[2].line, 4);
  assert.deepEqual(parseDelimited('a\tb\n1\t2')[0].cells, ['a', 'b']);
  assert.equal(normalizeExpenseText(' 上海·西岸店 '), '上海西岸店');
});

test('类别与门店识别支持中英文与别名，未知值不臆断', () => {
  assert.equal(resolveExpenseCategory('人力').id, 'labor');
  assert.equal(resolveExpenseCategory('rent').id, 'rent');
  assert.equal(resolveExpenseCategory('总部管理费').id, 'hq');
  assert.equal(resolveExpenseCategory('水电').id, 'utilities');
  assert.throws(() => resolveExpenseCategory(' unknown '), /无法识别/);
  assert.throws(() => resolveExpenseCategory(''), /不能为空/);
  assert.equal(resolveExpenseStore(stores, '西岸'), 's2');
  assert.equal(resolveExpenseStore(stores, '城市中心'), 's1');
  assert.equal(resolveExpenseStore(stores, '城市中心'), 's1');
  assert.equal(resolveExpenseStore(stores, '上海·西岸店'), 's2');
  assert.equal(resolveExpenseStore(stores, 'West Bund'), 's2');
  assert.equal(resolveExpenseStore(stores, '总部'), 'brand');
  assert.throws(() => resolveExpenseStore(stores, '不存在的店'), /无法识别门店/);
  assert.throws(() => resolveExpenseStore(stores, '上海'), /匹配到多家/);
  assert.throws(() => resolveExpenseStore(stores, ''), /不能为空/);
});

test('费用日期只接受真实日历日，金额拒绝零负与非法值', () => {
  assert.equal(parseExpenseDate('2026-02-28'), '2026-02-28');
  assert.equal(parseExpenseDate('2026-2-8'), '2026-02-08');
  assert.throws(() => parseExpenseDate('2026-02-30'), /不存在/);
  assert.throws(() => parseExpenseDate('2026-13-01'), /不存在/);
  assert.throws(() => parseExpenseDate('昨天'), /YYYY-MM-DD/);
  assert.equal(parseExpenseAmount('12.5'), 1250);
  assert.equal(parseExpenseAmount('¥1,000'), 100000);
  assert.throws(() => parseExpenseAmount('0'), /应为正数/);
  assert.throws(() => parseExpenseAmount('-5'), /应为正数/);
  assert.throws(() => parseExpenseAmount('abc'), /应为正数/);
});

test('整表解析跳过表头并汇总错误行号，同键行计为重复', () => {
  const text = '日期,门店,类别,金额,备注\n2026-10-01,城市中心,人力,100,十月工资\n2026-10-01,城市中心,人力,100,十月工资\nbad,城市中心,人力,50,x';
  const parsed = parseExpenseSheet(text, stores);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.duplicates, 1);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].line, 4);
  assert.equal(parseExpenseSheet('', stores).errors[0].message, '没有可读取的数据');
  const missingHeader = parseExpenseSheet('a,b\n1,2', stores);
  assert.match(missingHeader.errors[0].message, /表头缺少/);
  assert.equal(
    expenseKey({ storeId: 's1', category: 'labor', date: '2026-10-01', amountCents: 10000, memo: 'a ' }),
    expenseKey({ storeId: 's1', category: 'labor', date: '2026-10-01', amountCents: 10000, memo: 'a' })
  );
});

test('时间范围解析：默认今天、7/30 天、自定义区间与越界回退', () => {
  const now = Date.parse('2026-10-29T12:00:00+08:00');
  const today = resolveRange({ now });
  assert.equal(today.fromDate, '2026-10-29');
  assert.equal(today.toDate, '2026-10-29');
  assert.equal(resolveRange({ range: '7', now }).fromDate, '2026-10-23');
  assert.equal(resolveRange({ range: '30', now }).fromDate, '2026-09-30');
  const custom = resolveRange({ range: 'custom', from: '2026-10-01', to: '2026-10-15', now });
  assert.equal(custom.fromDate, '2026-10-01');
  assert.equal(custom.toDate, '2026-10-15');
  const flipped = resolveRange({ range: 'custom', from: '2026-10-15', to: '2026-10-01', now });
  assert.equal(flipped.fromDate, '2026-10-01');
  assert.equal(flipped.toDate, '2026-10-15');
  const invalid = resolveRange({ range: 'custom', from: 'bad', to: '2026-10-01', now });
  assert.equal(invalid.fromDate, '2026-10-29');
  assert.equal(monthRange(now).fromDate, '2026-10-01');
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
  assert.throws(() => parseDateOnly('2026-02-30'), /不存在|无效|Invalid/);
  assert.equal(toDateString(now), '2026-10-29');
});

test('杯贴编号与提货码：格式稳定且避开已占用值', () => {
  assert.equal(cupLabel('A023', 2), 'A023-2');
  assert.match(dayStamp(), /^\d{8}$/);
  let calls = 0;
  const code = uniquePickupCode(() => {
    calls += 1;
    return calls < 3;
  });
  assert.match(code, /^\d{4}$/);
  assert.ok(calls >= 3);
});

test('权限目录自洽：模块、页面映射与角色模板不悬空', () => {
  assert.equal(PERMISSIONS.length, 31);
  const moduleKeys = new Set(PERMISSION_MODULES.map((m) => m.key));
  for (const p of PERMISSIONS) assert.ok(moduleKeys.has(p.module), `${p.code} 模块悬空`);
  for (const perm of Object.values(PAGE_PERM).flat()) assert.ok(PERMISSION_CODES.includes(perm), `${perm} 未登记`);
  for (const role of ROLE_TEMPLATES) {
    for (const perm of role.perms) {
      assert.ok(perm === '*' || PERMISSION_CODES.includes(perm), `${role.id} 授予未登记权限 ${perm}`);
    }
  }
});
