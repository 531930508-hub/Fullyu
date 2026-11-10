const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { parse, compileScript, compileTemplate } = require('vue/compiler-sfc')
const pages = ['community-list', 'community-detail', 'community-mine', 'community-create', 'community-workspace']
const read = name => fs.readFileSync(path.join(__dirname, 'src/pages', name, 'index.vue'), 'utf8')
const categories = ['全部', '疗愈', '瑜伽', '身心成长', '手作', '健身']
const community = (extra = {}) => ({ id: 'real-id', name: '真实社群', slogan: '一起练习', category: '疗愈', cover: '', owner: { name: '主理人', title: '', avatar: '' }, memberCount: 8, activeToday: 2, yearlyFee: 0, tags: [], description: '真实介绍', ...extra })
function mount(name, overrides = {}, token = 'token') {
  const hooks = { load: [], show: [], unload: [] }
  const calls = { toast: [], navigate: [], submit: [], join: [] }
  const api = {
    COMMUNITY_CATEGORIES: categories,
    // Only to execute the pre-v2 source for the initial red run.
    LEVEL_REWARDS: [], POINTS_USES: [], LEADERBOARD: [], WORKSPACE_STATS: {},
    fetchCommunities: async () => [], fetchMine: async () => ({ joined: [], managed: [] }),
    fetchCommunity: async () => community(), fetchMembership: async () => ({ joined: false, managed: false }),
    fetchPosts: async () => [], fetchEvents: async () => [], fetchMembers: async () => [],
    submitCommunity: async body => { calls.submit.push(body); return { id: 'created', status: 'PENDING' } },
    joinCommunity: async id => { calls.join.push(id); return { joined: true } },
    submitPost: async () => ({ success: true }),
    ...overrides,
  }
  const script = parse(read(name)).descriptor.scriptSetup.content
  const ast = ts.createSourceFile('page.ts', script, ts.ScriptTarget.Latest, true)
  const names = []
  for (const node of ast.statements) {
    if (ts.isVariableStatement(node)) for (const d of node.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text)
    if (ts.isFunctionDeclaration(node) && node.name) names.push(node.name.text)
  }
  const context = {
    exports: {}, console, setTimeout, clearTimeout,
    uni: {
      getSystemInfoSync: () => ({ statusBarHeight: 20 }), getStorageSync: key => key === 'token' ? token : {},
      showToast: data => calls.toast.push(data), navigateTo: data => calls.navigate.push(data),
      switchTab: data => calls.navigate.push(data), navigateBack: () => {}, pageScrollTo: () => {},
      previewImage: () => {},
    },
    require: id => {
      if (id === 'vue') return vue
      if (id === '@dcloudio/uni-app') return { onLoad: fn => hooks.load.push(fn), onShow: fn => hooks.show.push(fn), onUnload: fn => hooks.unload.push(fn) }
      if (id === '@/api/skool') return api
      if (id.includes('locale')) return { t: key => key, tr: zh => zh, isEnglish: () => false }
      if (id.includes('utils/capsule')) return { readCapsuleLayout: () => ({ statusBarHeight: 0, headerTop: 16, capsuleRight: 0, navBarHeight: 44, hasCapsule: false }) }
      if (id.includes('utils/wechat')) return { payOrder: async () => {} }
      if (id.endsWith('.vue')) return {}
      throw new Error(`Unexpected import ${id}`)
    },
  }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(script + `\nglobalThis.__page = { ${names.join(',')} };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
  return { page: context.__page, calls, hooks, api }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('SVG图片图标传具体颜色，不能把页面CSS变量传入独立SVG', () => {
  for (const name of pages) assert.doesNotMatch(read(name), /<PresenceIcon[^>]*color="var\(/, name)
})

test('加入成功后无效详情刷新不覆盖现有真实内容', async () => {
  const h = mount('community-detail', { fetchCommunity: async () => null })
  h.page.community.value = community(); h.page.communityId.value = 'real-id'
  await h.page.confirmJoin()
  assert.equal(h.page.community.value?.id, 'real-id')
  assert.equal(h.page.joined.value, true)
})

test('5页采用v2公共状态/封面/令牌，Vue脚本模板均可编译', () => {
  for (const name of pages) {
    const source = read(name)
    const { descriptor, errors } = parse(source)
    assert.deepEqual(errors, [], name)
    const script = compileScript(descriptor, { id: name })
    const compiled = compileTemplate({ id: name, filename: name + '.vue', source: descriptor.template.content, compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(compiled.errors, [], name)
    assert.match(source, /PageState/, name)
    assert.match(source, /BrandCover/, name)
    assert.match(source, /safe-area-inset-bottom/, name)
    assert.doesNotMatch(source, /#584219|#EAE0D7|#3F2F10|#FBF8F3|#A78E70|WORKSPACE_STATS|LEADERBOARD|DAILY_QUIZ|CHECKIN|CHALLENGE|Math\.random|randomuser\.me/i, name)
    assert.doesNotMatch(source, /margin(?:-top)?:\s*-\d/, name)
  }
})

test('广场搜索/分类/排序传真实API，失败与空结果分开', async () => {
  let args
  const h = mount('community-list', { fetchCommunities: async (...input) => { args = input; return [] } })
  const p = h.page
  assert.ok(p.loadError, '有独立请求错误状态')
  p.keyword.value = '  呼吸  '
  p.currentCat.value = '疗愈'
  p.currentSort.value = 'hot'
  await p.load()
  assert.deepEqual(args, ['疗愈', '呼吸', 'hot'])
  assert.equal(p.loadError.value, '')
  h.api.fetchCommunities = async () => { throw Error('offline') }
  await p.load()
  assert.ok(p.loadError.value)
  h.api.fetchCommunities = async () => []
  await p.clearSearch()
  assert.equal(p.keyword.value, '')
  assert.equal(p.currentCat.value, '全部')
})

test('广场并发筛选只保留最后一次结果', async () => {
  const h = mount('community-list')
  assert.ok(h.page.loadError, '新请求生命周期已实现')
  await flush()
  const pending = []
  h.api.fetchCommunities = () => new Promise(resolve => pending.push(resolve))
  const first = h.page.load()
  const second = h.page.load()
  pending[1]([community({ id: 'new' })]); await second
  pending[0]([community({ id: 'old' })]); await first
  assert.equal(h.page.communities.value[0].id, 'new')
})

test('详情仅3Tab，近期活动跨月排序，历史活动可查看', () => {
  const p = mount('community-detail').page
  assert.deepEqual(Array.from(p.tabs.value, t => t.key), ['feed', 'events', 'members'])
  p.events.value = [
    { id: 'late', date: '2099-02-01', time: '09:00' },
    { id: 'early', date: '2099-01-01', time: '10:00' },
    { id: 'past', date: '2000-01-01', time: '10:00' },
  ]
  assert.equal(p.eventScope.value, 'upcoming')
  assert.deepEqual(Array.from(p.visibleEvents.value, e => e.id), ['early', 'late'])
  p.eventScope.value = 'past'
  assert.deepEqual(Array.from(p.visibleEvents.value, e => e.id), ['past'])
})

test('无courseId不能导航或模拟活动报名', () => {
  const h = mount('community-detail')
  h.page.goCourse({ courseId: '', joined: 2, capacity: 10 })
  assert.equal(h.calls.navigate.length, 0)
  h.page.goCourse({ courseId: 'course/real' })
  assert.equal(h.calls.navigate[0].url, '/pages/course-detail/index?id=course%2Freal')
  assert.doesNotMatch(read('community-detail'), /ev\.joined\s*\+=|post\.liked\s*=/)
})

test('付费加入API拒绝或joined:false时不能展示加入成功', async () => {
  const h = mount('community-detail', { joinCommunity: async () => ({ joined: false }) })
  const p = h.page
  assert.equal(typeof p.confirmJoin, 'function')
  p.community.value = community({ yearlyFee: 29900 }); p.communityId.value = 'real-id'
  await p.confirmJoin()
  assert.equal(p.joined.value, false)
  assert.ok(p.joinError.value)
  assert.equal(p.community.value.memberCount, 8)
  assert.ok(!h.calls.toast.some(x => /成功|已加入/.test(x.title)))
  h.api.joinCommunity = async () => { throw Error('尚未接入支付') }
  await p.confirmJoin()
  assert.equal(p.joined.value, false)
  assert.equal(p.joinBusy.value, false)
})

test('加入只采用API布尔结果，重复提交被拦截', async () => {
  let resolve, count = 0
  const h = mount('community-detail', { joinCommunity: () => { count++; return new Promise(r => { resolve = r }) } })
  const p = h.page
  assert.equal(typeof p.confirmJoin, 'function')
  p.community.value = community(); p.communityId.value = 'real-id'
  const first = p.confirmJoin(); await p.confirmJoin()
  assert.equal(count, 1)
  resolve({ joined: true }); await first
  assert.equal(p.joined.value, true)
})

test('发帖失败保留正文，明确success:true才关闭编辑器', async () => {
  const h = mount('community-detail', { submitPost: async () => ({ success: false }) })
  const p = h.page
  assert.ok(p.postError, '发帖有独立错误状态')
  p.communityId.value = 'real-id'; p.joined.value = true
  p.composeText.value = '真实感受'; p.composeVisible.value = true
  await p.onSubmitPost()
  assert.equal(p.composeVisible.value, true)
  assert.equal(p.composeText.value, '真实感受')
  h.api.submitPost = async () => ({ success: true })
  await p.onSubmitPost()
  assert.equal(p.composeVisible.value, false)
  assert.equal(p.composeText.value, '')
})

test('我的社群分段区分加入/管理，游客不请求API，失败不作空态', async () => {
  let count = 0
  const guest = mount('community-mine', { fetchMine: async () => { count++; return {} } }, '')
  assert.ok(guest.page.currentSegment)
  await guest.page.load()
  assert.equal(guest.page.guest.value, true)
  assert.equal(count, 0)
  const h = mount('community-mine', { fetchMine: async () => ({ joined: [community()], managed: [community({ id: 'own' })] }) })
  await h.page.load()
  assert.equal(h.page.visibleCommunities.value[0].id, 'real-id')
  h.page.currentSegment.value = 'managed'
  assert.equal(h.page.visibleCommunities.value[0].id, 'own')
  h.api.fetchMine = async () => { throw Error('offline') }
  await h.page.load()
  assert.ok(h.page.loadError.value)
})

test('创建分3步校验，付费必须为有效的元金额', () => {
  const p = mount('community-create').page
  assert.ok(p.step, '已拆分步骤')
  assert.equal(p.step.value, 1)
  p.nextStep(); assert.equal(p.step.value, 1)
  p.form.value.name = '夜读'; p.form.value.slogan = '睡前共读'
  p.nextStep(); assert.equal(p.step.value, 2)
  p.form.value.feeMode = 'paid'
  for (const fee of ['', '0', '-1', 'Infinity', '1.001', 'abc']) {
    p.form.value.feeYuan = fee; p.nextStep(); assert.equal(p.step.value, 2, fee)
  }
  p.form.value.feeYuan = '299.99'; p.nextStep(); assert.equal(p.step.value, 3)
  p.previousStep(); assert.equal(p.step.value, 2)
  assert.equal(p.form.value.name, '夜读')
})

test('创建提交仅支持字段，金额元转分，API成功才显示成功', async () => {
  const h = mount('community-create', { submitCommunity: async () => { throw Error('offline') } })
  const p = h.page
  assert.ok(p.submitted, '使用真实提交结果状态')
  p.form.value.name = ' 夜读 '; p.form.value.slogan = ' 睡前共读 '; p.form.value.description = ' 介绍 '
  p.form.value.feeMode = 'paid'; p.form.value.feeYuan = '299.99'; p.step.value = 3
  await p.onSubmit()
  assert.equal(p.submitted.value, false); assert.ok(p.submitError.value)
  let payload
  h.api.submitCommunity = async body => { payload = body; return { id: 'created', status: 'PENDING' } }
  await p.onSubmit()
  assert.equal(p.submitted.value, true)
  assert.equal(payload.yearlyFee, 29999)
  assert.equal(payload.name, '夜读')
  assert.deepEqual(Object.keys(payload).sort(), ['category', 'description', 'name', 'slogan', 'tags', 'yearlyFee'])
})

test('创建缺少有效回执不报成功，重复提交只发一次', async () => {
  let count = 0, resolve
  const h = mount('community-create', { submitCommunity: () => { count++; return new Promise(r => { resolve = r }) } })
  const p = h.page
  assert.ok(p.submitted)
  p.form.value.name = '夜读'; p.form.value.slogan = '共读'; p.step.value = 3
  const first = p.onSubmit(); await p.onSubmit(); assert.equal(count, 1)
  resolve({}); await first
  assert.equal(p.submitted.value, false)
  assert.ok(p.submitError.value)
})

test('工作台先核验管理权限，无权限不查询管理数据', async () => {
  let count = 0
  const h = mount('community-workspace', { fetchCommunity: async () => { count++; return community() } })
  assert.equal(typeof h.page.load, 'function')
  h.page.communityId.value = 'real-id'
  await h.page.load()
  assert.equal(h.page.forbidden.value, true)
  assert.equal(count, 0)
})

test('工作台统计来自真实社群/活动/动态，缺失接口不能显示收入和奖励', async () => {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const h = mount('community-workspace', {
    fetchMembership: async () => ({ joined: true, managed: true }),
    fetchCommunity: async () => community({ memberCount: 17, activeToday: 4 }),
    fetchEvents: async () => [{ id: 'month', date, time: '09:00' }, { id: 'old', date: '2000-01-01', time: '09:00' }],
    fetchPosts: async () => [{ id: 'published', time: date + 'T10:00:00' }],
    fetchMembers: async () => [{ id: 'm', name: '真实成员', joinedAt: date }],
  })
  assert.equal(typeof h.page.load, 'function')
  h.page.communityId.value = 'real-id'; await h.page.load()
  assert.equal(h.page.stats.value.memberCount, 17)
  assert.equal(h.page.stats.value.activeToday, 4)
  assert.equal(h.page.stats.value.monthEvents, 1)
  assert.equal(h.page.stats.value.monthPosts, 1)
  assert.equal(h.page.recentMembers.value[0].name, '真实成员')
  assert.doesNotMatch(read('community-workspace'), /monthRevenue|seedCustomers|CDIFY_BENEFITS|已向.*发送欢迎/)
})

test('工作台待开始活动排除今天已开始场次', () => {
  const p = mount('community-workspace').page
  assert.ok(p.currentMoment, '按当前时刻而不是仅按日期统计待开始')
  p.currentMoment.value = '2026-10-21 15:00'
  p.events.value = [
    { id: 'past-today', date: '2026-10-21', time: '09:00' },
    { id: 'next', date: '2026-10-21', time: '18:00' },
    { id: 'tomorrow', date: '2026-10-22', time: '09:00' },
  ]
  assert.deepEqual(Array.from(p.upcomingEvents.value, e => e.id), ['next', 'tomorrow'])
})

test('工作台局部接口失败不伪装为零活动或零动态', async () => {
  const h = mount('community-workspace', {
    fetchMembership: async () => ({ joined: true, managed: true }),
    fetchEvents: async () => { throw Error('offline') },
    fetchPosts: async () => { throw Error('offline') },
  })
  h.page.communityId.value = 'real-id'; await h.page.load()
  assert.equal(h.page.loadError.value, '')
  assert.ok(h.page.dataErrors.value.events)
  assert.ok(h.page.dataErrors.value.posts)
  assert.match(read('community-workspace'), /dataErrors\.events \? '—'/)
  assert.match(read('community-workspace'), /dataErrors\.posts \? '—'/)
})

test('工作台发帖使用实际接口，不将待审核内容计入公开动态', async () => {
  let content
  const h = mount('community-workspace', { submitPost: async (_id, text) => { content = text; return { success: true } } })
  h.page.communityId.value = 'real-id'; h.page.canManage.value = true
  h.page.composeText.value = '  练习提醒  '; h.page.composeVisible.value = true
  await h.page.onSubmitPost()
  assert.equal(content, '练习提醒')
  assert.equal(h.page.composeVisible.value, false)
  assert.equal(h.page.stats.value.monthPosts, 0)
})

test('详情局部接口失败可单独重试，游客不请求会员关系', async () => {
  let count = 0
  const h = mount('community-detail', {
    fetchMembership: async () => { count++; return { joined: false, managed: false } },
    fetchPosts: async () => { throw Error('offline') },
  }, '')
  h.page.communityId.value = 'real-id'; await h.page.load()
  assert.equal(count, 0)
  assert.equal(h.page.loadError.value, '')
  assert.ok(h.page.sectionErrors.value.feed)
  assert.equal(h.page.sectionErrors.value.events, '')
  h.api.fetchPosts = async () => []
  await h.page.loadSection('feed')
  assert.equal(h.page.sectionErrors.value.feed, '')
})
