import request from '@/utils/request'

export default {
  list(params) {
    return request({
      url: '/coupon/list',
      method: 'get',
      params
    })
  },
  saveOrUpd(data) {
    return request({
      url: '/coupon/saveOrUpd',
      method: 'post',
      data
    })
  },
  removeById(id) {
    return request({
      url: '/coupon/' + id,
      method: 'delete',
    })
  },
}
