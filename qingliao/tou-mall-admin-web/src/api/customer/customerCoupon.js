import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/customerCoupon/page',
      method: 'get',
      params: params
    })
  },
  invalid(id) {
    return request({
      url: '/customerCoupon/invalid',
      method: 'put',
      params: {id}
    })
  }
}
