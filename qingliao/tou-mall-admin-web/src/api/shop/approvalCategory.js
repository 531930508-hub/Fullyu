import request from '@/utils/request'

export default {
  update(data) {
    return request({
      url: '/approvalCategory/update',
      method: 'post',
      data
    })
  },
  list(params) {
    return request({
      url: '/approvalCategory/list',
      method: 'get',
      params
    })
  },
  add(data) {
    return request({
      url: '/approvalCategory/add',
      method: 'post',
      data
    })
  },
  listByShopId(params) {
    return request({
      url: '/approvalCategory/listByShopId',
      method: 'get',
      params
    })
  }
}
