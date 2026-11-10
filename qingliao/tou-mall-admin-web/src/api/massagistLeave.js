import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/massagistLeave/page',
      method: 'get',
      params: params
    })
  },
  add(data) {
    return request({
      url: '/massagistLeave/add',
      method: 'post',
      data
    })
  },
  findMassagistLeaveDetailByApprovalId(approvalId) {
    return request({
      url: '/massagistLeave/findMassagistLeaveDetailByApprovalId',
      method: 'get',
      params:{approvalId}
    })
  },
  getMessagistShopId(massagistId) {
    return request({
      url: '/massagistLeave/getMessagistShopId',
      method: 'get',
      params:{massagistId}
    })
  },
  cancelLeave(approvalId) {
    return request({
      url: '/massagistLeave/cancelLeave',
      method: 'get',
      params:{approvalId}
    })
  },
}
