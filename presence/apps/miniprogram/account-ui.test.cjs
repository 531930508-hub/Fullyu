const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { parse, compileTemplate } = require('vue/compiler-sfc')
const pages = ['member', 'assets', 'profile', 'profile-edit', 'my-reviews']
const read = name => fs.readFileSync(path.join(__dirname, 'src/pages', name, 'index.vue'), 'utf8')

// Execute the real script-setup code with only platform/network boundaries replaced.
function loadPage(name, overrides = {}, loggedIn = true) {
  const source = parse(read(name)).descriptor.scriptSetup.content
  const ast = ts.createSourceFile('page.ts', source, ts.ScriptTarget.Latest, true)
  const names = []
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text)
        else if (ts.isObjectBindingPattern(declaration.name)) {
          declaration.name.elements.forEach(e => names.push(e.name.text))
        }
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) names.push(statement.name.text)
  }
  const compiled = ts.transpileModule(`${source}\nexport { ${names.join(',')} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const calls = []
  const store = vue.reactive({
    token: loggedIn ? 'token' : '', isLoggedIn: loggedIn, isTrainer: false,
    userInfo: loggedIn ? { id: 'user1', nickname: '真实用户', phone: '13812345678' } : null,
    language: 'zh', activeView: 'student',
    logout() { this.token = ''; this.isLoggedIn = false; this.userInfo = null },
  })
  const api = {
    listMemberProducts: async () => [], getActiveCard: async () => null,
    getProfile: async () => ({ nickname: '真实用户', phone: '13812345678' }),
    getPoints: async () => ({ balance: 0 }), getPointsHistory: async () => ({ items: [], total: 0 }),
    listMyVouchers: async () => [], listMyOrders: async () => [], listMyReviews: async () => [],
    updateProfile: async body => body, purchaseMember: async () => ({ orderId: 'order1' }), payOrder: async () => {},
    ...overrides,
  }
  const uni = new Proxy({ getStorageSync: () => store.token, setStorageSync: () => {} }, {
    get(target, prop) { return target[prop] || (args => calls.push([prop, args])) },
  })
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, uni, console, setTimeout: fn => fn(), getCurrentPages: () => [],
    require(id) {
      if (id === 'vue') return vue
      if (id === '@dcloudio/uni-app') return { onShow: () => {}, onLoad: () => {} }
      if (id === 'pinia') return { storeToRefs: s => vue.toRefs(s) }
      if (id.includes('stores/user')) return { useUserStore: () => store }
      if (id.includes('utils/capsule')) return { readCapsuleLayout: () => ({ statusBarHeight: 0, headerTop: 16, capsuleRight: 0, navBarHeight: 44, hasCapsule: false }) }
      if (id.includes('locale')) return { t: key => key, tr: zh => zh, isEnglish: () => false, updateTabBarLanguage: () => {} }
      if (id.endsWith('.vue')) return {}
      return api
    },
  })
  return { page: exports, calls, store }
}

for (const name of pages) {
  test(`${name}: real card layout, shared states/icons and current tokens`, () => {
    const source = read(name)
    const { descriptor, errors } = parse(source)
    assert.deepEqual(errors, [])
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: `${name}.vue`, id: name }).errors, [])
    assert.match(source, /PresenceIcon/)
    assert.match(source, /PageState/)
    assert.match(source, /var\(--radius-card\)/)
    assert.doesNotMatch(source, /#584219|#EAE0D7|#3F2F10|#FBF8F3|#A78E70/i)
  })
}

test('member: selection uses product ids and real yuan prices/benefits', async () => {
  const { page } = loadPage('member', {
    listMemberProducts: async () => [
      { id: 'a', type: 'MONTHLY', name: '卡A', price: '123.45', durationDays: 30, benefits: ['权益A'], status: 'ON_SHELF', sort: 0 },
      { id: 'b', type: 'MONTHLY', name: '卡B', price: 234, durationDays: 30, benefits: ['权益B'], status: 'ON_SHELF', sort: 1 },
    ],
  })
  assert.equal(typeof page.loadMemberData, 'function', 'member needs explicit loading/error lifecycle')
  await page.loadMemberData()
  page.selectedCard.value = 'b'
  assert.equal(page.selectedCardInfo.value.id, 'b')
  assert.equal(page.selectedCardInfo.value.price, 234)
  assert.deepEqual(Array.from(page.displayBenefits.value), ['权益B'])
  page.selectedCard.value = 'a'
  assert.equal(page.selectedCardInfo.value.price, 123.45)
})

test('member: active card disappearance clears stale membership and server endDate is displayed', async () => {
  let card = { id: 'real-card', type: 'QUARTERLY', status: 'ACTIVE', endDate: '2028-01-20T00:00:00Z' }
  const { page } = loadPage('member', { getActiveCard: async () => card })
  assert.equal(typeof page.loadMemberData, 'function')
  await page.loadMemberData()
  assert.equal(page.memberExpiry.value, '2028-01-20')
  card = null
  await page.loadMemberData()
  assert.equal(page.activeCard.value, null)
})

test('member: purchase sheet only collects supported fields and keeps private photos compressed', () => {
  const source = read('member')
  assert.match(source, /<BottomSheet/)
  assert.doesNotMatch(source, /buyForm\.(?:gender|birthday|nickname)|NO\.FY20250101/)
  assert.match(source, /sizeType:\s*\['compressed'\]/)
  assert.match(source, /purchaseMember\(/)
  assert.match(source, /await payOrder\(/)
  assert.match(source, /签到核验/)
})

test('assets: failed requests are error states, never fabricated zero balances', async () => {
  const { page } = loadPage('assets', { getPoints: async () => { throw new Error('offline') } })
  await page.loadData()
  assert.ok(page.loadError?.value, 'network failure must not become a zero asset view')
})

test('assets: revoked/expired vouchers cannot count as usable, yuan are not divided', async () => {
  const { page } = loadPage('assets', { listMyVouchers: async () => [
    { id: 'valid', amount: '28.50', status: 'UNUSED', expiresAt: '2099-01-01', applicableAll: true },
    { id: 'revoked', amount: 90, status: 'REVOKED', expiresAt: '2099-01-01' },
    { id: 'expired', amount: 80, status: 'EXPIRED', expiresAt: '2099-01-01' },
  ] })
  await page.loadData()
  assert.equal(page.usableVoucherCount.value, 1)
  assert.equal(page.vouchers.value[0].amount, 28.5)
  assert.notEqual(page.vouchers.value[1].statusLabel, '可使用')
  assert.notEqual(page.vouchers.value[2].statusLabel, '可使用')
})

test('profile: guest hides statistics, quick-edit routes to the supported editor', () => {
  const source = read('profile')
  assert.match(source, /v-if="isLoggedIn[^\"]*"[^>]*class="(?:stats-card|asset-bar)"/)
  assert.match(source, /@tap="goEditProfile"/)
  assert.match(source, /\/pages\/profile-edit\/index/)
  assert.doesNotMatch(source, /showEditPopup|editVisible|profile\.memberActive/)
  assert.match(source, /open-type="getPhoneNumber"/)
  assert.match(source, /\.devLogin\(/)
})

test('profile: real membership expiry and only course orders feed overview', async () => {
  const { page } = loadPage('profile', {
    getActiveCard: async () => ({ type: 'QUARTERLY', status: 'ACTIVE', endDate: '2028-01-20T00:00:00Z' }),
    listMyOrders: async () => [
      { orderType: 'COURSE', status: 'PAID' }, { orderType: 'COURSE', status: 'COMPLETED' },
      { orderType: 'WAITLIST', status: 'PAID' }, { orderType: 'MEMBER_CARD', status: 'COMPLETED' },
    ],
  })
  await page.loadUserData()
  assert.equal(page.upcomingCount.value, 1)
  assert.equal(page.completedCount.value, 1)
  assert.equal(page.memberExpiry?.value, '2028-01-20')
})

for (const [name, method, apiName] of [
  ['assets', 'loadData', 'getPoints'], ['my-reviews', 'load', 'listMyReviews'], ['profile-edit', 'loadProfile', 'getProfile'],
]) {
  test(`${name}: guests do not issue authenticated requests`, async () => {
    let requests = 0
    const { page } = loadPage(name, { [apiName]: async () => { requests++; return [] } }, false)
    await page[method]()
    assert.equal(requests, 0)
  })
}

test('profile-edit: save uses only nickname/avatar, and failure never reports success', async () => {
  let payload
  const { page, calls } = loadPage('profile-edit', { updateProfile: async body => { payload = body; throw new Error('offline') } })
  await page.loadProfile()
  page.form.value.nickname = ' 修改后 '
  await page.handleSave()
  assert.deepEqual(Object.keys(payload).sort(), ['avatar', 'nickname'])
  assert.equal(payload.nickname, '修改后')
  assert.equal(calls.some(([method, args]) => method === 'showToast' && args.icon === 'success'), false)
  assert.ok(page.saveError?.value)
  assert.doesNotMatch(read('profile-edit'), /v-model="form\.(?:birthday|gender|city|photo|preferences)"/)
})

test('my-reviews: distinguishes failed load from a real empty list', async () => {
  const { page } = loadPage('my-reviews', { listMyReviews: async () => { throw new Error('offline') } })
  await page.load()
  assert.ok(page.loadError?.value)
  assert.equal(page.loading.value, false)
})

test('shared SVG image icons receive resolved colors, not inaccessible CSS variables', () => {
  for (const name of pages) {
    assert.equal(/color="var\(/.test(read(name)), false, `${name}: data-URL SVG cannot resolve page CSS variables`)
    assert.equal(/:color="[^\"]*var\(/.test(read(name)), false, `${name}: dynamic SVG colors must also resolve`)
  }
})

test('member: unfinished payment retries one order and reconciles status without triggering refunds', async () => {
  let purchases = 0
  const { page, calls } = loadPage('member', {
    listMemberProducts: async () => [{ id: 'real', name: '真实卡', type: 'MONTHLY', price: 123.45, durationDays: 30, status: 'ON_SHELF', benefits: [], sort: 0 }],
    getProfile: async () => ({ hasVerificationPhoto: true }),
    purchaseMember: async () => { purchases++; return { orderId: 'pending-real' } },
    payOrder: async () => { throw new Error('cancelled') },
    listMyOrders: async () => [{ id: 'pending-real', orderType: 'MEMBER_CARD', status: 'CANCELLED' }],
  })
  await page.loadMemberData()
  page.showBuyForm()
  await page.handleBuy()
  await page.handleBuy()
  assert.equal(purchases, 1)
  assert.equal(page.pendingOrderId.value, 'pending-real')
  assert.equal(calls.some(([method, args]) => method === 'showToast' && args.icon === 'success'), false)
  // cancelOrder can refund an already-paid member order, so this page only reads status.
  assert.equal(typeof page.refreshPendingPurchase, 'function')
  await page.refreshPendingPurchase()
  assert.equal(page.pendingOrderId.value, '')
  assert.doesNotMatch(read('member'), /cancelOrder\(/)
})

test('assets: incomplete reduce-to coupon must not invent a zero target price', async () => {
  const { page } = loadPage('assets', { listMyVouchers: async () => [{ id: 'v', mode: 'REDUCE_TO', amount: 0, status: 'UNUSED', expiresAt: '2099-01-01' }] })
  await page.loadData()
  assert.equal(page.vouchers.value[0].displayAmount, null)
  assert.notEqual(page.vouchers.value[0].statusClass, 'active')
})

test('member: expired login dismisses purchase sheet and clears local private previews', async () => {
  let session
  const { page, store } = loadPage('member', {
    listMemberProducts: async () => [{ id: 'real', name: '卡', type: 'MONTHLY', price: 12, durationDays: 30, status: 'ON_SHELF', benefits: [], sort: 0 }],
    getProfile: async () => ({ hasVerificationPhoto: true }),
    purchaseMember: async () => { session.token = ''; throw new Error('401') },
  })
  session = store
  await page.loadMemberData()
  page.showBuyForm()
  page.buyForm.value.photo = 'local-private-preview'
  await page.handleBuy()
  assert.equal(page.formVisible.value, false)
  assert.equal(page.buyForm.value.photo, '')
  assert.equal(store.isLoggedIn, false)
})
