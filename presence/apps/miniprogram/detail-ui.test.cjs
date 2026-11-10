const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { parse, compileScript, compileTemplate } = require('vue/compiler-sfc')
const read = page => fs.readFileSync(path.join(__dirname, 'src/pages', page, 'index.vue'), 'utf8')
const names = ['course', 'loading', 'loadError', 'canBook', 'loadDetail', 'handleBook', 'confirmBook', 'closeBooking', 'bookingVisible', 'currentQuote', 'slotDiscount', 'busy', 'pendingOrderId', 'handleWaitlist', 'confirmWaitlist', 'waitlistQuote', 'waitlistVisible', 'toYuan', 'syllabus', 'formatRefundTime', 'trainer', 'loadTrainer', 'reviewsError', 'load', 'stats', 'todaySchedule']
function mount(page = 'course-detail', overrides = {}) {
  const calls = { quote: 0, enroll: 0, pay: 0, waitQuote: 0, join: 0, workspace: 0, modals: [], tabs: [] }
  const course = { id: 'c1', title: '真实课程', status: 'PUBLISHED', startDate: '2099-12-20', startTime: '19:00', endTime: '20:00', currentEnrolled: 2, maxCapacity: 10, originalPrice: '16000', priceTiers: [], waitlistEnabled: true, trainer: { id: 't1', displayName: '真实导师' } }
  const quote = { courseId: 'c1', basePrice: 16000, priceAfterDiscount: 8850, discountAmount: 7150, isFull: false, memberCardType: 'MONTHLY', timeDiscount: { actionType: 'FIXED_BY_DURATION', fixedPrice: 88.5, ruleName: '午间规则' } }
  const store = { isLoggedIn: true, isTrainer: true, userInfo: { nickname: '老师' } }
  const api = {
    getCourseDetail: async () => course,
    quoteEnroll: async () => { calls.quote++; return quote },
    enrollCourse: async () => { calls.enroll++; return { orderId: 'o1', actualPaid: 8850, expireInSeconds: 600 } },
    payOrder: async () => { calls.pay++ },
    quoteWaitlist: async () => { calls.waitQuote++; return { courseId: 'c1', lockedPrice: 12345, seatType: 'MEMBER', position: 7, memberSeatsLeft: 0 } },
    joinWaitlist: async () => { calls.join++; return { orderId: 'w1', lockedPrice: 12345 } },
    getActiveCard: async () => null,
    getTrainer: async () => ({ id: 't1', displayName: '真实导师', stats: { totalStudents: 0, totalCourses: 0 }, upcomingCourses: [] }),
    getTrainerReviews: async () => ({ count: 0, avgRating: 0, reviews: [] }),
    getTrainerWorkspace: async () => { calls.workspace++; return { stats: { monthHours: 0, monthIncome: 0, rating: 0 }, todaySchedule: [], upcomingCourses: [], incomeRecords: [], checkin: { weekAttendanceRate: 0, weekAbsent: 0, weekStudents: 0 } } },
    ...overrides,
  }
  const { descriptor } = parse(read(page))
  const js = ts.transpileModule(descriptor.scriptSetup.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const ctx = {
    exports: {}, console, setTimeout, clearTimeout,
    getCurrentPages: () => [],
    uni: { showModal: o => calls.modals.push(o), showToast() {}, switchTab: o => calls.tabs.push(o.url), navigateBack() {}, navigateTo() {}, previewImage() {}, pageScrollTo() {} },
    require: id => id === 'vue' ? vue : id.includes('uni-app') ? { onLoad() {}, onShow() {} } : id.includes('stores/user') ? { useUserStore: () => store } : id.includes('locale') ? { t: key => key, tr: zh => zh, isEnglish: () => false } : id.includes('utils/capsule') ? { readCapsuleLayout: () => ({ statusBarHeight: 0, headerTop: 16, capsuleRight: 0, navBarHeight: 44, hasCapsule: false }) } : id.endsWith('.vue') ? {} : api,
  }
  const state = vm.runInNewContext(js + '\n;({' + names.map(n => `${n}:typeof ${n} === 'undefined' ? undefined : ${n}`).join(',') + '})', ctx)
  return { state, calls, course, quote, store }
}

test('三页使用品牌组件、白卡令牌与有效模板，不含旧色、负边距及伪造阶段', () => {
  for (const page of ['course-detail', 'trainer-home', 'trainer-workspace']) {
    const src = read(page)
    assert.doesNotMatch(src, /#584219|#EAE0D7|#3F2F10|#FBF8F3|#A78E70|margin[^;\n]*-\d+rpx|LV\{\{|薪资|时薪/i)
    assert.match(src, /PageState/)
    assert.match(src, /PresenceIcon/)
    assert.match(src, /var\(--c-card\)/)
    const { descriptor, errors } = parse(src)
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: page })
    const compiled = compileTemplate({ source: descriptor.template.content, filename: page + '.vue', id: page, compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(compiled.errors, [])
  }
  const detail = read('course-detail')
  assert.match(detail, /BottomSheet/)
  assert.match(detail, /BrandCover/)
  assert.doesNotMatch(detail, /trainerSeeds|memberSeatsLeft.*total - 1|waitlistDeadline =|getUserPrice\(\) \}\}/)
  assert.match(detail, /seedsReward/)
  assert.ok(read('trainer-workspace').indexOf('今日课程') < read('trainer-workspace').indexOf('本月概览'))
})

