#!/usr/bin/env node
/**
 * 在场小程序发布包门禁（2026-11-24 事故后新增）。
 *
 * 事故：QA 用 `build:mp-weixin:test` 打了包（编译期写死 test-presence），
 * 这个包被当成最新开发版提审发布，正式版用户全部读到测试库数据。
 *
 * 门禁标准：发布产物必须保留「运行时按 envVersion 二选一」的完整逻辑——
 *   - 同时包含生产与测试两个接口域名；
 *   - 包含 envVersion / getAccountInfoSync 运行时判定；
 *   - 不是被 VITE_API_BASE 注入成单一地址的测试包。
 *
 * 用法：
 *   node scripts/verify-mp-release.mjs                       # 校验 dist/build/mp-weixin
 *   node scripts/verify-mp-release.mjs <目录或 request.js>    # 校验指定产物
 * 退出码 1 = 该包不允许提审/发布。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PROD = 'https://presence.fullyu.cn/api/v1'
const TEST = 'https://test-presence.fullyu.cn/api/v1'

const input = resolve(process.argv[2] || 'dist/build/mp-weixin')
const target = existsSync(input) && statSync(input).isDirectory()
  ? join(input, 'utils/request.js')
  : input

function fail(lines) {
  console.error('\n[verify-mp-release] 拒绝：这不是可发布的生产包\n')
  for (const line of lines) console.error(`  - ${line}`)
  console.error(`
  原因：发布包必须由运行时判定环境（build:mp-weixin），不能是 build:mp-weixin:test 的测试包。
  正确做法：
    cd presence/apps/miniprogram
    pnpm build:mp-weixin          # 构建后会自动跑本门禁
  再用「我的小程序 → 开发版」上传，禁止上传 dist 里由 :test 脚本产出的包。
`)
  process.exit(1)
}

if (!existsSync(target)) {
  fail([`找不到产物：${target}`, '先执行 pnpm build:mp-weixin。'])
}

const code = readFileSync(target, 'utf8')
const missing = []
if (!code.includes(PROD)) missing.push(`缺少生产域名常量 ${PROD}`)
if (!code.includes(TEST)) missing.push(`缺少测试域名常量 ${TEST}`)
if (!code.includes('getAccountInfoSync')) missing.push('缺少 getAccountInfoSync 运行时判定')
if (!code.includes('envVersion')) missing.push('缺少 envVersion 运行时判定')
if (!code.includes('release')) missing.push('缺少 release 分支常量（envVersion=release 走生产）')

if (missing.length) fail(missing)

console.log(`[verify-mp-release] OK：${target}`)
console.log('  运行时双环境判定完整，release=生产 / trial·develop=测试')