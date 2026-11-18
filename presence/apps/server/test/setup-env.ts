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

/**
 * fetch 全局桥接。
 *
 * Jest 29 的 node 环境不会把 Node 运行时自带的 undici 全局（fetch / Headers /
 * Request / Response / FormData / Blob）带进 vm 沙箱——沙箱里 typeof fetch ===
 * 'undefined'。于是凡是走 fetch 的代码（CRM 客户端、微信、汇付回执）在测试里都
 * 会命中自己的 catch，表现为「会员服务暂时不可用 503」这类假故障。
 *
 * setupFiles 跑在沙箱内、拿不到宿主 realm，只能借 process（宿主对象）的构造函数
 * 回到宿主 globalThis 取出真正的 fetch —— 就是生产同一套 undici，不是自制 shim，
 * 所以 AbortSignal 超时中断等语义与线上一致。AbortController 沙箱自带且可互操作，
 * 不需要替换。
 */
function installNodeFetchGlobals(): void {
  const sandbox = globalThis as Record<string, unknown>
  if (typeof sandbox.fetch === 'function') return
  let host: Record<string, unknown>
  try {
    host = (process as unknown as { constructor: { constructor: (src: string) => () => Record<string, unknown> } })
      .constructor.constructor('return globalThis')()
  } catch {
    return // 拿不到宿主 realm 就保持原样，让用例如实失败
  }
  for (const key of ['fetch', 'Headers', 'Request', 'Response', 'FormData', 'Blob']) {
    if (host[key] !== undefined) sandbox[key] = host[key]
  }
}

installNodeFetchGlobals()