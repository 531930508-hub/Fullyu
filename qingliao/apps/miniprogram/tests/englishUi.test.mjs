import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import vm from 'node:vm'

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8')
const dictionarySource = await read('utils/i18n.dict.js')
const { default: dict } = await import('data:text/javascript;base64,' + Buffer.from(dictionarySource).toString('base64'))
const localeSource = await read('utils/locale.js')

function localeSession(stored = 'zh') {
  const storage = new Map([['fullyu.lightheal.locale', stored]])
  const context = vm.createContext({
    dict,
    ref: value => ({ value }),
    uni: {
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      setNavigationBarTitle() {}
    }
  })
  const source = localeSource.replace(/^import .+$/gm, '').replace(/\bexport /g, '')
  vm.runInContext(source + '\nthis.api = { t, setLocale, useLocale, localeClass: typeof localeClass === "function" ? localeClass : null, bookingDate: typeof bookingDate === "function" ? bookingDate : null };', context)
  return { ...context.api, storage }
}

test('service titles use the approved English names without marketing substitutes', () => {
  const session = localeSession('en')
  assert.equal(session.t('全感悦耳'), 'Full Ear Spa')
  assert.equal(session.t('全感舒筋'), 'Full Senses Massage')
  assert.equal(session.t('头部水疗'), 'Full Hair Spa')
})

test('critical actions are short without hiding their meaning', () => {
  assert.equal(dict['确认支付'], 'Pay')
  assert.equal(dict['确认修改'], 'Save changes')
  assert.equal(dict['选择支付方式'], 'Payment method')
  assert.ok(dict['联系客服'].length <= 10)
})

test('English layout follows the same persisted language as the text', () => {
  const session = localeSession('en')
  assert.equal(typeof session.localeClass, 'function')
  assert.equal(session.localeClass(), 'locale-en')
  assert.equal(session.t('取消'), 'Cancel')
  session.setLocale('zh')
  assert.equal(session.localeClass(), '')
  assert.equal(session.t('取消'), '取消')
  assert.equal(session.storage.get('fullyu.lightheal.locale'), 'zh')
  session.setLocale('en')
  assert.equal(session.useLocale().lang.value, 'en')
})

test('missing translations and legitimate empty translations are not lost', () => {
  const session = localeSession('en')
  assert.equal(session.t('unlisted service'), 'unlisted service')
  dict['test empty translation'] = ''
  assert.equal(session.t('test empty translation'), '')
  delete dict['test empty translation']
})

for (const path of ['components/AddService.vue', 'components/AddServiceAll.vue', 'components/AppointmentModal.vue', 'pages/index/select-project.vue']) {
  test(path + ' renders one language, not translated text plus a fixed English subtitle', async () => {
    const template = (await read(path)).split('</template>')[0].replace(/<!--[\s\S]*?-->/g, '')
    assert.equal(/Full Head Spa|treatment-name-en|\((?:Treatment Type|treatment\s+type|Number of Guests|Book Together|Duration|Date|Time)\)/.test(template), false, 'remove fixed English subtitles')
  })
}

test('booking dates use a compact English label without changing the booking value', () => {
  const session = localeSession('en')
  assert.equal(typeof session.bookingDate, 'function')
  assert.equal(session.bookingDate('2026-11-16', '11月16日'), 'Nov 16')
  assert.equal(session.bookingDate('2026-01-02', '1月2日'), 'Jan 2')
  assert.equal(session.bookingDate(null, 'Not available'), 'Not available')
  assert.equal(session.bookingDate('2026-13-01', 'Unknown date'), 'Unknown date')
  session.setLocale('zh')
  assert.equal(session.bookingDate('2026-11-16', '11月16日'), '11月16日')
})

test('order service filters translate known names and preserve unknown products', async () => {
  const session = localeSession('en')
  const context = vm.createContext({
    t: session.t,
    cookie: { getProjectList: () => [{ projectList: [{ id: 1, title: '头部水疗' }, { id: 2, title: 'Custom service' }] }] },
    constant: {},
  })
  const source = (await read('filters/index.js')).replace(/^import .+$/gm, '').replace(/export default[\s\S]*/, '').replace(/\bexport /g, '')
  vm.runInContext(source, context)
  assert.equal(context.projectTitleFilter(1), 'Full Hair Spa')
  assert.equal(context.projectTitleFilter(2), 'Custom service')
  session.setLocale('zh')
  assert.equal(context.projectTitleFilter(1), '头部水疗')
})

