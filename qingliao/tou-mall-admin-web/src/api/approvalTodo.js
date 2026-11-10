import request from '@/utils/request'

/**
 * 待办中心：审批到人级别，不区分门店
 */
export default {
  count() {
    return request({
      url: '/approvalDetail/todoCount',
      method: 'get'
    })
  },
  page(params) {
    return request({
      url: '/approvalDetail/page',
      method: 'get',
      params: params
    })
  },
  pass(id) {
    return request({
      url: `/approvalDetail/pass/${id}`,
      method: 'put'
    })
  },
  reject(id, rejectReason) {
    return request({
      url: `/approvalDetail/reject/${id}`,
      method: 'post',
      params: {rejectReason}
    })
  }
}
