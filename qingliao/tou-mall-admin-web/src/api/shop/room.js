import request from '@/utils/request'

export default {
  page(params) {
    return request({
      url: '/room/page',
      method: 'get',
      params: params
    })
  },
  saveOrUpd(data) {
    return request({
      url: '/room/saveOrUpd',
      method: 'post',
      data
    })
  },
  list(params) {
    return request({
      url: '/room/list',
      method: 'get',
      params
    })
  },
  remove(id) {
    return request({
      url: '/room/remove',
      method: 'delete',
      params: {id}
    })
  },
}
