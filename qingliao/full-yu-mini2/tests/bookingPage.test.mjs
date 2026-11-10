import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const page = await readFile(new URL('../pages/index/select-project.vue', import.meta.url), 'utf8');
const helper = await readFile(new URL('../utils/bookingSelection.js', import.meta.url), 'utf8');
const rules = await import('data:text/javascript;base64,' + Buffer.from(helper).toString('base64'));
function setup() {
  const pending = [], messages = [], requests = [];
  let hidden = 0, created = 0;
  const context = vm.createContext({
    ...rules, console: {log() {}, error() {}},
    ref: value => ({value}), reactive: value => value,
    computed: fn => ({get value() {return fn();}}),
    onLoad() {}, onShow() {}, onMounted() {}, onUnmounted() {},
    getCurrentInstance: () => ({proxy: {}}),
    setTimeout: fn => {pending.push(fn); return pending.length;}, clearTimeout() {},
    debounce: fn => pending.push(fn),
    cookie: {getToken: () => 'test-only'},
    uni: {showToast: x => messages.push(x), showModal: x => messages.push(x),
      showLoading() {}, hideLoading: () => hidden++},
    api: {
      timeList: params => new Promise((resolve, reject) => requests.push({params, resolve, reject})),
      findBookingDates: async () => [{value:'2026-11-09', label:'周一'}]
    },
    shopApi: {maxPeopleCount: async () => 2},
    productApi: {productlist: async () => [{id:1, content:[{projectId:2}]}]},
    orderApi: {createOrder: async () => {created++; throw '所选疗愈师在该时段已有预约';}},
    constant: {payCutDownSeconds:900}
  });
  const script = page.match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[\s\S]*?\sfrom\s*['"][^'"]+['"];?/g, '');
  vm.runInContext(script + `\nthis.bindings = {getTimeList, onShopChange, openPayModelPage,
    selectedTime, selectedDate, ArrShopTime, shop, shoplist, optionsMassagist,
    optionsMassagistName, isLoading, statusShow,
    canConfirm: typeof canConfirm === 'undefined' ? null : canConfirm,
    isSubmitting: typeof isSubmitting === 'undefined' ? null : isSubmitting};`, context);
  const b = context.bindings;
  b.shop.value = {id:1}; b.shoplist.value = [{id:1}, {id:2}];
  b.selectedDate.value = '2026-11-08';
  return {b, context, pending, messages, requests, hidden:()=>hidden, created:()=>created};
}

test('changing stores preserves specified therapist and invalidates old slot', async () => {
  const s = setup();
  s.b.optionsMassagist.value = 7; s.b.optionsMassagistName.value = '疗愈师：A';
  s.b.selectedTime.value = '14:00'; s.b.ArrShopTime.value = [{time:'14:00', state:1}];
  await s.b.onShopChange({detail:{value:1}});
  assert.equal(s.b.optionsMassagist.value, 7, '不能切店后悄悄改为自动安排');
  assert.equal(s.b.selectedTime.value, null);
  assert.equal(s.b.canConfirm?.value, false);
});

test('older request cannot overwrite current store slots or loading state', async () => {
  const s = setup();
  s.b.selectedTime.value = '14:00';
  await s.b.getTimeList(); const first = s.pending.shift()();
  s.b.shop.value = {id:2};
  await s.b.getTimeList(); const second = s.pending.shift()();
  s.requests[0].resolve([{time:'14:00', state:1}]); await first;
  assert.equal(s.b.ArrShopTime.value.length, 0, '旧门店响应必须丢弃');
  assert.equal(s.b.isLoading.value, true);
  s.requests[1].resolve([{time:'15:00', state:1}]); await second;
  assert.equal(s.b.ArrShopTime.value[0].time, '15:00');
  assert.equal(s.b.isLoading.value, false);
  assert.equal(s.b.selectedTime.value, null);
});

test('booking errors are readable and always release submit lock and loading', async () => {
  const s = setup();
  s.b.selectedTime.value = '14:00'; s.b.ArrShopTime.value = [{time:'14:00', state:1}];
  await assert.doesNotReject(s.b.openPayModelPage());
  assert.equal(s.created(), 1);
  assert.equal(s.hidden(), 1);
  assert.equal(s.b.isSubmitting?.value, false);
  assert.ok(s.messages.some(m => m.content === '所选疗愈师在该时段已有预约'));
});

test('unavailable slot does not create an order', async () => {
  const s = setup();
  s.b.selectedTime.value = '14:00'; s.b.ArrShopTime.value = [{time:'14:00', state:0}];
  await s.b.openPayModelPage().catch(() => {});
  assert.equal(s.created(), 0);
});
