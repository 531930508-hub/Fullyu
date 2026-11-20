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
  defaultCcUsers() {
    return request({
      url: '/massagistLeave/defaultCcUsers',
      method: 'get'
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
  // 周视图：一周休息看板（leaves + 折算休息天数 stats）
  weekBoard(params) {
    return request({
      url: '/massagistLeave/weekBoard',
      method: 'get',
      params
    })
  },
}
