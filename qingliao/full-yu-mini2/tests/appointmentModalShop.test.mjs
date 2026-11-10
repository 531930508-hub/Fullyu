import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modal = await readFile(new URL('../components/AppointmentModal.vue', import.meta.url), 'utf8');

test('appointment modal queries times for the selected store', () => {
  const call = modal.match(/api\.timeList\(\{([\s\S]*?)\}\)/);
  assert.ok(call, '未找到 timeList 调用');
  assert.match(call[1], /shopId:\s*shopId\.value/, '可约时段必须按当前所选门店查询，避免与预约门店不一致');
});
