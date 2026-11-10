import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read = p => readFile(new URL(p, import.meta.url), 'utf8').catch(() => '');
const source = await read('../src/views/promotion/giftCard/PrepaidLedgerDialog.vue');
const index = await read('../src/views/promotion/giftCard/index.vue');
const api = await read('../src/api/promotion/giftCard.js');
const importForm = await read('../src/views/promotion/giftCard/importGiftCardForm.vue');

function setup(prepaidPage) {
  assert.ok(source, '预收台账弹窗尚未实现');
  const calls = [];
  let loading = 0;
  const context = vm.createContext({
    giftCardApi: {prepaidPage: async p => { calls.push({...p}); return prepaidPage ? prepaidPage(p, calls.length) : {data: {list: [], total: 0, summary: {}}}; }},
  });
  vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '').replace('export default', 'this.options ='), context);
  const state = Object.assign(context.options.data(), context.options.methods, {
    showFullLoading: () => loading++, hideFullLoading: () => loading--,
  });
  return {state, calls, loading: () => loading};
}

test('open resets filters to page 1 and queries the prepaid ledger', async () => {
  const {state, calls} = setup();
  state.query.pageNum = 4; state.query.code = 'OLD';
  await state.open();
  assert.equal(state.visible, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pageNum, 1);
  assert.equal(calls[0].code, '');
  assert.ok(calls[0].pageSize > 0);
});

test('summary and rows come from the server response, summary not recomputed from page', async () => {
  const {state} = setup(async () => ({data: {list: [{id: 1, amount: 120}], total: 31,
    summary: {distributeAmount: 300, voidAmount: -80, netAmount: 220}}}));
  await state.open();
  assert.equal(state.total, 31);
  assert.equal(state.list.length, 1);
  assert.equal(state.formatAmount(state.summary.netAmount), '220.00');
  assert.equal(state.formatAmount(state.summary.voidAmount), '-80.00');
  assert.equal(state.formatAmount(null), '0.00');
});

test('date range maps to inclusive day bounds and resets to page 1', async () => {
  const {state, calls} = setup();
  await state.open();
  state.query.pageNum = 3;
  await state.handleRange(['2026-11-01', '2026-11-08']);
  const last = calls[calls.length - 1];
  assert.equal(last.startTime, '2026-11-01 00:00:00');
  assert.equal(last.endTime, '2026-11-08 23:59:59');
  assert.equal(last.pageNum, 1);
  await state.handleRange(null);
  assert.equal(calls[calls.length - 1].startTime, '');
});

test('stale response from an earlier filter never overwrites the newer one', async () => {
  const releases = [];
  const {state} = setup((p, n) => new Promise(r => releases.push(() => r({data: {list: [{id: n}], total: n, summary: {}}}))));
  const first = state.open();
  const second = state.search();
  releases[1](); await second;
  releases[0](); await first;
  assert.equal(state.list[0].id, 2);
  assert.equal(state.total, 2);
});

test('failed query keeps the dialog open, clears loading and shows an error', async () => {
  const {state, loading} = setup(async () => { throw new Error('boom'); });
  await state.open();
  assert.equal(state.visible, true);
  assert.equal(state.loading, false);
  assert.equal(loading(), 0);
  assert.ok(state.error);
});

test('api, entry button and import hint are wired', () => {
  assert.match(api, /prepaidPage\(params\)[\s\S]*?\/giftCard\/prepaid\/page/);
  assert.match(index, /<prepaid-ledger-dialog[^>]*ref="refPrepaidLedger"/);
  assert.match(index, /预收台账/);
  assert.match(importForm, /面值/);
});
