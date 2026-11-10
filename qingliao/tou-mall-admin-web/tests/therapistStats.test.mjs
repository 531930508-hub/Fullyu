import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'

const root = new URL('../src/', import.meta.url)
const page = await readFile(new URL('views/statistics/therapistStats/index.vue', root), 'utf8')
const api = await readFile(new URL('api/statistics.js', root), 'utf8')
const router = await readFile(new URL('router/index.js', root), 'utf8')

function load(source, extra = {}) {
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/\bimport\s+[^;\n]*(?:;|\n)/g, '')
    .replace('export default', 'this.options =')
  const context = vm.createContext({
    ShopSelector: {}, MassagistSelector: {}, mapGetters: () => ({}), statisticsApi: {},
    dateUtil: {getCurrentMonthCode: () => '2026-11', getCurrentDateCode: () => '2026-11-08'}, ...extra
  })
  vm.runInContext(script, context)
  return context.options
}

test('query params join selected therapists, drop empties and paging for export', () => {
  const {queryParams} = load(page).methods
  const form = {shopId: '', massagistIds: [7, 9], status: 1, page: 2, size: 20,
    startTime: '2026-11-01 00:00:00', endTime: '2026-11-08 23:59:59'}
  assert.deepEqual(JSON.parse(JSON.stringify(queryParams(form, true))), {
    massagistIds: '7,9', status: 1, page: 2, size: 20,
    startTime: '2026-11-01 00:00:00', endTime: '2026-11-08 23:59:59'})
  assert.deepEqual(JSON.parse(JSON.stringify(queryParams({...form, massagistIds: [], shopId: 3}, false))), {
    shopId: 3, status: 1, startTime: '2026-11-01 00:00:00', endTime: '2026-11-08 23:59:59'})
})

test('defaults to active status and current month, therapist login locks to self', () => {
  const options = load(page)
  const data = options.data()
  assert.equal(data.searchForm.status, 1)
  assert.equal(data.searchForm.page, 1)
  const vmLike = {...data, massagist: true, massagistId: 7, shopId: 2, $store: {dispatch() {}}, searchData() {}}
  options.created.call(vmLike)
  assert.deepEqual(Array.from(vmLike.searchForm.massagistIds), [7])
  assert.equal(vmLike.searchForm.shopId, '')
  assert.equal(vmLike.searchForm.startTime, '2026-11-01 00:00:00')
})

test('stale responses are ignored when filters change quickly', async () => {
  const resolvers = []
  const options = load(page, {statisticsApi: {therapistStats: () => new Promise(r => resolvers.push(r))}})
  const ctx = {...options.data(), destroyed: false, queryParams: options.methods.queryParams}
  const fetchData = options.methods.fetchData
  const first = fetchData.call(ctx)
  const second = fetchData.call(ctx)
  resolvers[1]({data: {list: [{massagistId: 2}], total: 1, summary: {orderCount: 5}}})
  await second
  resolvers[0]({data: {list: [{massagistId: 1}], total: 9}})
  await first
  assert.equal(ctx.dataList[0].massagistId, 2)
  assert.equal(ctx.total, 1)
  assert.equal(ctx.summary.orderCount, 5)
  assert.equal(ctx.listLoading, false)
})

test('route, API and multi-select wiring exist', () => {
  assert.match(router, /path: 'therapistStats'[\s\S]*?views\/statistics\/therapistStats\/index[\s\S]*?title: '疗愈师统计'/)
  assert.match(api, /url: '\/statistics\/therapistStats'/)
  assert.match(api, /url: '\/statistics\/therapistStats\/export'[\s\S]*?responseType: 'blob'[\s\S]*?疗愈师统计\.xlsx/)
  assert.match(page, /<massagist-selector[^>]*multiple/)
  assert.match(page, /全部合作状态/)
  assert.match(page, /新增点钟/)
  assert.match(page, /el-pagination/)
})
