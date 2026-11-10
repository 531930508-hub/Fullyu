const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(name) {
  const file = path.join(__dirname, 'src/utils', name + '.ts')
  assert.ok(fs.existsSync(file), name + ' 尚未实现')
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const result = { exports: {} }
  new Function('module', 'exports', 'require', code)(result, result.exports, require)
  return result.exports
}
const sample = [
  { id:'1', type:'SINGLE', categories:['声音'], startDate:'2026-10-22T00:00:00.000Z', venueId:'a', difficulty:'BEGINNER', maxCapacity:8, currentEnrolled:7 },
  { id:'2', type:'SERIES', categories:['声音'], startDate:'2026-10-22T00:00:00.000Z', venueId:'a', difficulty:'BEGINNER', maxCapacity:8, currentEnrolled:8 },
  { id:'3', type:'SINGLE', categories:['呼吸'], startDate:'2026-10-23T00:00:00.000Z', venueId:'b', difficulty:'INTERMEDIATE', maxCapacity:8, currentEnrolled:2 },
]
test('首页分类不排除系列课，日期、场地、难度及余位均取真实字段', () => {
  const { filterCourseList } = load('presence-view')
  assert.deepEqual(filterCourseList(sample,{category:'声音'}).map(x=>x.id), ['1','2'])
  assert.deepEqual(filterCourseList(sample,{category:'声音',onlyAvailable:true}).map(x=>x.id), ['1'])
  assert.deepEqual(filterCourseList(sample,{date:'2026-10-23',venueId:'b',difficulty:'INTERMEDIATE'}).map(x=>x.id), ['3'])
  assert.deepEqual(filterCourseList(sample,{venueIds:['b']}).map(x=>x.id), ['3'])
  assert.equal(filterCourseList(sample,{date:'2026-10-24'}).length, 0)
})
test('城市名称在中英文下展示，未知城市原样保留', () => {
  const { cityLabel } = load('presence-view')
  assert.equal(cityLabel('上海'), '上海')
  assert.equal(cityLabel('上海', 'en'), 'Shanghai')
  assert.equal(cityLabel('成都', 'en'), 'Chengdu')
  assert.equal(cityLabel('景德镇', 'en'), '景德镇')
})
test('城市选项来自真实场地，课程按当前城市场地收敛', () => {
  const { cityOptionsFromVenues, normalizeCity, venueIdsForCity, filterCourseList } = load('presence-view')
  const venues = [
    { id: 'sh1', city: '上海' },
    { id: 'sh2', city: '上海' },
    { id: 'bj1', city: '北京' },
    { id: 'old', city: '' },
  ]
  assert.deepEqual(cityOptionsFromVenues(venues), ['上海', '北京'])
  assert.deepEqual(venueIdsForCity(venues, '北京'), ['bj1'])
  assert.deepEqual(venueIdsForCity(venues, '上海'), ['sh1', 'sh2', 'old'])
  assert.deepEqual(cityOptionsFromVenues([], '杭州'), ['杭州'])
  assert.equal(normalizeCity('   '), '上海')
  assert.deepEqual(filterCourseList(sample, { venueIds: venueIdsForCity(venues, '北京') }), [])
})
test('未知签到不能误判缺勤，只有明确签到才允许评价', () => {
  const { attendanceLabel, canReviewOrder } = load('presence-view')
  assert.equal(attendanceLabel({}), '签到记录待同步')
  assert.equal(canReviewOrder({status:'COMPLETED'}), false)
  assert.equal(canReviewOrder({status:'COMPLETED',checkedIn:true}), true)
  assert.equal(canReviewOrder({status:'PAID',checkedIn:true}), false)
})
test('微信胶囊布局在 H5 与真机上都给出安全的顶部留白', () => {
  const { capsuleLayoutFrom } = load('capsule')
  const device = capsuleLayoutFrom({
    statusBarHeight: 44,
    windowWidth: 375,
    menu: { top: 50, bottom: 82, left: 281, height: 32 },
  })
  assert.equal(device.statusBarHeight, 44)
  assert.equal(device.headerTop, 46)
  assert.equal(device.capsuleRight, 102)
  assert.equal(device.navBarHeight, 44)
  assert.equal(device.hasCapsule, true)
  const h5 = capsuleLayoutFrom({})
  assert.equal(h5.statusBarHeight, 0)
  assert.equal(h5.headerTop, 16)
  assert.equal(h5.capsuleRight, 0)
  assert.equal(h5.hasCapsule, false)
})
test('倒计时归零与无效时间均不能继续支付', () => {
  const { paymentSeconds } = load('presence-view')
  const now = Date.parse('2026-10-22T10:00:00Z')
  assert.equal(paymentSeconds('2026-10-22T10:01:30Z',now),90)
  assert.equal(paymentSeconds('2026-10-22T09:59:59Z',now),0)
  assert.equal(paymentSeconds('',now),0)
  assert.equal(paymentSeconds('invalid',now),0)
})
