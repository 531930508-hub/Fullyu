const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// 会员卡「已排期」行：纯函数无依赖，直接转译后加载（同 presence-behavior.test.cjs 的手法）
function load() {
  const file = path.join(__dirname, 'src/utils/member-card-line.ts')
  assert.ok(fs.existsSync(file), 'member-card-line.ts 尚未实现')
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText
  const result = { exports: {} }
  new Function('module', 'exports', 'require', code)(result, result.exports, require)
  return result.exports
}

const tr = (zh, en) => `${zh}|${en}`
const card = (validFrom, validUntil) => ({ state: 'PENDING', validFrom, validUntil })

test('待生效续卡按 CRM 给的两端日期拼一句，中英都带', () => {
  const { pendingRenewalLine } = load()
  assert.equal(
    pendingRenewalLine(card('2026-12-18', '2027-03-17'), tr),
    '已排期：2026-12-18 起接续，权益至 2027-03-17|Scheduled: 2026-12-18 onward, valid until 2027-03-17'
  )
})

test('没有待生效卡或日期缺一段时不渲染，卡面不出现半句空话', () => {
  const { pendingRenewalLine } = load()
  assert.equal(pendingRenewalLine(null, tr), '')
  assert.equal(pendingRenewalLine(undefined, tr), '')
  assert.equal(pendingRenewalLine(card('', '2027-03-17'), tr), '')
  assert.equal(pendingRenewalLine(card('2026-12-18', null), tr), '')
})

test('带时间的 ISO 只取日期段，和「有效期至」同一口径', () => {
  const { pendingRenewalLine } = load()
  assert.ok(
    pendingRenewalLine(card('2026-12-18T00:00:00.000Z', '2027-03-17T00:00:00.000Z'), tr).includes(
      '2026-12-18 起接续，权益至 2027-03-17'
    )
  )
})

test('会员卡面渲染这一行，且只在有待生效卡时出现', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/components/MemberCard.vue'), 'utf8')
  assert.match(source, /<text v-if="pendingLine" class="bmc-pending">\{\{ pendingLine \}\}<\/text>/)
  assert.match(source, /pendingRenewalLine\(props\.data\?\.pendingCard, tr\)/)
})