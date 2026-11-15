import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/approvalDetail/page',
      method: 'get',
      params: params
    })
  },
  pageLeave(params) {
    return request({
      url: '/approvalDetail/pageLeave',
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
  //只读查看完整审批流程（订单详情/消费记录/排班日志回溯用）
  flow(approvalId) {
    return request({
      url: '/approvalDetail/flow',
      method: 'get',
      params: {approvalId}
    })
  },
  //按订单查询关联审批
  byOrder(orderId) {
    return request({
      url: '/approvalDetail/byOrder',
      method: 'get',
      params: {orderId}
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
