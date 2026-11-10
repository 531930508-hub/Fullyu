import request from '@/utils/request'

export default {
  panel(shopId) {
    return request({ url: '/adminTodo/panel', method: 'get', params: { shopId } })
  },
  records(params) {
    return request({ url: '/adminTodo/records', method: 'get', params })
  },
  count(shopId) {
    return request({ url: '/adminTodo/count', method: 'get', params: { shopId } })
  },
  add(data) {
    return request({ url: '/adminTodo/add', method: 'post', data })
  },
  complete(data) {
    return request({ url: '/adminTodo/complete', method: 'post', data })
  },
  reopen(id) {
    return request({ url: '/adminTodo/reopen', method: 'post', data: { id } })
  }
}
