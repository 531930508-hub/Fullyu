import request from '@/utils/request'

export default {
  saveOrUpd(data) {
    return request({
      url: '/orderDiscount/saveOrUpd',
      method: 'post',
      data
    })
  },
  removeById(id) {
    return request({
      url: '/orderDiscount/remove/',
      method: 'delete',
      params: {id}
    })
  },
  page(params) {
    return request({
      url: '/orderDiscount/page',
      method: 'get',
      params: params
    })
  }
}
