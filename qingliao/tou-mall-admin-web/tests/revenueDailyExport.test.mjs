import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'

const page = await readFile(new URL('../src/views/statistics/revenue/index.vue', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/api/statistics.js', import.meta.url), 'utf8')

function load(source) {
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '')
    .replace('export default', 'this.options =')
  const context = vm.createContext({ShopSelector: {}, OrderDetail: {}, mapGetters: () => ({})})
  vm.runInContext(script, context)
  return context.options
}

test('daily export params keep current filters but force income type and drop paging', () => {
  const {dailyExportParams} = load(page).methods
  const p = dailyExportParams({
    page: 3, size: 15, shopId: 2, type: '支出', businessType: '门店消费', payType: '微信',
    startPayTime: '2026-11-01 00:00:00', endPayTime: '2026-11-07 23:59:59'
  })
  assert.deepEqual(JSON.parse(JSON.stringify(p)), {
    shopId: 2, type: '收入', businessType: '门店消费', payType: '微信',
    startPayTime: '2026-11-01 00:00:00', endPayTime: '2026-11-07 23:59:59'
  })
})

test('daily export rejects missing or over-long ranges before calling the API', () => {
  const {dailyExportError} = load(page).methods
  assert.equal(dailyExportError({}), '请先选择收支日期区间')
  assert.equal(dailyExportError({startPayTime: '2025-01-01 00:00:00', endPayTime: '2026-11-07 23:59:59'}),
    '日报单次最多导出 366 天，请缩小日期区间')
  assert.equal(dailyExportError({startPayTime: '2026-01-01 00:00:00', endPayTime: '2027-01-01 23:59:59'}), null)
  assert.equal(dailyExportError({startPayTime: '2026-11-01 00:00:00', endPayTime: '2026-11-07 23:59:59'}), null)
})

test('page exposes a daily export button wired to the blob API', () => {
  assert.match(page, /@click="exportDaily"[^>]*>导出日报</)
  assert.match(api, /url: '\/statistics\/operatingRevenue\/dailyExport'[\s\S]*?responseType: 'blob'[\s\S]*?经营日报\.xlsx/)
})
