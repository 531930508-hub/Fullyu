import request from '@/utils/request'

export default {
  unreadCount() {
    return request({url: '/adminMessage/unread-count', method: 'get'})
  },
  page(params) {
    return request({url: '/adminMessage/page', method: 'get', params})
  },
  markRead(id) {
    return request({url: `/adminMessage/${id}/read`, method: 'post'})
  },
  markAllRead() {
    return request({url: '/adminMessage/read-all', method: 'post'})
  }
}