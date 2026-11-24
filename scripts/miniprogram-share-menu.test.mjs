import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const apps = [
  {
    name: '轻疗',
    dir: 'qingliao/apps/miniprogram',
    main: 'main.js',
    pages: 'pages.json',
    genericSource: 'utils/share.ts',
    image: 'static/share/share-card.jpg',
    defaultShare: 'defaultShareMessage',
    resolver: 'resolveShareMessage',
  },
  {
    name: '时叙',
    dir: 'shixu/apps/miniprogram/src',
    main: 'main.js',
    pages: 'pages.json',
    genericSource: 'main.js',
    image: 'static/tea.webp',
    defaultShare: '',
    resolver: '',
  },
  {
    name: '在场',
    dir: 'presence/apps/miniprogram/src',
    main: 'main.ts',
    pages: 'pages.json',
    genericSource: 'utils/share.ts',
    image: 'static/brand/share-card.png',
    defaultShare: 'brandShareMessage',
    resolver: 'resolveBrandShareMessage',
  },
]

const businessPages = [
  'qingliao/apps/miniprogram/pages/index/pay-success/appointment-success.vue',
  'qingliao/apps/miniprogram/pages/mall/buy-card/buy-card-success.vue',
  'qingliao/apps/miniprogram/pages/user/order/order.vue',
  'qingliao/apps/miniprogram/pages/user/invitation-reward.vue',
  'presence/apps/miniprogram/src/pages/course-detail/index.vue',
  'presence/apps/miniprogram/src/pages/community-detail/index.vue',
  'presence/apps/miniprogram/src/pages/community-event-detail/index.vue',
  'presence/apps/miniprogram/src/pages/brand-member/index.vue',
]

function source(relativePath) {
  const absolutePath = path.join(root, relativePath)
  assert.ok(existsSync(absolutePath), `缺少文件：${relativePath}`)
  return readFileSync(absolutePath, 'utf8')
}

function routedPages(app) {
  const pagesConfig = source(path.join(app.dir, app.pages))
  return [...pagesConfig.matchAll(/"path"\s*:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((route) => route.startsWith('pages/'))
    .map((route) => path.join(app.dir, `${route}.vue`))
    .sort()
}

for (const app of apps) {
  test(`${app.name}：应用入口注册全局好友与朋友圈分享`, () => {
    const main = source(path.join(app.dir, app.main))
    assert.match(main, /\bonShareAppMessage\s*\(/, '好友分享钩子未注册')
    assert.match(main, /\bonShareTimeline\s*\(/, '朋友圈分享钩子未注册')
    if (app.resolver) assert.ok(main.includes(app.resolver), `全局入口未使用 ${app.resolver}`)
  })

  test(`${app.name}：全局模板固定分享首页、品牌图与空朋友圈参数`, () => {
    const generic = source(path.join(app.dir, app.genericSource))
    assert.match(generic, /path\s*=\s*['"]\/pages\/index\/index['"]|path:\s*['"]\/pages\/index\/index['"]/)
    assert.match(generic, /query\s*=\s*['"]['"]|query:\s*['"]['"]/, '朋友圈 query 必须为空')
    assert.ok(generic.includes(app.image), `全局模板未使用 ${app.image}`)
    assert.ok(existsSync(path.join(root, app.dir, app.image)), `分享图不存在：${app.image}`)
  })

  test(`${app.name}：所有路由页不再各自注册朋友圈分享`, () => {
    const pages = routedPages(app)
    assert.ok(pages.length > 0, '未从 pages.json 读到路由')
    const overrides = pages.filter((page) => /\bonShareTimeline\s*\(/.test(source(page)))
    assert.deepEqual(overrides, [], '朋友圈分享应统一由应用入口提供')
  })
}

test('三端路由页不再各自注册好友或朋友圈分享', () => {
  const overrides = apps
    .flatMap((app) => routedPages(app))
    .filter((page) => /\bonShare(?:AppMessage|Timeline)\s*\(/.test(source(page)))
    .map((page) => path.relative(root, page))
    .sort()
  assert.deepEqual(overrides, [], '页面分享应统一由应用入口解析')
})

test('三端仅保留已确认的 8 个业务页好友分享处理器', () => {
  const actual = apps
    .flatMap((app) => routedPages(app))
    .filter((page) => /\bregisterShareHandler\s*\(/.test(source(page)))
    .map((page) => path.relative(root, page))
    .sort()
  assert.deepEqual(actual, [...businessPages].sort())
})

test('业务页在读取按钮数据或触发后端前先返回菜单统一模板', () => {
  for (const page of businessPages) {
    const app = apps.find((candidate) => page.startsWith(candidate.dir))
    assert.ok(app, `无法识别业务页所属应用：${page}`)
    if (!app.defaultShare) continue
    const content = source(page)
    assert.match(content, /\bregisterShareHandler\s*\(/, `${page} 未注册业务分享处理器`)
    const guard = content.match(
      new RegExp(`if\\s*\\(\\s*res\\??\\.from\\s*!==\\s*['"]button['"]\\s*\\)\\s*return\\s+${app.defaultShare}\\(\\)`),
    )
    assert.ok(guard, `${page} 缺少非按钮分享分流`)
    const riskyAccess = content.search(/res\??\.target\??\.dataset|shareFriend\s*\(/)
    if (riskyAccess >= 0) {
      assert.ok(guard.index < riskyAccess, `${page} 的菜单分流晚于按钮数据或后端调用`)
    }
  }
})
