import request from '@/utils/request'

export default {
  save(data) {
    return request({
      url: '/activityTag',
      method: 'post',
      data
    })
  },
  removeById(id) {
    return request({
      url: '/activityTag/' + id,
      method: 'delete',
    })
  },
  list(params) {
    return request({
      url: '/activityTag/list',
      method: 'get',
      params: params
    })
  }
}
