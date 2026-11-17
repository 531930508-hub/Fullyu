/**
 * 测试环境引导：
 * 1. reflect-metadata —— NestJS 依赖注入所需
 * 2. 手动解析 .env.local 注入 process.env（pnpm 结构下 dotenv 无法直接 require，
 *    且 Prisma 在实例化时即读取 process.env.DATABASE_URL）
 * 3. 库名闸门 —— 测试会写真实数据，连接串的库名必须含 _test / rehearsal，
 *    否则 setupFiles 阶段直接抛错。这条红线防的是「开发机有 .env.local，npx jest
 *    无意间对生产 RDS 跑用例」（生产方案 §7.6）。
 */
import 'reflect-metadata'
import * as fs from 'fs'
import * as path from 'path'

function isTestDatabase(url: string): boolean {
  let dbName = ''
  try {
    dbName = new URL(url).pathname.replace(/^\//, '')
  } catch {
    return false
  }
  return /_test([_-]|$)|rehearsal/.test(dbName)
}

function assertTestDatabase(url: string, source: string): void {
  if (!url.startsWith('mysql://')) return // sqlite 临时库不适用
  if (isTestDatabase(url)) return
  let dbName = url
  try {
    dbName = new URL(url).pathname.replace(/^\//, '')
  } catch {
    // 保持原串，方便排查
  }
  throw new Error(
    `拒绝连接非测试库「${dbName}」（来自 ${source}）：集成测试会写真实数据。` +
      '请设 TEST_DATABASE_URL=mysql://<user>:<pw>@<host>:<port>/<db_with_test_in_name>，' +
      '本地无 MySQL 时先 ssh -L 到 8.133 的 fullyu_test。'
  )
}

const explicitTestUrl = (process.env.TEST_DATABASE_URL || '').trim()
if (explicitTestUrl) {
  assertTestDatabase(explicitTestUrl, 'TEST_DATABASE_URL')
  process.env.DATABASE_URL = explicitTestUrl
} else {
  const envPath = path.resolve(__dirname, '../.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  }
  const dbUrl = (process.env.DATABASE_URL || '').trim()
  if (dbUrl) assertTestDatabase(dbUrl, '.env.local')
}