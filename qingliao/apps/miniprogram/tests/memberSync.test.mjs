import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

// 直接执行源码：模块零依赖，只在调用时才碰 uni（小程序/测试都要能跑）。
const code = await readFile(new URL('../utils/memberSync.js', import.meta.url), 'utf8')
const sync = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))

function fakeUni() {
  const store = new Map()
  return {
    getStorageSync: (key) => (store.has(key) ? store.get(key) : ''),
    setStorageSync: (key, value) => store.set(key, value),
    removeStorageSync: (key) => store.delete(key),
    store
  }
}

test('默认是 live：没有记录时不把会员卡当成同步中', () => {
  globalThis.uni = fakeUni()
  assert.equal(sync.getMemberSyncState(), sync.MEMBER_SYNC.LIVE)
  assert.equal(sync.isMemberDegraded(), false)
})

test('stale / unknown 都算降级，live 不算', () => {
  globalThis.uni = fakeUni()
  sync.setMemberSyncState(sync.MEMBER_SYNC.STALE)
  assert.equal(sync.isMemberDegraded(), true)
  sync.setMemberSyncState(sync.MEMBER_SYNC.UNKNOWN)
  assert.equal(sync.isMemberDegraded(), true)
  sync.setMemberSyncState(sync.MEMBER_SYNC.LIVE)
  assert.equal(sync.isMemberDegraded(), false)
})

test('摘要缓存只留快照，syncState 每次按当前读数决定', () => {
  globalThis.uni = fakeUni()
  sync.writeMemberSummaryCache({ state: 'active', remainingDays: 12, points: 66, syncState: 'live' })
  const cached = sync.readMemberSummaryCache()
  assert.equal(cached.state, 'active')
  assert.equal(cached.remainingDays, 12)
  assert.equal('syncState' in cached, false, '缓存本身不是实时数据，不能自带 live 标记')
})

test('没有快照时降级读回 null，页面据此只显示同步中骨架', () => {
  globalThis.uni = fakeUni()
  assert.equal(sync.readMemberSummaryCache(), null)
})

test('清除缓存同时清掉同步态，退出登录后不会把上一个人的卡期带出来', () => {
  globalThis.uni = fakeUni()
  sync.writeMemberSummaryCache({ state: 'active', remainingDays: 3 })
  sync.setMemberSyncState(sync.MEMBER_SYNC.STALE)
  sync.clearMemberSummaryCache()
  assert.equal(sync.readMemberSummaryCache(), null)
  assert.equal(sync.getMemberSyncState(), sync.MEMBER_SYNC.LIVE)
})

test('storage 抛错不影响页面渲染', () => {
  globalThis.uni = {
    getStorageSync() { throw new Error('denied') },
    setStorageSync() { throw new Error('denied') },
    removeStorageSync() { throw new Error('denied') }
  }
  assert.equal(sync.getMemberSyncState(), sync.MEMBER_SYNC.LIVE)
  assert.equal(sync.readMemberSummaryCache(), null)
  assert.doesNotThrow(() => sync.setMemberSyncState(sync.MEMBER_SYNC.STALE))
  assert.doesNotThrow(() => sync.writeMemberSummaryCache({ state: 'active' }))
})