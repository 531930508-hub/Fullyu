export function newNoticeState() {
  return {items: [], total: 0, unreadCount: 0, page: 1, size: 10, loading: false, error: '', requestId: 0, readingIds: []}
}

export function resetNotices(state) {
  state.requestId++
  state.items = []
  state.total = 0
  state.unreadCount = 0
  state.page = 1
  state.loading = false
  state.error = ''
  state.readingIds = []
}

export async function loadNotices(state, api, page = 1) {
  const requestId = ++state.requestId
  state.loading = true
  state.error = ''
  try {
    const result = await api.page({page, size: state.size})
    if (requestId !== state.requestId) return
    if (!result || !Array.isArray(result.list)) throw new Error('invalid response')
    state.items = result.list
    state.total = Number(result.total) || 0
    state.unreadCount = Number(result.unreadCount) || 0
    state.page = page
  } catch (error) {
    if (requestId === state.requestId) state.error = '暂时无法读取提醒，请检查网络后重试'
  } finally {
    if (requestId === state.requestId) state.loading = false
  }
}

export async function readNotice(state, api, row) {
  if (!row || row.readAt || state.readingIds.includes(row.id)) return
  const requestId = state.requestId
  state.readingIds = [...state.readingIds, row.id]
  try {
    await api.read(row.id)
    if (requestId !== state.requestId) return
    row.readAt = new Date().toISOString()
    state.unreadCount = Math.max(0, state.unreadCount - 1)
  } finally {
    state.readingIds = state.readingIds.filter(id => id !== row.id)
  }
}

export async function subscribeCouponNotice(api, requestAuthorization, requestId, configuration) {
  // 页面预取配置；点击处理器传入缓存后，在第一次await前直接调用微信授权。
  const config = configuration || await api.config()
  if (!config || !config.available || !config.templateId) return {status: 'not-configured'}
  const result = await requestAuthorization([config.templateId])
  const decision = result && result[config.templateId]
  if (!['accept', 'reject', 'ban'].includes(decision)) throw new Error('没有收到明确的授权结果')
  const key = requestId || `notice_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
  await api.consent({templateId: config.templateId, decision, requestId: key})
  return {status: decision, realDeliveryEnabled: config.realDeliveryEnabled === true}
}
