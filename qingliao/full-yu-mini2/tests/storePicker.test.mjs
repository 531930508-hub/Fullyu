import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const page = await readFile(new URL('../pages/index/select-project.vue', import.meta.url), 'utf8');
const helperCode = await readFile(new URL('../utils/storeSelection.js', import.meta.url), 'utf8');
const rules = await import('data:text/javascript;base64,' + Buffer.from(helperCode).toString('base64'));

const stores = [
  { id: 1, name: '人民广场店', shortAddress: '人广来福士5F-11', latitude: 31.2304, longitude: 121.4737 },
  { id: 2, name: '静安店', shortAddress: '静安嘉里中心', latitude: 31.2236, longitude: 121.4453 },
  { id: 3, name: '徐汇店', shortAddress: '徐家汇中心', latitude: 31.1912, longitude: 121.4370 }
];

function setup() {
  const messages = [];
  let booked = 0;
  const context = vm.createContext({
    ...rules,
    console: { log() {}, error() {} },
    ref: value => ({ value }),
    reactive: value => value,
    computed: fn => ({ get value() { return fn(); } }),
    onLoad() {}, onShow() {}, onMounted() {}, onUnmounted() {},
    getCurrentInstance: () => ({ proxy: {} }),
    setTimeout: () => 1, clearTimeout() {},
    debounce: fn => fn,
    cookie: { getToken: () => null },
    moment: () => ({ format: () => '2026-11-08', add: () => ({ format: () => '2026-11-08' }) }),
    miniImageApi: {},
    customerApi: {},
    orderApi: {},
    productApi: {},
    customerMassagistBlockApi: {},
    constant: { payCutDownSeconds: 900 },
    shopApi: { maxPeopleCount: async () => 2 },
    api: {
      findBookingDates: async () => { booked++; return [{ value: '2026-11-09', label: '周一' }]; },
      timeList: async () => []
    },
    uni: {
      showToast: x => messages.push(x),
      showModal: x => messages.push(x),
      showLoading() {}, hideLoading() {},
      navigateBack: () => messages.push({ back: true }),
      getLocation: ({ fail }) => fail && fail(),
      getSetting: ({ success }) => success({ authSetting: {} })
    }
  });
  const script = page.match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[\s\S]*?\sfrom\s*['"][^'"]+['"];?/g, '');
  vm.runInContext(script + `\nthis.bindings = {applyDefaultStore, openStorePicker, chooseStore,
    confirmStorePicker, cancelStorePicker, shop, shoplist, optionsShopId, storePickerChoice,
    nearestId, userLocation, storePickerVisible};`, context);
  const b = context.bindings;
  b.shoplist.value = stores.map(s => ({ ...s }));
  return { b, messages, booked: () => booked };
}

test('无指定门店时按定位预选最近门店并打上最近标记', () => {
  const s = setup();
  s.b.optionsShopId.value = 0;
  s.b.userLocation.value = { latitude: 31.2231, longitude: 121.4445 };
  s.b.applyDefaultStore();
  assert.equal(s.b.shop.value.id, 2);
  assert.equal(s.b.storePickerChoice.value, 2);
  assert.equal(s.b.nearestId.value, 2);
});

test('入口带门店时以该门店为准，同时仍标出定位最近门店', () => {
  const s = setup();
  s.b.optionsShopId.value = 3;
  s.b.userLocation.value = { latitude: 31.2231, longitude: 121.4445 };
  s.b.applyDefaultStore();
  assert.equal(s.b.shop.value.id, 3, '普通预约与点钟预约入口指定的门店不能被定位覆盖');
  assert.equal(s.b.storePickerChoice.value, 3);
  assert.equal(s.b.nearestId.value, 2);
});

test('没有定位时回退到门店列表首项，不弹定位推荐提示', () => {
  const s = setup();
  s.b.optionsShopId.value = 0;
  s.b.userLocation.value = null;
  s.b.applyDefaultStore();
  assert.equal(s.b.shop.value.id, 1);
  assert.equal(s.b.nearestId.value, null);
});

test('进入预约页会打开门店选择弹层，重复调用不叠加', () => {
  const s = setup();
  s.b.openStorePicker();
  s.b.openStorePicker();
  assert.equal(s.b.storePickerVisible.value, true);
});

test('门店列表为空时不打开弹层', () => {
  const s = setup();
  s.b.shoplist.value = [];
  s.b.openStorePicker();
  assert.equal(s.b.storePickerVisible.value, false);
});

test('确认选择后更新门店并刷新可约日期', async () => {
  const s = setup();
  s.b.storePickerVisible.value = true;
  s.b.shop.value = { ...stores[0] };
  s.b.chooseStore(2);
  await s.b.confirmStorePicker();
  assert.equal(s.b.shop.value.id, 2);
  assert.equal(s.b.storePickerVisible.value, false);
  assert.equal(s.booked(), 1);
});

test('确认原门店不重复刷新可约日期', async () => {
  const s = setup();
  s.b.storePickerVisible.value = true;
  s.b.shop.value = { ...stores[0] };
  s.b.storePickerChoice.value = 1;
  await s.b.confirmStorePicker();
  assert.equal(s.b.storePickerVisible.value, false);
  assert.equal(s.booked(), 0);
});

test('取消选择会关闭弹层并返回上一页', () => {
  const s = setup();
  s.b.storePickerVisible.value = true;
  s.b.cancelStorePicker();
  assert.equal(s.b.storePickerVisible.value, false);
  assert.ok(s.messages.some(m => m.back), '取消后应返回上一页而不是停在预约页');
});

test('预约页入口统一先选门店：独立底部弹层且入口必弹', () => {
  // 不再使用 uni-popup：页面内 fixed 层级高于 1000 的固定底栏，避免透出与遮挡
  assert.ok(!/uni-popup ref="storePopup"/.test(page), '不应再依赖 uni-popup 的层级与插槽样式');
  assert.ok(!/mode="bottom"/.test(page), '不应再使用无效的 mode 属性');
  assert.match(page, /<view v-if="storePickerVisible" class="store-sheet-layer">/);
  assert.match(page, /\.store-sheet-layer \{[\s\S]*?z-index: 99999;/, '弹层需高于页面固定底栏 z-index 1000');
  assert.match(page, /\.store-sheet \{[\s\S]*?background: #FFFFFF;/, '弹层必须有实色背景');
  assert.match(page, /\.store-sheet-mask \{[\s\S]*?rgba\(28, 22, 14, 0\.48\)/, '遮罩需压暗底层页面');
  assert.match(page, /\.store-sheet-actions \{[\s\S]*?button \{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/, '按钮文字必须用 flex 垂直居中（App.vue 全局 line-height: initial !important 会压掉 line-height 居中）');
  assert.ok(!/\.store-sheet-actions \{[\s\S]*?button \{[\s\S]*?line-height: 88rpx/.test(page), '固定高度按钮不要再靠 line-height 居中');
  assert.match(page, /选择预约门店/);
  assert.match(page, /applyDefaultStore\(\)\s*\n\s*openStorePicker\(\)/, 'locationWZ 必须在定位后打开门店选择');
  assert.match(page, /shopId:\s*optionsShopId\.value/, '指定门店（点钟/门店入口）必须优先于定位');
  assert.match(page, /已带入预约入口门店/, '指定门店与最近门店不同时，提示不能谎称已按定位选最近');
});
