import request from '@/utils/request'

export default {
  schedulingMap(params) {
    return request({
      url: '/orderDetail/schedulingMap',
      method: 'get',
      params: params
    })
  },
  info(id) {
    return request({
      url: '/orderDetail/info',
      method: 'get',
      params: {id}
    })
  },
  updateOrderDetail(movedItem) {
    return request({
      url: '/orderDetail/update/order/detail',
      method: 'post',
      params: movedItem
    })
  },
  doingService(id) {
    return request({
      url: '/orderDetail/doing/service',
      method: 'put',
      params: {id}
    })
  },
  exceArganizeMassagist(id) {
    return request({
      url: '/orderDetail/doing/exceArganizeMassagist',
      method: 'put',
      params: {id}
    })
  },
  updateComment(id, comment) {
    return request({
      url: '/orderDetail/comment',
      method: 'put',
      params: {id, comment}
    })
  }
}
