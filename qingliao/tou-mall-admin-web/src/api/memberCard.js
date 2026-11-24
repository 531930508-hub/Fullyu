import request from '@/utils/request'

export default {
  page(params) {
    return request({ url: '/memberCard/page', method: 'get', params })
  },
  detail(id) {
    return request({ url: '/memberCard/detail', method: 'get', params: { id } })
  },
  issue(data) {
    return request({ url: '/memberCard/issue', method: 'post', data })
  },
  expiring(days) {
    return request({ url: '/memberCard/expiring', method: 'get', params: { days } })
  },
  stats() {
    return request({ url: '/memberCard/stats', method: 'get' })
  },
  config() {
    return request({ url: '/memberCard/config/admin', method: 'get' })
  },
  updateConfig(data) {
    return request({ url: '/memberCard/config/update', method: 'post', data })
  },
  customerPage(params) {
    return request({ url: '/customer/page', method: 'get', params })
  },
  brandOrderPage(params) {
    return request({ url: '/memberCard/brandOrder/page', method: 'get', params })
  },
  brandOrderPreview(id) {
    return request({ url: '/memberCard/brandOrder/preview', method: 'get', params: { id } })
  },
  brandOrderRefund(data) {
    return request({ url: '/memberCard/brandOrder/refund', method: 'post', data })
  },
  brandOrderRetrySettle(id) {
    return request({ url: '/memberCard/brandOrder/retrySettle', method: 'post', data: { id } })
  },
  brandOrderRetry(id) {
    return request({ url: '/memberCard/brandOrder/retry', method: 'post', data: { id } })
  },
  unlockCustomer(customerId) {
    return request({ url: '/memberCard/customer/unlock', method: 'post', data: { customerId } })
  },
  // CRM 卡账本对账：dryRun=true 只返回差异（新增/更新/未变/跳过），不落库
  syncCrmCards(dryRun) {
    return request({ url: '/memberCard/syncCrmCards', method: 'post', data: { dryRun: !!dryRun } })
  }
}
