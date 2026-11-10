import request from '@/utils/request'

// 客户疗愈师偏好：收藏。后台代客户添加时复用既有接口。
export default {
  page(params) {
    return request({
      url: '/customerMassagistRelation/page',
      method: 'get',
      params: params
    })
  },
  create(data) {
    return request({
      url: '/customerMassagistRelation',
      method: 'post',
      data: data
    })
  },
  remove(id) {
    return request({
      url: `/customerMassagistRelation/${id}`,
      method: 'delete'
    })
  }
}
