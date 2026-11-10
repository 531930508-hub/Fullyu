import request from '@/utils/request'

export default {
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
      method: 'put',
    })
  },
  list(params) {
    return request({
      url: '/approvalDetail/list',
      method: 'get',
      params
    })
  },
  findApprovalCategoryDetail(approvalId) {
    return request({
      url: `/approvalDetail/detail`,
      method: 'get',
      params: {approvalId}
    })
  },
  reject(id, rejectReason,) {
    return request({
      url: `/approvalDetail/reject/${id}`,
      method: 'post',
      params: {rejectReason}
    })
  },
}
