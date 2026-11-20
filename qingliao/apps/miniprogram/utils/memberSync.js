/**
 * 会员数据同步态 · 三端统一口径（轻疗 / 在场 / 时叙）。
 *
 * CRM 是积分、卡期、卡等级的唯一账本，但它不可用时顾客仍然要能登录、能预约、能核销。
 * 页面不能把「连不上」渲染成「0 积分 / 未开通 / 已到期」——那会被当成真实数据。
 * 因此这里把同步态落到 storage，读卡面的入口共用同一口径：
 *
 * - live    本次读取直连 CRM 成功，数字可以照常展示；
 * - stale   CRM 暂不可用，展示最近一次成功快照，积分与卡期一律打码（****）；
 * - unknown CRM 暂不可用且本机没有快照，只展示卡面骨架 + 「同步中」。
 *
 * 本模块零依赖（不 import cookie/http/uni 之外的任何东西），测试可直接执行源码。
 */

export const MEMBER_SYNC = Object.freeze({
  LIVE: 'live',
  STALE: 'stale',
  UNKNOWN: 'unknown'
})

/** 动态数字的占位符：卡名/卡等级可以保留，积分与日期不能猜。 */
export const MEMBER_MASK = '****'

const STATE_KEY = 'fy_member_sync_state'
const SUMMARY_KEY = 'fy_member_summary_cache'

function storage() {
  return typeof uni !== 'undefined' && uni ? uni : null
}

export function setMemberSyncState(state) {
  const api = storage()
  if (!api) return
  try {
    api.setStorageSync(STATE_KEY, state)
  } catch (error) {
    // storage 满/被禁用不该影响页面
  }
}

export function getMemberSyncState() {
  const api = storage()
  if (!api) return MEMBER_SYNC.LIVE
  try {
    const state = api.getStorageSync(STATE_KEY)
    return state || MEMBER_SYNC.LIVE
  } catch (error) {
    return MEMBER_SYNC.LIVE
  }
}

/** stale / unknown 都算降级；只有 live 的数字可以直接展示。 */
export function isMemberDegraded(state) {
  const value = state || getMemberSyncState()
  return value === MEMBER_SYNC.STALE || value === MEMBER_SYNC.UNKNOWN
}

/**
 * 卡面摘要缓存：只存「已经成功从 CRM 读到的摘要」，用于 CRM 故障时保持首屏可见。
 * 不带 syncState —— 缓存本身永远只是快照，是否可信由当前同步态决定。
 */
export function writeMemberSummaryCache(summary) {
  const api = storage()
  if (!api || !summary) return
  try {
    const { syncState, ...snapshot } = summary
    api.setStorageSync(SUMMARY_KEY, { syncedAt: Date.now(), summary: snapshot })
  } catch (error) {
    // 同上：缓存失败不影响主流程
  }
}

export function readMemberSummaryCache() {
  const api = storage()
  if (!api) return null
  try {
    const cached = api.getStorageSync(SUMMARY_KEY)
    if (cached && cached.summary && typeof cached.summary === 'object') return cached.summary
  } catch (error) {
    return null
  }
  return null
}

export function clearMemberSummaryCache() {
  const api = storage()
  if (!api) return
  try {
    api.removeStorageSync(SUMMARY_KEY)
    api.removeStorageSync(STATE_KEY)
  } catch (error) {
    // ignore
  }
}