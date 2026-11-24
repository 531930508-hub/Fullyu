/**
 * 小程序环境切换回归测试（2026-11-24 事故后新增）。
 *
 * 锁住三件事，防止后续改动把运行时切环境逻辑覆盖回「编译期写死测试地址」：
 *   1. request.ts 保留 envVersion 运行时判定，且 release=生产 先于 VITE_API_BASE 注入；
 *   2. 默认发布构建 build:mp-weixin 必须串上门禁脚本，不能只 build 不校验；
 *   3. 门禁脚本本身能识别「只有测试域名」的测试包并拒绝。
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = __dirname
const requestSource = fs.readFileSync(path.join(root, 'src/utils/request.ts'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const verifier = path.join(root, 'scripts/verify-mp-release.mjs')
const PROD = 'https://presence.fullyu.cn/api/v1'
const TEST = 'https://test-presence.fullyu.cn/api/v1'

function runVerifier(fixtureSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-release-check-'))
  const file = path.join(dir, 'request.js')
  fs.writeFileSync(file, fixtureSource)
  const result = spawnSync(process.execPath, [verifier, file], { encoding: 'utf8' })
  fs.rmSync(dir, { recursive: true, force: true })
  return result
}

test('request.ts 保留运行时 envVersion 双环境判定', () => {
  assert.ok(requestSource.includes(PROD), '缺少生产域名常量')
  assert.ok(requestSource.includes(TEST), '缺少测试域名常量')
  assert.ok(requestSource.includes('getAccountInfoSync'), '缺少微信环境读取')
  assert.ok(requestSource.includes('envVersion'), '缺少 envVersion 运行时判定')
})

test('正式版锁定生产：release 判断必须早于 VITE_API_BASE 注入', () => {
  const fnStart = requestSource.indexOf('function resolveBaseUrl')
  const fnEnd = requestSource.indexOf('\n}', fnStart)
  assert.ok(fnStart !== -1, '找不到 resolveBaseUrl')
  const fnBody = requestSource.slice(fnStart, fnEnd)
  const releaseCheck = fnBody.indexOf("ENV_VERSION === 'release'")
  const injection = fnBody.indexOf('VITE_API_BASE')
  assert.ok(releaseCheck !== -1, 'resolveBaseUrl 缺少 release 分支')
  assert.ok(injection !== -1, '缺少注入逻辑（本地联调仍需要）')
  assert.ok(releaseCheck < injection, 'release 分支被放到注入之后：测试构建包发布后会读测试库')
})

test('默认发布构建必须串联门禁脚本', () => {
  assert.match(pkg.scripts['build:mp-weixin'], /verify-mp-release\.mjs/)
  assert.ok(fs.existsSync(verifier), '门禁脚本不存在')
  assert.ok(pkg.scripts['verify:mp-release'], '缺少独立门禁命令 verify:mp-release')
})

test('门禁脚本：完整双环境包通过', () => {
  const compiled = [
    'const o=(()=>{try{return uni.getAccountInfoSync().miniProgram.envVersion||"develop"}',
    'catch(e){return"develop"}})();',
    `const base=()=>"release"===o?"${PROD}":"${TEST}";`,
  ].join('')
  const result = runVerifier(compiled)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /OK/)
})

test('门禁脚本：只写死测试地址的包必须拒绝', () => {
  const result = runVerifier(`const base="${TEST}";`)
  assert.equal(result.status, 1, '测试包被放行了')
  assert.match(result.stderr, /拒绝/)
  assert.match(result.stderr, /build:mp-weixin/)
})