test('all routed page roots select the language layout', async () => {
  const pages = JSON.parse((await read('pages.json')).replace(/\/\*[\s\S]*?\*\//g, ''))
  const missing = []
  for (const page of pages.pages) {
    const template = (await read(page.path + '.vue')).split('</template>')[0]
    if (!template.includes('localeClass()')) missing.push(page.path)
  }
  assert.deepEqual(missing, [])
})

test('English copy carries no HTML spacing entities', () => {
  const dirty = Object.entries(dict)
    .filter(([, value]) => /&[a-z]+;|\u00a0/.test(value))
    .map(([key, value]) => key + ' => ' + value)
  assert.deepEqual(dirty, [], 'write plain spaces in English values instead of &nbsp;')

  const doubleSpaced = Object.entries(dict)
    .filter(([, value]) => /  /.test(value))
    .map(([key, value]) => key + ' => ' + value)
  assert.deepEqual(doubleSpaced, [], 'collapse runs of spaces in English values')
})

test('spacing-padded source strings still render clean English and keep the Chinese source intact', () => {
  const session = localeSession('en')
  assert.equal(session.t('预约人数 &nbsp;'), 'Guests')
  assert.equal(session.t('到店日期 &nbsp;'), 'Visit date')
  assert.equal(session.t('预约疗愈师&nbsp;&nbsp;'), 'Therapist')
  assert.equal(session.t('&nbsp;去使用&nbsp;'), 'Use')
  assert.equal(session.t('元&nbsp;'), ' CNY')

  const padded = Object.keys(dict).filter(key => key.includes('&nbsp;'))
  assert.ok(padded.length > 0, 'padded keys still mirror the Chinese templates')
  for (const key of padded) {
    assert.match(session.t(key), /^[^&]*$/, key + ' must not leak an entity into English')
  }

  session.setLocale('zh')
  assert.equal(session.t('预约人数 &nbsp;'), '预约人数 &nbsp;', 'Chinese layout keeps its original spacing')
})

test('unknown values pass through untouched, entity padding included', () => {
  const session = localeSession('en')
  assert.equal(session.t('&nbsp;&nbsp;卢新'), '&nbsp;&nbsp;卢新')
})

/**
 * 门店名、地址、疗愈师名是业务数据：后台没填英文时按约定回退中文，不进词典。
 * 这些 key 出现在模板里只是为了让中文原文有一个统一的取词入口。
 */
const BUSINESS_DATA_KEYS = new Set([
  'Full愈 上海静安大悦城店',
  '上海市静安区共和新路134号&nbsp;',
  '&nbsp;&nbsp;卢新'
])

/** 扫出源码里的 t() / tt() 调用及其原始实参，跳过字符串内容，用于校验取词契约。 */
function localeCalls(source) {
  const calls = []
  const re = /(?<![\w.$])(tt?)\(/g
  let match
  while ((match = re.exec(source))) {
    let depth = 1
    let index = re.lastIndex
    let start = index
    let quote = null
    const args = []
    for (; index < source.length && depth > 0; index++) {
      const char = source[index]
      if (quote) {
        if (char === '\\') index++
        else if (char === quote) quote = null
        continue
      }
      if (char === "'" || char === '"' || char === '`') quote = char
      else if (char === '(') depth++
      else if (char === ')') depth--
      else if (char === ',' && depth === 1) {
        args.push(source.slice(start, index).trim())
        start = index + 1
      }
    }
    args.push(source.slice(start, index - 1).trim())
    calls.push({ name: match[1], args })
    re.lastIndex = index
  }
  return calls
}

async function uiSources() {
  const files = ['App.vue', 'main.js']
  for (const dir of ['pages', 'components', 'utils']) {
    for (const entry of await readdir(new URL('../' + dir, import.meta.url), { recursive: true })) {
      if (/\.(vue|js)$/.test(entry) && !entry.includes('副本') && !entry.endsWith('i18n.dict.js')) {
        files.push(dir + '/' + entry)
      }
    }
  }
  const sources = []
  for (const file of files) {
    const source = (await read(file))
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    sources.push({ file, calls: localeCalls(source) })
  }
  return sources
}

test('every t() key written in UI code exists in the dictionary', async () => {
  const missing = []
  for (const { file, calls } of await uiSources()) {
    for (const { name, args } of calls) {
      if (name !== 't' || args.length !== 1) continue
      const literal = /^'((?:[^'\\]|\\.)*)'$/.exec(args[0])
      const key = literal && literal[1]
      if (!key || !/[\u4e00-\u9fa5]/.test(key) || BUSINESS_DATA_KEYS.has(key)) continue
      if (!Object.prototype.hasOwnProperty.call(dict, key)) missing.push(file + ': ' + key)
    }
  }
  assert.deepEqual(missing, [], 'add these keys to utils/i18n.dict.js, or wrap the copy in tt(zh, en)')
})

