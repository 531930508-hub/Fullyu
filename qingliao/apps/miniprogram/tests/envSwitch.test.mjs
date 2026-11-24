import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

// 环境切换回归（2026-11-24 三端统一门禁）：
// release=生产、生产构建忽略 VITE_API_BASE；发布构建必须串门禁；门禁会拒绝测试包。
const root = dirname(fileURLToPath(import.meta.url))
const repo = resolve(root, '../../../..')
const source = readFileSync(join(root, '../utils/appConfig.js'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, '../package.json'), 'utf8'))
const gate = join(repo, 'scripts/mp-release-gate.mjs')
const PROD = 'https://cityretreat.fullyu.cn/api'
const TEST = 'https://test-cityretreat.fullyu.cn/api'

function runGate(fixtureSource) {
  const dir = mkdtempSync(join(tmpdir(), 'mp-release-check-'))
  const file = join(dir, 'appConfig.js')
  writeFileSync(file, fixtureSource)
  const result = spawnSync(process.execPath, [gate, 'qingliao', file], {encoding: 'utf8'})
  rmSync(dir, {recursive: true, force: true})
  return result
}

function mpBlock() {
  const start = source.indexOf('function resolveApiBase')
  const end = source.indexOf('\n}', start)
  assert.ok(start !== -1 && end !== -1, '找不到 resolveApiBase')
  return source.slice(start, end)
}

test('appConfig.js 保留运行时 envVersion 双环境判定', () => {
  assert.ok(source.includes(PROD), '缺少生产域名常量')
  assert.ok(source.includes(TEST), '缺少测试域名常量')
  assert.ok(source.includes('getAccountInfoSync'), '缺少微信环境读取')
  assert.ok(source.includes('envVersion'), '缺少 envVersion 运行时判定')
})

test('release 走生产，且仅 dev 构建允许 VITE_API_BASE 注入', () => {
  const block = mpBlock()
  assert.match(block, /if \(IS_DEV_BUILD && INJECTED_API_BASE\) return INJECTED_API_BASE/,
    'MP 分支的注入必须受 IS_DEV_BUILD 保护')
  assert.match(block, /return ENV_VERSION === 'release' \? PROD_API_BASE : TEST_API_BASE/,
    'MP 分支缺少 release → 生产 判定')
})

test('默认发布构建必须串联三端门禁脚本', () => {
  assert.match(pkg.scripts['build:mp'], /mp-release-gate\.mjs qingliao/)
  assert.ok(pkg.scripts['verify:mp-release'], '缺少 verify:mp-release')
})

test('门禁脚本：完整双环境包通过', () => {
  const compiled = [
    'const o=(()=>{try{return wx.getAccountInfoSync().miniProgram.envVersion||"develop"}',
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
  assert.match(result.stderr, /build:mp/)
})