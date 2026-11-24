/**
 * 时叙小程序环境切换回归测试（2026-11-24 三端统一门禁）。
 *
 * 锁住：release=生产且生产构建忽略 VITE_API_BASE；发布构建必须串门禁；门禁会拒绝测试包。
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = __dirname
const repo = path.resolve(root, '../../..')
const source = fs.readFileSync(path.join(root, 'src/api/request.js'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const gate = path.join(repo, 'scripts/mp-release-gate.mjs')
const PROD = 'https://teahour.fullyu.cn/api'
const TEST = 'https://test-teahour.fullyu.cn/api'

function runGate(fixtureSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-release-check-'))
  const file = path.join(dir, 'request.js')
  fs.writeFileSync(file, fixtureSource)
  const result = spawnSync(process.execPath, [gate, 'shixu', file], { encoding: 'utf8' })
  fs.rmSync(dir, { recursive: true, force: true })
  return result
}

test('request.js 保留运行时 envVersion 双环境判定', () => {
  assert.ok(source.includes(PROD), '缺少生产域名常量')
  assert.ok(source.includes(TEST), '缺少测试域名常量')
  assert.ok(source.includes('getAccountInfoSync'), '缺少微信环境读取')
  assert.ok(source.includes('envVersion'), '缺少 envVersion 运行时判定')
})

test('正式版锁定生产，生产构建忽略注入，dev 构建才允许注入', () => {
  assert.match(
    source,
    /import\.meta\.env\.PROD\s*\n\s*\? ENV_VERSION === 'release' \? PROD_API_BASE : TEST_API_BASE\s*\n\s*: INJECTED_BASE \|\| DEV_API_BASE/,
    'PROD 构建必须是 envVersion 二选一，VITE_API_BASE 只能落到 dev 分支'
  )
  assert.ok(source.indexOf("ENV_VERSION === 'release'") !== -1, '缺少 release 分支')
})

test('默认发布构建必须串联三端门禁脚本', () => {
  assert.match(pkg.scripts['build:mp-weixin'], /mp-release-gate\.mjs shixu/)
  assert.ok(fs.existsSync(gate), '门禁脚本不存在')
  assert.match(pkg.scripts['verify:mp-release'], /mp-release-gate\.mjs shixu/)
})

test('门禁脚本：完整双环境包通过', () => {
  const compiled = [
    'const o=(()=>{try{return uni.getAccountInfoSync().miniProgram.envVersion||"develop"}',
    'catch(e){return"develop"}})();',
    `const base=()=>"release"===o?"${PROD}":"${TEST}";`,
  ].join('')
  const result = runGate(compiled)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /OK/)
})

test('门禁脚本：只写死测试地址的包必须拒绝', () => {
  const result = runGate(`const base="${TEST}";`)
  assert.equal(result.status, 1, '测试包被放行了')
  assert.match(result.stderr, /拒绝/)
  assert.match(result.stderr, /build:mp-weixin/)
})