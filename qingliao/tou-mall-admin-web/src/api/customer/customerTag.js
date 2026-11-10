import request from '@/utils/request'

export default {
  save(data) {
    return request({
      url: '/customerTag',
      method: 'post',
      data
    })
  },
  removeById(id) {
    return request({
      url: '/customerTag/' + id,
      method: 'delete',
    })
  },
  list(params) {
    return request({
      url: '/customerTag/list',
      method: 'get',
      params: params
    })
  }
}
