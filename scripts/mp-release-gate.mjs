#!/usr/bin/env node
/**
 * 小程序发布包门禁（三端共用：在场 / 时叙 / 轻疗）。
 *
 * 2026-11-24 事故：在场用 `build:mp-weixin:test` 打包（编译期写死 test-presence），
 * 该包被当成最新开发版提审发布，正式版用户全部读到测试库数据。
 *
 * 规则（三端一致）：
 *   1. 生产构建（import.meta.env.PROD）不允许 VITE_API_BASE 改写接口地址；
 *      环境只由运行时 envVersion 决定：release=生产，trial/develop=测试；
 *   2. 发布产物必须同时保留生产/测试两个域名与 envVersion 判定，
 *      被注入成单一地址的测试包不允许提审/发布。
 *
 * 用法：
 *   node scripts/mp-release-gate.mjs presence
 *   node scripts/mp-release-gate.mjs shixu
 *   node scripts/mp-release-gate.mjs qingliao
 *   node scripts/mp-release-gate.mjs <project> <产物目录或入口文件>
 * 退出码 1 = 该包不允许提审/发布。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const PROJECTS = {
  presence: {
    label: '在场',
    prod: 'https://presence.fullyu.cn/api/v1',
    test: 'https://test-presence.fullyu.cn/api/v1',
    entry: 'apps/miniprogram/dist/build/mp-weixin/utils/request.js',
    build: 'pnpm --filter @fullyu/miniprogram build:mp-weixin',
  },
  shixu: {
    label: '时叙',
    prod: 'https://teahour.fullyu.cn/api',
    test: 'https://test-teahour.fullyu.cn/api',
    entry: 'apps/miniprogram/dist/build/mp-weixin/api/request.js',
    build: 'pnpm --filter @teahour/miniprogram build:mp-weixin',
  },
  qingliao: {
    label: '轻疗',
    prod: 'https://cityretreat.fullyu.cn/api',
    test: 'https://test-cityretreat.fullyu.cn/api',
    entry: 'apps/miniprogram/unpackage/dist/build/mp-weixin/utils/appConfig.js',
    build: 'cd qingliao/apps/miniprogram && pnpm build:mp',
  },
}

const projectKey = process.argv[2]
const project = PROJECTS[projectKey]

function fail(lines) {
  console.error('\n[mp-release-gate] 拒绝：这不是可发布的生产包\n')
  for (const line of lines) console.error(`  - ${line}`)
  if (project) {
    console.error(`
  原因：生产包必须由运行时 envVersion 选环境，且生产构建不得被 VITE_API_BASE 注入改写。
  正确做法：
    ${project.build}
  构建后会自动跑本门禁；测试包（:test 脚本或手工注入）不得上传、提审、发布。
`)
  }
  process.exit(1)
}

if (!project) fail([`未知项目：${projectKey || '(空)'}`, `可选：${Object.keys(PROJECTS).join(' / ')}`])

const argPath = process.argv[3]
const targetInput = argPath
  ? resolve(argPath)
  : join(REPO, projectKey, project.entry)
const target = existsSync(targetInput) && statSync(targetInput).isDirectory()
  ? join(targetInput, project.entry.split('/mp-weixin/')[1])
  : targetInput

if (!existsSync(target)) fail([`找不到产物：${target}`, `先执行 ${project.build}。`])

const code = readFileSync(target, 'utf8')
const missing = []
if (!code.includes(project.prod)) missing.push(`缺少生产域名常量 ${project.prod}`)
if (!code.includes(project.test)) missing.push(`缺少测试域名常量 ${project.test}`)
if (!code.includes('getAccountInfoSync')) missing.push('缺少 getAccountInfoSync 运行时判定')
if (!code.includes('envVersion')) missing.push('缺少 envVersion 运行时判定')
if (!code.includes('release')) missing.push('缺少 release 分支（envVersion=release 走生产）')

if (missing.length) fail(missing)

console.log(`[mp-release-gate] OK：${project.label} → ${target}`)
console.log('  运行时双环境判定完整，release=生产 / trial·develop=测试')