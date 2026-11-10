import request from '@/utils/request'

export default {
  save(data) {
    return request({
      url: '/productTag',
      method: 'post',
      data
    })
  },
  removeById(id) {
    return request({
      url: '/productTag/' + id,
      method: 'delete',
    })
  },
  list(params) {
    return request({
      url: '/productTag/list',
      method: 'get',
      params: params
    })
  }
}
