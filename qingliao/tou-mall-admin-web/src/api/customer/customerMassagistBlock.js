import request from '@/utils/request'

// 客户疗愈师偏好：暂别。后台内部同样使用「暂别」话术。
export default {
  page(params) {
    return request({
      url: '/customerMassagistBlock/page',
      method: 'get',
      params: params
    })
  },
  byPhone(phone) {
    return request({
      url: '/customerMassagistBlock/byPhone',
      method: 'get',
      params: {phone}
    })
  },
  create(data) {
    return request({
      url: '/customerMassagistBlock',
      method: 'post',
      data: data
    })
  },
  remove(id) {
    return request({
      url: `/customerMassagistBlock/${id}`,
      method: 'delete'
    })
  },
  count(customerIds) {
    return request({
      url: '/customerMassagistBlock/count',
      method: 'get',
      params: {customerIds: (customerIds || []).join(',')}
    })
  }
}
