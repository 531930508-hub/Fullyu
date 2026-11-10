import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/customer/page',
      method: 'get',
      params: params
    })
  },
  update(customer) {
    return request({
      url: '/customer',
      method: 'put',
      data: customer
    })
  },
  exportExcel(params) {
    return request({
      url: '/customer/export',
      method: 'get',
      params,
      responseType: 'blob',
      timeout: 90000
    })
  }
}
