const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('vue/compiler-sfc')
const root = path.join(__dirname, 'src')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')
const pages = JSON.parse(read('pages.json')).pages

test('全部15个页面保持有效Vue单文件组件结构', () => {
  assert.equal(pages.length, 15)
  for (const p of pages) {
    const source = read(p.path + '.vue')
    const result = parse(source)
    assert.deepEqual(result.errors, [], p.path)
    assert.ok(result.descriptor.template, p.path)
    assert.equal((source.match(/<template>/g) || []).length, 1, p.path)
  }
})
test('公共主题切换为在场深咖米白，组件不再沿用胶囊卡片', () => {
  const app = read('App.vue')
  assert.match(app, /--c-primary:\s*#683611/i)
  assert.match(app, /--c-cream:\s*#f5f6ed/i)
  assert.match(app, /--radius-card:\s*32rpx/)
  assert.doesNotMatch(app, /#584219|#EAE0D7|#3F2F10/i)
})
test('15个页面和导航均移除旧的硬编码主色', () => {
  for (const p of pages) assert.doesNotMatch(read(p.path + '.vue'), /#584219|#EAE0D7|#3F2F10|#FBF8F3|#A78E70/i, p.path)
  assert.doesNotMatch(read('components/FloatingTabBar.vue'), /#584219|#EAE0D7|#3F2F10/i)
})
test('导航和预约页统一命名，不再叫我的课程', () => {
  const config = JSON.parse(read('pages.json'))
  assert.equal(config.tabBar.list[1].text, '预约')
  const locale = read('locale/index.ts')
  assert.match(locale, /'tab.courses': '预约'/)
  assert.match(locale, /'myCourses.title': '我的预约'/)
})
test('首页采用在场标题，广告先于欢迎区和课程筛选', () => {
  const home = read('pages/index/index.vue').split('<script')[0]
  assert.match(home, /\/static\/brand\/presence-logo-zh\.png/)
  assert.match(home, /\/static\/brand\/presence-logo-en\.png/)
  assert.match(home, /tr\('在场', 'Presence'\)/)
  assert.ok(home.indexOf('banner-section') < home.indexOf('greeting-section'))
  assert.ok(home.indexOf('greeting-section') < home.indexOf('filter-panel'))
  assert.doesNotMatch(home, /ctype|courseTypeFilter|单次体验.*系列课程/)
})
test('预约展示错误与未登录状态，不将未知签到标成缺勤', () => {
  const bookings = read('pages/my-courses/index.vue')
  assert.match(bookings, /PageState/)
  assert.match(bookings, /loadError/)
  assert.doesNotMatch(bookings, /completed.*&&\s*!item.checkedIn/)
  assert.match(bookings, /remainingSeconds\(o\)\s*<=\s*0/)
  assert.ok(bookings.indexOf('pending-wrap') < bookings.indexOf('tab-bar'))
})
test('首页广告完整展示素材，课程数量不承诺全部仍可预约', () => {
  const home = read('pages/index/index.vue')
  assert.match(home, /<image[^>]+item\.imageUrl[^>]+mode="aspectFit"/)
  assert.doesNotMatch(home, /filteredCourses\.length\s*}}\s*场可选/)
})
test('语言在冷启动即从本地恢复，页面不持有过期快照', () => {
  const store = read('stores/user.ts')
  assert.match(store, /uni\.getStorageSync\('language'\)/)
  assert.match(store, /storedLanguage === 'en' \? 'en' : 'zh'/)
  for (const page of ['pages/index/index.vue', 'pages/profile/index.vue']) {
    const source = read(page)
    assert.match(source, /const language = computed\(\(\) => userStore\.language\)/, page)
    assert.doesNotMatch(source, /language\.value = userStore\.language/, page)
  }
})
test('请求层兜底错误与上传提示支持英文', () => {
  const request = read('utils/request.ts')
  assert.match(request, /uni\.getStorageSync\('language'\) === 'en'/)
  assert.match(request, /Request failed \(\$\{status\}\)/)
  assert.match(request, /Network error\. Please try again\./)
  assert.match(request, /Upload failed/)
})
test('返回按钮固定在安全区左上角且不再随内容滚动', () => {
  const back = read('components/FloatingBack.vue')
  assert.match(back, /position:\s*fixed/)
  assert.match(back, /readCapsuleLayout/)
  assert.match(back, /top:\s*topOffset \+ 'px'/)
  assert.match(back, /left:\s*32rpx/)
  assert.match(back, /tr\('返回', 'Back'\)/)
})
test('固定社群标签在英文模式下翻译', () => {
  const labels = read('utils/community-labels.ts')
  assert.match(labels, /SDG 3 Good health/)
  assert.match(labels, /Mind-body healing/)
  for (const page of ['pages/community-create/index.vue', 'pages/community-list/index.vue', 'pages/community-detail/index.vue']) {
    assert.match(read(page), /communityTagLabel/, page)
  }
})
test('首页头部让开胶囊并支持城市选择后按城市场地筛选', () => {
  const home = read('pages/index/index.vue')
  assert.match(home, /getMenuButtonBoundingClientRect/)
  assert.match(home, /headerOffset/)
  assert.match(home, /presence_city/)
  assert.match(home, /cityVenueIds/)
  assert.match(home, /venueIds:/)
  assert.match(home, /BottomSheet/)
  for (const asset of ['presence-logo-zh.png', 'presence-logo-en.png']) {
    assert.ok(fs.existsSync(path.join(root, 'static/brand', asset)), asset)
  }
})
test('首页城市按钮无白底，场地数量有明确加载/失败状态', () => {
  const home = read('pages/index/index.vue')
  assert.match(home, /\.city-chip \{[^}]*background: transparent/)
  assert.doesNotMatch(home, /\.city-chip \{[^}]*background: var\(--c-card\)/)
  assert.match(home, /\.city-chip::after \{ border: 0; \}/)
  assert.match(home, /venuesLoading/)
  assert.match(home, /venuesError/)
  assert.doesNotMatch(home, /场地信息待加载/)
  assert.match(home, /正在读取场地/)
  assert.match(home, /场地信息暂不可用/)
})
test('所有自定义导航页面为微信胶囊预留顶部避让', () => {
  const back = read('components/FloatingBack.vue')
  assert.match(back, /readCapsuleLayout/)
  const pages = [
    'pages/assets/index.vue',
    'pages/my-reviews/index.vue',
    'pages/profile-edit/index.vue',
    'pages/trainer-workspace/index.vue',
    'pages/member/index.vue',
    'pages/profile/index.vue',
    'pages/my-courses/index.vue',
    'pages/community-list/index.vue',
    'pages/community-detail/index.vue',
    'pages/community-mine/index.vue',
    'pages/community-create/index.vue',
    'pages/community-workspace/index.vue',
  ]
  for (const page of pages) {
    const source = read(page)
    assert.match(source, /readCapsuleLayout/, page)
    assert.match(source, /headerTop/, page)
    assert.match(source, /statusBarHeight \+ 'px'/, page)
  }
})
test('图片压缩控制在 nginx 默认请求体以内并支持英文报错', () => {
  const image = read('utils/image.ts')
  assert.match(image, /MAX_UPLOAD_BYTES\s*=\s*900\s*\*\s*1024/)
  assert.match(image, /uni\.getStorageSync\('language'\) === 'en'/)
  assert.match(image, /Could not read the image/)
  assert.doesNotMatch(image, /new Error\('图片/)
})
