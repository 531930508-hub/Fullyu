import request from '@/utils/request'

export default {
  list(params) {
    return request({
      url: '/project/list',
      method: 'get',
      params
    })
  },
  update(data) {
    return request({
      url: '/project',
      method: 'put',
      data
    })
  },
  getReceptionProjectId() {
    return request({
      url: '/project/get/receptionProjectId',
      method: 'get'
    })
  },
}