test('星级图标不向隔离的SVG图片传入页面CSS变量', () => {
  assert.doesNotMatch(read('trainer-home'), /<PresenceIcon[^>]*:color=.*var\(--/)
})

test('详情未加载或失败时不可报名，失败可重新加载', async () => {
  const { state: s } = mount('course-detail', { getCourseDetail: async () => { throw new Error('offline') } })
  assert.equal(s.canBook?.value, false)
  await s.handleBook()
  await s.loadDetail('c1')
  assert.equal(s.loadError.value, true)
  assert.equal(s.canBook.value, false)
})

test('确认弹层只展示真实询价，并发点击只询价一次，取消不下单', async () => {
  const { state: s, calls, quote } = mount()
  await s.loadDetail('c1')
  await Promise.all([s.handleBook(), s.handleBook()])
  assert.equal(calls.quote, 1)
  assert.equal(s.bookingVisible?.value, true)
  assert.equal(s.currentQuote.value.priceAfterDiscount, 8850)
  assert.equal(s.slotDiscount.value.fixedPrice, 88.5)
  assert.equal(s.toYuan(12345), '123.45')
  s.closeBooking()
  assert.equal(s.bookingVisible.value, false)
  assert.equal(calls.enroll, 0)
  assert.equal(quote.priceAfterDiscount, 8850)
})

test('确认报名防重复并保留 quote→enroll→pay 流程', async () => {
  const { state: s, calls } = mount()
  await s.loadDetail('c1'); await s.handleBook()
  assert.equal(typeof s.confirmBook, 'function')
  await Promise.all([s.confirmBook(), s.confirmBook()])
  assert.deepEqual([calls.quote, calls.enroll, calls.pay], [1, 1, 1])
  assert.equal(s.busy.value, false)
})

test('创建订单失败不误报支付失败', async () => {
  const { state: s, calls } = mount('course-detail', { enrollCourse: async () => { throw new Error('create failed') } })
  await s.loadDetail('c1'); await s.handleBook()
  assert.equal(typeof s.confirmBook, 'function')
  await s.confirmBook()
  assert.equal(calls.pay, 0)
  assert.equal(calls.modals.length, 0)
  assert.equal(s.busy.value, false)
})

test('支付失败保留订单，引导我的预约且不再重复下单', async () => {
  const { state: s, calls } = mount('course-detail', { payOrder: async () => { throw new Error('cancelled') } })
  await s.loadDetail('c1'); await s.handleBook()
  assert.equal(typeof s.confirmBook, 'function')
  await s.confirmBook()
  assert.equal(s.pendingOrderId.value, 'o1')
  assert.match(calls.modals[0].content, /我的预约/)
  calls.modals[0].success({ confirm: true })
  assert.equal(calls.tabs[0], '/pages/my-courses/index')
  await s.handleBook()
  assert.equal(calls.enroll, 1)
})

test('下单金额变动不静默支付新金额，转我的预约核对', async () => {
  const { state: s, calls } = mount('course-detail', { enrollCourse: async () => ({ orderId: 'o2', actualPaid: 9999 }) })
  await s.loadDetail('c1'); await s.handleBook()
  assert.equal(typeof s.confirmBook, 'function')
  await s.confirmBook()
  assert.equal(calls.pay, 0)
  assert.match(calls.modals[0].content, /99.99/)
})

test('询价显示满员时不允许确认普通报名', async () => {
  const { state: s, calls } = mount('course-detail', { quoteEnroll: async () => ({ courseId: 'c1', priceAfterDiscount: 10000, isFull: true }) })
  await s.loadDetail('c1'); await s.handleBook()
  assert.equal(s.bookingVisible?.value, false)
  assert.equal(calls.enroll, 0)
})

test('候补询价使用真实金额与席位，不假定排名；重复确认只创建一次', async () => {
  const { state: s, calls, course } = mount()
  course.currentEnrolled = 10
  await s.loadDetail('c1')
  await Promise.all([s.handleWaitlist(), s.handleWaitlist()])
  assert.equal(calls.waitQuote, 1)
  assert.equal(s.waitlistQuote.value.position, 7)
  assert.equal(s.waitlistQuote.value.memberSeatsLeft, 0)
  assert.equal(s.toYuan(s.waitlistQuote.value.lockedPrice), '123.45')
  await Promise.all([s.confirmWaitlist(), s.confirmWaitlist()])
  assert.equal(calls.join, 1)
  assert.equal(calls.pay, 1)
})

test('候补支付失败同样转我的预约', async () => {
  const { state: s, calls, course } = mount('course-detail', { payOrder: async () => { throw new Error('cancelled') } })
  course.currentEnrolled = 10
  await s.loadDetail('c1'); await s.handleWaitlist(); await s.confirmWaitlist()
  assert.match(calls.modals[0].content, /我的预约/)
})

test('真实系列大纲保留标题内容，不生成每节日期或奖励', async () => {
  const { state: s, course } = mount()
  course.type = 'SERIES'; course.syllabus = [{ title: '呼吸', content: '觉察呼吸' }]
  await s.loadDetail('c1')
  assert.equal(s.syllabus?.value[0].content, '觉察呼吸')
  assert.equal(s.syllabus.value[0].date, undefined)
  assert.equal(s.course.value.completionSeeds, undefined)
  assert.equal(s.formatRefundTime({ hoursFrom: 72, hoursTo: null }), '开课前72小时及以上')
})

test('导师加载真实零值统计，评价失败有独立状态，不补等级和头衔', async () => {
  const { state: s } = mount('trainer-home', { getTrainerReviews: async () => { throw new Error('offline') } })
  await s.loadTrainer('t1')
  assert.equal(s.trainer.value.level, undefined)
  assert.equal(s.trainer.value.title, undefined)
  assert.equal(s.trainer.value.stats.totalCourses, 0)
  assert.equal(s.reviewsError.value, true)
})

test('工作台未登录不请求，接口失败不展示虚假零值概览', async () => {
  const { state: s, store, calls } = mount('trainer-workspace')
  store.isLoggedIn = false
  await s.load()
  assert.equal(calls.workspace, 0)
  const bad = mount('trainer-workspace', { getTrainerWorkspace: async () => { throw new Error('offline') } })
  await bad.state.load()
  assert.equal(bad.state.loadError.value, true)
  assert.equal(bad.state.stats.value, null)
})
