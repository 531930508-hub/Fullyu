/**
 * 手机号一键登录（getPhoneNumber）回归测试。
 *
 * 现场问题：点「手机号一键登录」立刻弹「已取消登录」，弹窗不关、再点还是同一句，顾客与门店都无从下手。
 * 根因是 onGetPhone 把「微信没给 code」的所有情况都当成用户取消，而微信其实是用同一个回调
 * 返回了失败原因（隐私指引未声明手机号 / 手机号快速验证未开通 / 主体未认证）。
 * 这里锁住两件事：失败原因要能分档并落到界面与日志；授权按钮用静态 open-type 且只在勾选协议后渲染。
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { parse } = require('vue/compiler-sfc')

const profileSource = fs.readFileSync(path.join(__dirname, 'src/pages/profile/index.vue'), 'utf8')

function loadPhoneAuth() {
  const source = fs.readFileSync(path.join(__dirname, 'src/utils/phone-auth.ts'), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, module: { exports }, console, String, Number })
  return exports
}

/** 只替换平台/网络边界，其余执行真实页面脚本 */
function loadProfile(overrides = {}) {
  const source = parse(profileSource).descriptor.scriptSetup.content
  const ast = ts.createSourceFile('page.ts', source, ts.ScriptTarget.Latest, true)
  const names = []
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text)
        else if (ts.isObjectBindingPattern(declaration.name)) declaration.name.elements.forEach(e => names.push(e.name.text))
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) names.push(statement.name.text)
  }
  const compiled = ts.transpileModule(`${source}\nexport { ${names.join(',')} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

  const calls = []
  const logins = []
  const warns = []
  const store = vue.reactive({
    token: '', isLoggedIn: false, isTrainer: false, userInfo: null, language: 'zh', activeView: 'student',
    login: async code => { logins.push(code); return { token: 't', user: { id: 'u', phone: '13812345678' } } },
    logout() { this.token = ''; this.isLoggedIn = false; this.userInfo = null },
  })
  const api = {
    getPoints: async () => ({ balance: 0 }), peekPendingGift: () => '', takePendingGift: () => '',
    loadBrandMember: async () => null, listMyOrders: async () => [], listMyVouchers: async () => [],
    ...overrides,
  }
  const uni = new Proxy({ getStorageSync: () => store.token, setStorageSync: () => {} }, {
    get(target, prop) { return target[prop] || (args => { calls.push([prop, args]); return '' }) },
  })
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, uni, console: { ...console, warn: (...a) => warns.push(a) }, setTimeout: fn => fn(), getCurrentPages: () => [],
    require(id) {
      if (id === 'vue') return vue
      if (id === '@dcloudio/uni-app') return { onShow: () => {}, onLoad: () => {} }
      if (id === 'pinia') return { storeToRefs: s => vue.toRefs(s) }
      if (id.includes('stores/user')) return { useUserStore: () => store }
      if (id.includes('utils/phone-auth')) return loadPhoneAuth()
      if (id.includes('locale')) return { t: key => key, tr: zh => zh, isEnglish: () => false, updateTabBarLanguage: () => {} }
      if (id.includes('utils/capsule')) return { readCapsuleLayout: () => ({ statusBarHeight: 0, headerTop: 16, capsuleRight: 0, navBarHeight: 44, hasCapsule: false }) }
      if (id.includes('utils/share')) return { consumeShareJump: () => '' }
      if (id.includes('utils/trainer-request')) return { getTrainerToken: () => '' }
      if (id.endsWith('.vue')) return {}
      return api
    },
  })
  const toasts = () => calls.filter(c => c[0] === 'showToast').map(c => c[1].title)
  return { page: exports, calls, logins, warns, toasts, store }
}

const okEvent = { detail: { errMsg: 'getPhoneNumber:ok', code: 'phone-code-1' } }
const denyEvent = { detail: { errMsg: 'getPhoneNumber:fail user deny' } }
const privacyEvent = { detail: { errMsg: 'getPhoneNumber:fail api scope is not declared in the privacy agreement' } }
const permissionEvent = { detail: { errMsg: 'getPhoneNumber:fail no permission', errno: 1400001 } }

test('phone-auth: 成功事件取到 code，失败事件不当作成功', () => {
  const { readPhoneAuthEvent } = loadPhoneAuth()
  assert.equal(readPhoneAuthEvent(okEvent).code, 'phone-code-1')
  assert.equal(readPhoneAuthEvent(okEvent).reason, null)
  assert.equal(readPhoneAuthEvent(denyEvent).code, '')
  assert.equal(readPhoneAuthEvent({ detail: undefined }).code, '')
})

test('phone-auth: 只有用户拒绝算取消，配置类失败单独分档', () => {
  const { readPhoneAuthEvent } = loadPhoneAuth()
  assert.equal(readPhoneAuthEvent(denyEvent).reason, 'cancelled')
  assert.equal(readPhoneAuthEvent(privacyEvent).reason, 'privacy')
  assert.equal(readPhoneAuthEvent(permissionEvent).reason, 'permission')
  assert.equal(readPhoneAuthEvent({ detail: { errMsg: 'getPhoneNumber:fail 该小程序未开通手机号快速验证' } }).reason, 'permission')
  assert.equal(readPhoneAuthEvent({ detail: { errMsg: 'getPhoneNumber:ok' } }).reason, 'legacy')
  assert.equal(readPhoneAuthEvent({ detail: { errMsg: 'getPhoneNumber:fail unknown thing' } }).reason, 'unknown')
  // 原始 errMsg 与 errno 必须保留，否则线上只能看到「已取消登录」这句无信息量的话
  assert.equal(readPhoneAuthEvent(permissionEvent).errno, 1400001)
  assert.match(readPhoneAuthEvent(privacyEvent).raw, /api scope is not declared/)
})

test('phone-auth: 每档失败都有自己的可执行文案', () => {
  const { phoneAuthMessage } = loadPhoneAuth()
  const cancelled = phoneAuthMessage({ reason: 'cancelled', raw: denyEvent.detail.errMsg, errno: null })
  const privacy = phoneAuthMessage({ reason: 'privacy', raw: privacyEvent.detail.errMsg, errno: null })
  const permission = phoneAuthMessage({ reason: 'permission', raw: permissionEvent.detail.errMsg, errno: 1400001 })
  const unknown = phoneAuthMessage({ reason: 'unknown', raw: 'getPhoneNumber:fail weird', errno: null })
  for (const message of [cancelled, privacy, permission, unknown]) {
    assert.ok(message.zh && message.en, 'zh/en 文案都要有')
  }
  const unique = new Set([cancelled.zh, privacy.zh, permission.zh, unknown.zh])
  assert.equal(unique.size, 4, '四档文案不能复用同一句')
  assert.doesNotMatch(privacy.zh, /已取消/)
  assert.doesNotMatch(permission.zh, /已取消/)
  // 未知档要把微信原文带上，门店/研发才能据此定位
  assert.match(unknown.zh, /weird/)
})

test('profile: 配置类失败不再谎称取消，界面给原因且保留重试', async () => {
  const { page, warns, toasts, logins } = loadProfile()
  await page.onGetPhone(privacyEvent)
  assert.deepEqual(toasts(), [], '隐私/权限失败不能显示「已取消登录」')
  assert.match(page.loginError.value, /隐私|授权/)
  assert.equal(page.loggingIn.value, false)
  assert.ok(warns.some(a => String(a.join(' ')).includes('api scope is not declared')), '原始 errMsg 必须进日志')
  assert.deepEqual(logins, [], '没有 code 时不能请求后端')

  page.loginError.value = ''
  await page.onGetPhone({ detail: { errMsg: 'getPhoneNumber:fail no permission' } })
  assert.equal(page.loginError.value.length > 0, true)
  assert.doesNotMatch(page.loginError.value, /已取消/)
})

test('profile: 用户真的拒绝时仍提示已取消，且不写红字', async () => {
  const { page, toasts } = loadProfile()
  await page.onGetPhone(denyEvent)
  assert.deepEqual(toasts(), ['已取消登录'])
  assert.equal(page.loginError.value, '')
})

test('profile: 拿到 code 才走后端登录', async () => {
  const { page, logins, toasts, store } = loadProfile({ getPoints: async () => ({ balance: 0 }) })
  store.login = async code => { logins.push(code); return { token: 't', user: { id: 'u', phone: '13812345678' } } }
  await page.onGetPhone(okEvent)
  assert.deepEqual(logins, ['phone-code-1'])
  assert.ok(toasts().includes('登录成功'))
})

test('profile: 服务端换号失败要把后端原因留在弹层里，而不是糊成一句「未完成」', async () => {
  const { page, store } = loadProfile()
  store.login = async () => { throw new Error('获取手机号失败，请重试') }
  page.openSignIn()
  await page.onGetPhone(okEvent)
  assert.match(page.loginError.value, /获取手机号失败/)
  assert.equal(page.sheet.value, 'signin', '失败后弹层保持打开，勾选与按钮都还在')
  assert.equal(page.loggingIn.value, false)
})

test('profile: 授权按钮用静态 open-type，且只在勾选协议后渲染', () => {
  assert.match(profileSource, /open-type="getPhoneNumber"/)
  assert.doesNotMatch(profileSource, /:open-type=/, 'open-type 不能在已有节点上动态切换')
  assert.match(profileSource, /v-if="!agreed"[\s\S]{0,400}?@tap="onTapLogin"/, '未勾选时点按只给行内提示')
  assert.match(profileSource, /v-else[\s\S]{0,400}?open-type="getPhoneNumber"/, '勾选后才创建带授权的按钮')
  assert.match(profileSource, /@getphonenumber="onGetPhone"/)
})