test('every tt() call carries a real English branch instead of falling back to Chinese', async () => {
  const problems = []
  for (const { file, calls } of await uiSources()) {
    for (const { name, args } of calls) {
      if (name !== 'tt') continue
      if (args.length !== 2) {
        problems.push(file + ': tt() needs both zh and en, got ' + args.length + ' argument(s)')
        continue
      }
      if (!args[1] || /^''$/.test(args[1])) problems.push(file + ': tt(' + args[0] + ') has no English')
      else if (/[\u4e00-\u9fa5]/.test(args[1])) problems.push(file + ': tt(..., ' + args[1] + ') still has Chinese')
    }
  }
  assert.deepEqual(problems, [])
})

test('template text nodes keep Chinese out of the English pass-through', async () => {
  // 只有语言切换按钮里的「中」是故意保留的：语言名用自己的文字标识。
  const allowed = new Set(['中'])
  const leaks = []
  for (const { file } of await uiSources()) {
    if (!file.endsWith('.vue')) continue
    const source = await read(file)
    const start = source.indexOf('<template>')
    const end = source.lastIndexOf('</template>')
    if (start === -1 || end === -1) continue
    const template = source.slice(start, end)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/<[^>]*>/g, '\n')
    for (const line of template.split('\n')) {
      const text = line.trim()
      if (text && /[\u4e00-\u9fa5]/.test(text) && !allowed.has(text)) leaks.push(file + ': ' + text.slice(0, 60))
    }
  }
  assert.deepEqual(leaks, [], 'wrap the copy in t()/tt() instead of hardcoding Chinese')
})

test('模板里的 &nbsp; 被编译成 NBSP 后仍能命中词典（预约页四个标题）', () => {
  const session = localeSession('en')
  // Vue/小程序模板会把 `&nbsp;` 还原成 U+00A0 再交给 JS，key 就与词典字面量对不上，
  // 曾导致英文模式下"预约人数/放松时长/到店日期/到店时间"四个标题漏出中文。
  assert.equal(session.t('预约人数\u00a0'), 'Guests')
  assert.equal(session.t('放松时长\u00a0'), 'Duration')
  assert.equal(session.t('到店日期\u00a0'), 'Visit date')
  assert.equal(session.t('到店时间\u00a0'), 'Visit time')
  for (const key of Object.keys(dict)) {
    if (!key.includes('&nbsp;')) continue
    const nbsp = key.replace(/&nbsp;/g, '\u00a0')
    assert.notEqual(session.t(nbsp), nbsp, 'NBSP 形式未命中词典: ' + key)
  }
})

test('订单页标签在渲染期取词，切回中文不会卡在英文', async () => {
  const source = (await read('pages/user/order/order.vue')).replace(/\/\*[\s\S]*?\*\//g, '')
  // name 必须在 setup 里存中文原文，预翻译会让页面缓存挂载时的语言
  assert.ok(!/name:\s*t\(/.test(source), 'tabs 的 name 不能在 setup 阶段预翻译')
  assert.match(source, /\{\{\s*t\(tab\.name\)\s*\}\}/, '模板应按渲染期语言翻译标签')
})
