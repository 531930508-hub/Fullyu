import request from '@/utils/request'

export default {
  list(params) {
    return request({
      url: '/product/list',
      method: 'get',
      params
    })
  },
  page(params) {
    return request({
      url: '/product/page',
      method: 'get',
      params: params
    })
  },
  getListNotParams(){
    return request({
      url: '/product/getListNotParams',
      method: 'get'
    })
  },
  add(data) {
    return request({
      url: '/product',
      method: 'post',
      data
    })
  },
  upd(data) {
    return request({
      url: '/product',
      method: 'put',
      data
    })
  }
}
