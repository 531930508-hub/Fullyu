#!/usr/bin/env node
// 管理端前端发布闸门（2026-11-20 起强制）
//
// 事故背景：11-20 13:53 与 14:25 两次生产 dist 分别从落后提交 / 非 main 的分支构建，
// 静默回退了「总助可见完整手机号」和「预约排班一键拨号」。人眼比对靠不住，改成脚本断言。
//
// 本脚本做四件事，任何一步失败都退出非 0、不产出可发布包：
//   1) 只接受 origin/main 上的提交（默认 origin/main 本身），且该提交之后没有落下的前端改动；
//   2) 用 git archive 干净导出后构建（不读工作区 src，避免把未提交改动带进产物）；
//   3) 逐条 grep release-markers.tsv 的功能标记，少一条即失败；
//   4) 往 dist/static/build-info.json 写 commit / 环境 / 入口，部署后可 curl 回读核对。
//
// 用法：
//   node qingliao/tou-mall-admin-web/scripts/release-dist.mjs --env prod
//   node qingliao/tou-mall-admin-web/scripts/release-dist.mjs --env test
//   node ... --env prod --commit <sha> --out /tmp/xxx.tgz   # sha 必须已在 origin/main 里

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = git(['-C', webRoot, 'rev-parse', '--show-toplevel']).trim()

function git(args) {
  return execFileSync('git', args, { maxBuffer: 512 * 1024 * 1024 }).toString()
}
function arg(name, dflt) {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
function fail(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

const envName = arg('--env', 'prod')
if (!['prod', 'test'].includes(envName)) fail(`--env 只能是 prod 或 test，收到 ${envName}`)
const baseApi = envName === 'prod' ? 'https://manage.fullytherapy.com/api' : '/api'
const outArg = arg('--out', '')

// 先拉一次 origin/main，否则本地 ref 过期会把「刚合进来的修复」判成不存在
try {
  execFileSync('git', ['-C', repoRoot, 'fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore' })
} catch {
  console.warn('! git fetch origin main 失败，按本地已有的 origin/main 判定')
}
const main = git(['-C', repoRoot, 'rev-parse', 'origin/main']).trim()
const commit = arg('--commit', main)
try {
  git(['-C', repoRoot, 'merge-base', '--is-ancestor', commit, main])
} catch {
  fail(`提交 ${commit} 不在 origin/main（${main}）里。先合入 main 再发；不允许从功能分支/旧提交构建。`)
}
const behind = git(['-C', repoRoot, 'log', '--oneline', `${commit}..${main}`, '--', 'qingliao/tou-mall-admin-web/src']).trim()
if (behind) {
  fail(`该提交之后 origin/main 还有前端改动没进产物：\n${behind}\n改用默认（origin/main）重新构建。`)
}

const short = commit.slice(0, 8)
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
const outFile = outArg || path.join(os.tmpdir(), `qingliao-admin-${envName}-${short}-${stamp}.tgz`)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ql-admin-build-${short}-`))

console.log(`• 来源提交 ${commit}（origin/main）`)
console.log(`• 环境 ${envName}  BASE_API=${baseApi}`)
console.log(`• 干净导出 → ${tmp}`)

let dist
try {
  execFileSync('bash', [
    '-c',
    `git -C "${repoRoot}" archive ${commit} -- qingliao/tou-mall-admin-web | tar -x -C "${tmp}"`
  ])
  const work = path.join(tmp, 'qingliao/tou-mall-admin-web')
  // build/ 与 node_modules/ 不在 git 里，从工作区借用
  fs.cpSync(path.join(webRoot, 'build'), path.join(work, 'build'), { recursive: true })
  fs.symlinkSync(path.join(webRoot, 'node_modules'), path.join(work, 'node_modules'), 'dir')

  execFileSync('npm', ['run', 'build'], {
    cwd: work,
    env: { ...process.env, BASE_API: baseApi },
    stdio: 'inherit'
  })
  dist = path.join(work, 'dist')

  // 功能标记
  const jsDir = path.join(dist, 'static/js')
  const blobs = fs
    .readdirSync(jsDir)
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(jsDir, f), 'utf8'))
  const markers = fs
    .readFileSync(path.join(work, 'release-markers.tsv'), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [marker, label = ''] = line.split('\t')
      return { marker, label }
    })
  const missing = markers.filter(({ marker }) => !blobs.some(b => b.includes(marker)))
  if (missing.length) {
    fail(
      `产物缺 ${missing.length}/${markers.length} 个功能标记（构建来源可能落后或有回退）：\n` +
        missing.map(m => `  - ${m.marker}  ${m.label}`).join('\n')
    )
  }

  const entry = /app\.[a-f0-9]+\.js/.exec(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'))
  if (!entry) fail('index.html 里找不到 app.<hash>.js 入口')

  fs.writeFileSync(
    path.join(dist, 'static/build-info.json'),
    JSON.stringify(
      {
        commit,
        env: envName,
        baseApi,
        entry: entry[0],
        markers: markers.length,
        builtAt: new Date().toISOString()
      },
      null,
      2
    ) + '\n'
  )

  execFileSync('tar', ['czf', outFile, '-C', dist, '.'])
  const sha = crypto.createHash('sha256').update(fs.readFileSync(outFile)).digest('hex')
  const size = fs.statSync(outFile).size

  console.log(`\n✓ 标记 ${markers.length}/${markers.length} 命中`)
  console.log(`✓ 入口 ${entry[0]}`)
  console.log(`✓ 产物 ${outFile}（${(size / 1048576).toFixed(1)} MB，sha256 ${sha}）`)
  console.log(`✓ commit ${commit} 已写入 dist/static/build-info.json（部署后 curl 回读核对）`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}