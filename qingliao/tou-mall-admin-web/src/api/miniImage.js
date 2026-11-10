import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/miniImage/page',
      method: 'get',
      params: params
    })
  },
  saveOrUpd(data) {
    return request({
      url: '/miniImage/saveOrUpd',
      method: 'post',
      data
    })
  },
  list(params) {
    return request({
      url: '/miniImage/list',
      method: 'get',
      params
    })
  },
  remove(id) {
    return request({
      url: '/miniImage/remove',
      method: 'delete',
      params: {id}
    })
  },
}
